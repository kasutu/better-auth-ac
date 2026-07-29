import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import { organization } from "better-auth/plugins";
import { SqliteDialect } from "kysely";
import { betterAuthAc, type ActiveMember } from "better-auth-ac";
import type { PermissionCatalog } from "@better-auth-ac/core";
import type Database from "better-sqlite3";
import { DATABASE, ensureExampleSchema } from "./database.js";
import { UpdatesService } from "./updates.service.js";

function activeMember(database: Database.Database, session: unknown): ActiveMember | null {
  const value = session as
    | {
        session?: { userId?: string; activeOrganizationId?: string | null };
      }
    | undefined;
  const userId = value?.session?.userId;
  const organizationId = value?.session?.activeOrganizationId;
  if (!userId || !organizationId) return null;
  const member = database
    .prepare("SELECT id, role FROM member WHERE userId = ? AND organizationId = ?")
    .get(userId, organizationId) as { id: string; role: string } | undefined;
  if (!member) return null;
  const teamIds = (
    database
      .prepare(
        `SELECT tm.teamId
         FROM teamMember tm
         JOIN team t ON t.id = tm.teamId
         WHERE tm.userId = ? AND t.organizationId = ?`,
      )
      .all(userId, organizationId) as Array<{ teamId: string }>
  ).map(({ teamId }) => teamId);
  return {
    userId,
    memberId: member.id,
    organizationId,
    teamIds,
    isOwner: member.role.split(",").includes("owner"),
  };
}

function iamUpdates(database: Database.Database, updates: UpdatesService): BetterAuthPlugin {
  const mutations = new Set([
    "/iam/roles/create",
    "/iam/roles/update",
    "/iam/roles/delete",
    "/iam/roles/set-permissions",
    "/iam/members/set-roles",
  ]);
  return {
    id: "pokemon-erp-iam-updates",
    hooks: {
      after: [
        {
          matcher: ({ path }) => mutations.has(path ?? ""),
          handler: createAuthMiddleware(async ({ context }) => {
            const actor = activeMember(database, context.session);
            if (actor) {
              updates.publish(actor.organizationId, ["roles", "members", "audit", "ability"]);
            }
          }),
        },
      ],
    },
  };
}

function createAuth(
  database: Database.Database,
  catalog: PermissionCatalog,
  updates: UpdatesService,
) {
  const webOrigin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173";
  const catalogToken = process.env.BETTER_AUTH_AC_CATALOG_TOKEN;
  return betterAuth({
    appName: "Pokémon Supplies ERP",
    database: {
      dialect: new SqliteDialect({ database }),
      type: "sqlite",
      transaction: true,
    },
    baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000/api/auth",
    secret: process.env.BETTER_AUTH_SECRET ?? "pokemon-erp-local-development-secret-change-me",
    trustedOrigins: [webOrigin],
    emailAndPassword: { enabled: true },
    plugins: [
      organization({ teams: { enabled: true } }),
      betterAuthAc({
        catalog,
        audit: async (event) => {
          database
            .prepare(
              `INSERT INTO iamAudit
                (id, type, actorId, organizationId, targetId, outcome, correlationId, occurredAt, data)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              crypto.randomUUID(),
              event.type,
              event.actorId,
              event.organizationId,
              event.targetId,
              event.outcome,
              event.correlationId,
              event.occurredAt,
              JSON.stringify(event.data),
            );
        },
        resolveActiveMember: async (session) => activeMember(database, session),
        ...(catalogToken
          ? {
              authorizeCatalogArtifact: (headers: Headers) => {
                const actual = Buffer.from(headers.get("authorization") ?? "");
                const expected = Buffer.from(`Bearer ${catalogToken}`);
                return actual.length === expected.length && timingSafeEqual(actual, expected);
              },
            }
          : {}),
        developmentTraces: process.env.NODE_ENV !== "production",
      }),
      iamUpdates(database, updates),
    ],
  });
}

interface AppAuth {
  options: BetterAuthOptions;
  api: {
    getSession(input: { headers: Headers }): Promise<unknown>;
    addMember(input: {
      body: { userId: string; organizationId: string; role: "member" };
    }): Promise<unknown>;
  };
}

@Injectable()
export class AuthService {
  private auth: AppAuth | null = null;
  private handler: ((request: IncomingMessage, response: ServerResponse) => Promise<void>) | null =
    null;

  constructor(
    @Inject(DATABASE) private readonly database: Database.Database,
    @Inject(UpdatesService) private readonly updates: UpdatesService,
  ) {}

  async initialize(catalog: PermissionCatalog): Promise<void> {
    const auth = createAuth(this.database, catalog, this.updates);
    this.auth = auth;
    await (await getMigrations(auth.options)).runMigrations();
    ensureExampleSchema(this.database);
    this.handler = toNodeHandler(auth);
  }

  private instance(): AppAuth {
    if (!this.auth) throw new Error("Better Auth is not initialized");
    return this.auth;
  }

  getSession(headers: Headers): Promise<unknown> {
    return this.instance().api.getSession({ headers });
  }

  addMember(input: {
    body: { userId: string; organizationId: string; role: "member" };
  }): Promise<unknown> {
    return this.instance().api.addMember(input);
  }

  handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.handler) throw new Error("Better Auth is not initialized");
    return this.handler(request, response);
  }

  resolveSession(session: unknown): ActiveMember | null {
    return activeMember(this.database, session);
  }
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { Inject, Injectable } from "@nestjs/common";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import { organization } from "better-auth/plugins";
import { betterAuthAc, type ActiveMember } from "better-auth-ac";
import type { PermissionCatalog } from "@better-auth-ac/core";
import type Database from "better-sqlite3";
import { DATABASE, ensureExampleSchema, SqliteIamStore } from "./database.js";

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

function createAuth(
  database: Database.Database,
  catalog: PermissionCatalog,
  store: SqliteIamStore,
) {
  const webOrigin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173";
  return betterAuth({
    appName: "Pokémon Supplies ERP",
    database,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000/api/auth",
    secret: process.env.BETTER_AUTH_SECRET ?? "pokemon-erp-local-development-secret-change-me",
    trustedOrigins: [webOrigin],
    emailAndPassword: { enabled: true },
    plugins: [
      organization({ teams: { enabled: true } }),
      betterAuthAc({
        catalog,
        store,
        resolveActiveMember: async (session) => activeMember(database, session),
        developmentTraces: process.env.NODE_ENV !== "production",
      }),
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
    @Inject(SqliteIamStore) private readonly store: SqliteIamStore,
  ) {}

  async initialize(catalog: PermissionCatalog): Promise<void> {
    const auth = createAuth(this.database, catalog, this.store);
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

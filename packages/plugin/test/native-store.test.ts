import { expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { organization } from "better-auth/plugins";
import Database from "better-sqlite3";
import { SqliteDialect } from "kysely";
import { defineCatalog } from "@better-auth-ac/core";
import { betterAuthAc, type ActiveMember } from "../src/index.js";

it("uses Better Auth SQLite for IAM data, audit, versions, and session invalidation", async () => {
  const sqlite = new Database(":memory:");
  let actor: ActiveMember | undefined;
  const plugin = betterAuthAc({
    catalog: defineCatalog([
      {
        key: "supply.read",
        name: "Read supplies",
        description: "Read supplies.",
        group: "Supplies",
        subject: "Supply",
        action: "read",
        scope: "organization",
      },
    ]),
    resolveActiveMember: async () => actor ?? null,
  });
  const auth = betterAuth({
    database: {
      dialect: new SqliteDialect({ database: sqlite }),
      type: "sqlite",
      transaction: true,
    },
    baseURL: "http://localhost:3000",
    secret: "native-store-integration-test-secret",
    plugins: [organization(), plugin],
  });
  await (await getMigrations(auth.options)).runMigrations();
  const context = await auth.$context;
  const db = context.adapter;
  const ownerUser = await db.create<{
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>({
    model: "user",
    data: {
      name: "Owner",
      email: "owner@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const organizationRow = await db.create<{ name: string; slug: string; createdAt: Date }>({
    model: "organization",
    data: { name: "Factory", slug: "factory", createdAt: new Date() },
  });
  const ownerMember = await db.create<{
    organizationId: string;
    userId: string;
    role: string;
    createdAt: Date;
  }>({
    model: "member",
    data: {
      organizationId: organizationRow.id,
      userId: ownerUser.id,
      role: "owner",
      createdAt: new Date(),
    },
  });
  const targetUser = await db.create<{
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>({
    model: "user",
    data: {
      name: "Target",
      email: "target@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const targetMember = await db.create<{
    organizationId: string;
    userId: string;
    role: string;
    createdAt: Date;
  }>({
    model: "member",
    data: {
      organizationId: organizationRow.id,
      userId: targetUser.id,
      role: "member",
      createdAt: new Date(),
    },
  });
  await db.create({
    model: "session",
    data: {
      userId: targetUser.id,
      token: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  actor = {
    userId: ownerUser.id,
    memberId: ownerMember.id,
    organizationId: organizationRow.id,
    teamIds: [],
    isOwner: true,
  };
  const endpointContext = {
    context: {
      ...context,
      session: {
        session: {
          id: "owner-session",
          userId: ownerUser.id,
          token: "owner-token",
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        user: ownerUser,
      },
    },
    headers: new Headers(),
    json: <T>(value: T) => value,
  };

  const role = await plugin.endpoints!.iamCreateRole({
    ...endpointContext,
    body: { name: "Operators", color: "#336699", rank: 10 },
  } as never);
  await plugin.endpoints!.iamSetRolePermissions({
    ...endpointContext,
    body: {
      roleId: role.id,
      expectedVersion: 0,
      effects: [{ key: "supply.read", effect: "ALLOW" }],
    },
  } as never);
  const updated = await plugin.endpoints!.iamUpdateRole({
    ...endpointContext,
    body: {
      roleId: role.id,
      expectedVersion: 1,
      name: "Line operators",
      color: "#336699",
      rank: 10,
    },
  } as never);
  await plugin.endpoints!.iamSetMemberRoles({
    ...endpointContext,
    body: { memberId: targetMember.id, roleIds: [role.id], expectedVersion: 0 },
  } as never);

  expect(
    await db.findMany({ model: "iamMemberRole", where: [{ field: "roleId", value: role.id }] }),
  ).toHaveLength(1);
  expect(
    await db.findOne<{ iamRoleVersion: number }>({
      model: "member",
      where: [{ field: "id", value: targetMember.id }],
    }),
  ).toMatchObject({ iamRoleVersion: 1 });
  expect(
    await db.findMany({ model: "session", where: [{ field: "userId", value: targetUser.id }] }),
  ).toHaveLength(0);

  await plugin.endpoints!.iamDeleteRole({
    ...endpointContext,
    body: { roleId: role.id, expectedVersion: updated.version },
  } as never);
  expect(
    (
      await db.findMany<{ type: string }>({
        model: "iamAudit",
        where: [{ field: "organizationId", value: organizationRow.id }],
      })
    ).map(({ type }) => type),
  ).toEqual([
    "IAM_ROLE_CREATED",
    "IAM_ROLE_PERMISSIONS_CHANGED",
    "IAM_ROLE_UPDATED",
    "IAM_MEMBER_ROLES_CHANGED",
    "IAM_ROLE_DELETED",
  ]);
  sqlite.close();
});

it("migrates an existing nullable member version safely", async () => {
  const sqlite = new Database(":memory:");
  const database = {
    dialect: new SqliteDialect({ database: sqlite }),
    type: "sqlite" as const,
    transaction: true,
  };
  const existing = betterAuth({
    database,
    baseURL: "http://localhost:3000",
    secret: "legacy-migration-test-secret",
    plugins: [organization()],
  });
  await (await getMigrations(existing.options)).runMigrations();
  const old = (await existing.$context).adapter;
  const user = await old.create({
    model: "user",
    data: {
      name: "Legacy",
      email: "legacy@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const org = await old.create({
    model: "organization",
    data: { name: "Legacy factory", slug: "legacy-factory", createdAt: new Date() },
  });
  const member = await old.create({
    model: "member",
    data: {
      organizationId: org.id,
      userId: user.id,
      role: "owner",
      createdAt: new Date(),
    },
  });

  const upgraded = betterAuth({
    database,
    baseURL: "http://localhost:3000",
    secret: "legacy-migration-test-secret",
    plugins: [
      organization(),
      betterAuthAc({
        catalog: defineCatalog([]),
        resolveActiveMember: async () => null,
      }),
    ],
  });
  await expect((await getMigrations(upgraded.options)).runMigrations()).resolves.toBeUndefined();

  const versionColumn = sqlite
    .prepare("PRAGMA table_info(member)")
    .all()
    .find((column) => (column as { name: string }).name === "iamRoleVersion") as
    { notnull: number } | undefined;
  expect(versionColumn).toMatchObject({ notnull: 0 });
  expect(
    sqlite.prepare("SELECT iamRoleVersion FROM member WHERE id = ?").get(member.id),
  ).toMatchObject({ iamRoleVersion: null });
  sqlite.close();
});

it("rejects a Better Auth adapter without real transactions", () => {
  const plugin = betterAuthAc({
    catalog: defineCatalog([]),
    resolveActiveMember: async () => null,
  });

  expect(() =>
    plugin.init?.({
      adapter: { options: { adapterConfig: { transaction: false } } },
      internalAdapter: {},
    } as never),
  ).toThrow("requires a Better Auth database adapter with transactions");
});

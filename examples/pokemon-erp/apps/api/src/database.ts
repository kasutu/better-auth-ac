import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { Inject, Injectable } from "@nestjs/common";
import type { AssignedRole, RolePermission } from "@better-auth-ac/core";
import {
  IamMutationError,
  type IamAuditEvent,
  type IamRole,
  type IamStore,
  type IamTransaction,
} from "better-auth-ac";

export const DATABASE = Symbol("pokemon-erp:database");

export function createDatabase(): Database.Database {
  const path = resolve(process.env.DATABASE_PATH ?? "examples/pokemon-erp/data/pokemon-erp.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  return database;
}

export function ensureExampleSchema(database: Database.Database): void {
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS iam_role_name_org_unique
      ON iamRole (organizationId, name);
    CREATE UNIQUE INDEX IF NOT EXISTS iam_role_permission_unique
      ON iamRolePermission (roleId, permissionKey);
    CREATE UNIQUE INDEX IF NOT EXISTS iam_member_role_unique
      ON iamMemberRole (memberId, roleId);

    CREATE TABLE IF NOT EXISTS iamMemberRoleVersion (
      memberId TEXT PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS iamAudit (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      actorId TEXT NOT NULL,
      organizationId TEXT NOT NULL,
      targetId TEXT NOT NULL,
      outcome TEXT NOT NULL,
      correlationId TEXT NOT NULL,
      occurredAt TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS supply (
      id TEXT PRIMARY KEY,
      organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      reorderLevel INTEGER NOT NULL DEFAULT 0,
      UNIQUE (organizationId, name)
    );

    CREATE TABLE IF NOT EXISTS productionOrder (
      id TEXT PRIMARY KEY,
      organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      product TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
}

type RoleRow = {
  id: string;
  organizationId: string;
  name: string;
  color: string;
  rank: number;
  isProtected: number;
  version: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function toRole(row: RoleRow): IamRole {
  return {
    ...row,
    isProtected: Boolean(row.isProtected),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

@Injectable()
export class SqliteIamStore implements IamStore {
  private queue = Promise.resolve();

  constructor(@Inject(DATABASE) private readonly database: Database.Database) {}

  transaction<T>(work: (transaction: IamTransaction) => Promise<T>): Promise<T> {
    // ponytail: one writer queue fits this SQLite demo; use a database pool for production.
    const result = this.queue.then(async () => {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        const value = await work(this.api());
        this.database.exec("COMMIT");
        return value;
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    });
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private role(roleId: string): IamRole {
    const row = this.database.prepare("SELECT * FROM iamRole WHERE id = ?").get(roleId) as
      RoleRow | undefined;
    if (!row) throw new IamMutationError("Role not found", "NOT_FOUND");
    return toRole(row);
  }

  private replaceMemberRoles(memberId: string, roleIds: readonly string[]): void {
    this.database.prepare("DELETE FROM iamMemberRole WHERE memberId = ?").run(memberId);
    const insert = this.database.prepare(
      "INSERT INTO iamMemberRole (id, memberId, roleId) VALUES (?, ?, ?)",
    );
    for (const roleId of roleIds) insert.run(randomUUID(), memberId, roleId);
  }

  private api(): IamTransaction {
    return {
      listRoles: async (organizationId) =>
        (
          this.database
            .prepare("SELECT * FROM iamRole WHERE organizationId = ? ORDER BY rank, name")
            .all(organizationId) as RoleRow[]
        ).map(toRole),
      getRole: async (organizationId, roleId) => {
        const row = this.database
          .prepare("SELECT * FROM iamRole WHERE id = ? AND organizationId = ?")
          .get(roleId, organizationId) as RoleRow | undefined;
        return row ? toRole(row) : null;
      },
      createRole: async (input) => {
        const id = randomUUID();
        const now = new Date().toISOString();
        this.database
          .prepare(
            `INSERT INTO iamRole
              (id, organizationId, name, color, rank, isProtected, version, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          )
          .run(
            id,
            input.organizationId,
            input.name,
            input.color,
            input.rank,
            Number(input.isProtected),
            now,
            now,
          );
        return this.role(id);
      },
      updateRole: async (roleId, expectedVersion, patch) => {
        const result = this.database
          .prepare(
            `UPDATE iamRole
             SET name = ?, color = ?, rank = ?, version = version + 1, updatedAt = ?
             WHERE id = ? AND version = ?`,
          )
          .run(
            patch.name,
            patch.color,
            patch.rank,
            new Date().toISOString(),
            roleId,
            expectedVersion,
          );
        if (result.changes !== 1) throw new IamMutationError("Stale role version", "CONFLICT");
        return this.role(roleId);
      },
      deleteRole: async (roleId, expectedVersion) => {
        const result = this.database
          .prepare("DELETE FROM iamRole WHERE id = ? AND version = ?")
          .run(roleId, expectedVersion);
        if (result.changes !== 1) throw new IamMutationError("Stale role version", "CONFLICT");
      },
      getRolePermissions: async (roleId) =>
        this.database
          .prepare(
            "SELECT permissionKey AS key, effect FROM iamRolePermission WHERE roleId = ? ORDER BY permissionKey",
          )
          .all(roleId) as RolePermission[],
      setRolePermissions: async (roleId, expectedVersion, effects) => {
        const result = this.database
          .prepare(
            "UPDATE iamRole SET version = version + 1, updatedAt = ? WHERE id = ? AND version = ?",
          )
          .run(new Date().toISOString(), roleId, expectedVersion);
        if (result.changes !== 1) throw new IamMutationError("Stale role version", "CONFLICT");
        this.database.prepare("DELETE FROM iamRolePermission WHERE roleId = ?").run(roleId);
        const insert = this.database.prepare(
          "INSERT INTO iamRolePermission (id, roleId, permissionKey, effect) VALUES (?, ?, ?, ?)",
        );
        for (const effect of effects) {
          insert.run(randomUUID(), roleId, effect.key, effect.effect);
        }
        return this.role(roleId);
      },
      getMemberRoles: async (organizationId, memberId) => {
        const rows = this.database
          .prepare(
            `SELECT r.id, r.organizationId, r.name, r.rank,
                    p.permissionKey, p.effect
             FROM iamMemberRole mr
             JOIN iamRole r ON r.id = mr.roleId
             LEFT JOIN iamRolePermission p ON p.roleId = r.id
             WHERE mr.memberId = ? AND r.organizationId = ?
             ORDER BY r.id, p.permissionKey`,
          )
          .all(memberId, organizationId) as Array<{
          id: string;
          organizationId: string;
          name: string;
          rank: number;
          permissionKey: string | null;
          effect: RolePermission["effect"] | null;
        }>;
        const roles = new Map<string, AssignedRole>();
        for (const row of rows) {
          const role = roles.get(row.id) ?? {
            id: row.id,
            organizationId: row.organizationId,
            name: row.name,
            rank: row.rank,
            permissions: [],
          };
          if (row.permissionKey && row.effect) {
            (role.permissions as RolePermission[]).push({
              key: row.permissionKey,
              effect: row.effect,
            });
          }
          roles.set(row.id, role);
        }
        return [...roles.values()];
      },
      setMemberRoles: async (organizationId, memberId, expectedVersion, roleIds) => {
        const current = this.database
          .prepare("SELECT version FROM iamMemberRoleVersion WHERE memberId = ?")
          .get(memberId) as { version: number } | undefined;
        if ((current?.version ?? 0) !== expectedVersion) {
          throw new IamMutationError("Stale member-role version", "CONFLICT");
        }
        if (current) {
          this.database
            .prepare(
              "UPDATE iamMemberRoleVersion SET version = version + 1 WHERE memberId = ? AND version = ?",
            )
            .run(memberId, expectedVersion);
        } else {
          this.database
            .prepare("INSERT INTO iamMemberRoleVersion (memberId, version) VALUES (?, 1)")
            .run(memberId);
        }
        this.replaceMemberRoles(memberId, roleIds);
        return {
          version: expectedVersion + 1,
          roles: await this.api().getMemberRoles(organizationId, memberId),
        };
      },
      getMemberRoleVersion: async (_organizationId, memberId) => {
        const row = this.database
          .prepare("SELECT version FROM iamMemberRoleVersion WHERE memberId = ?")
          .get(memberId) as { version: number } | undefined;
        return row?.version ?? 0;
      },
      listMemberIdsForRole: async (roleId) =>
        (
          this.database
            .prepare("SELECT memberId FROM iamMemberRole WHERE roleId = ? ORDER BY memberId")
            .all(roleId) as Array<{ memberId: string }>
        ).map(({ memberId }) => memberId),
      audit: async (event: IamAuditEvent) => {
        this.database
          .prepare(
            `INSERT INTO iamAudit
              (id, type, actorId, organizationId, targetId, outcome, correlationId, occurredAt, data)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            randomUUID(),
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
      invalidateSessions: async (memberIds) => {
        if (!memberIds.length) return;
        const placeholders = memberIds.map(() => "?").join(",");
        const users = this.database
          .prepare(`SELECT userId FROM member WHERE id IN (${placeholders})`)
          .all(...memberIds) as Array<{ userId: string }>;
        const remove = this.database.prepare("DELETE FROM session WHERE userId = ?");
        for (const { userId } of users) remove.run(userId);
      },
    };
  }
}

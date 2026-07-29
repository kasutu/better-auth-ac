import type { BetterAuthPlugin } from "better-auth";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import {
  assertKnownEffects,
  assertRoleMutation,
  diffEffects,
  evaluate,
  type AssignedRole,
  type Decision,
  type PermissionCatalog,
  type PermissionEffect,
  type RolePermission,
} from "@better-auth-ac/core";
import { toCaslRules } from "@better-auth-ac/casl";

export interface IamRole {
  id: string;
  organizationId: string;
  name: string;
  color: string;
  rank: number;
  isProtected: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IamRoleWithPermissions extends IamRole {
  permissions: RolePermission[];
}

export interface ActiveMember {
  userId: string;
  memberId: string;
  organizationId: string;
  teamIds: readonly string[];
  isOwner: boolean;
}

export type AuditEventType =
  | "IAM_ROLE_CREATED"
  | "IAM_ROLE_UPDATED"
  | "IAM_ROLE_DELETED"
  | "IAM_ROLE_PERMISSIONS_CHANGED"
  | "IAM_MEMBER_ROLES_CHANGED";

export interface IamAuditEvent {
  type: AuditEventType;
  actorId: string;
  organizationId: string;
  targetId: string;
  outcome: "SUCCESS";
  correlationId: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

export interface IamTransaction {
  listRoles(organizationId: string): Promise<IamRole[]>;
  getRole(organizationId: string, roleId: string): Promise<IamRole | null>;
  createRole(input: Omit<IamRole, "id" | "version" | "createdAt" | "updatedAt">): Promise<IamRole>;
  updateRole(
    roleId: string,
    expectedVersion: number,
    patch: Pick<IamRole, "name" | "color" | "rank">,
  ): Promise<IamRole>;
  deleteRole(roleId: string, expectedVersion: number): Promise<void>;
  getRolePermissions(roleId: string): Promise<RolePermission[]>;
  setRolePermissions(
    roleId: string,
    expectedVersion: number,
    effects: readonly RolePermission[],
  ): Promise<IamRole>;
  getMemberRoles(organizationId: string, memberId: string): Promise<AssignedRole[]>;
  setMemberRoles(
    organizationId: string,
    memberId: string,
    expectedVersion: number,
    roleIds: readonly string[],
  ): Promise<{ version: number; roles: AssignedRole[] }>;
  getMemberRoleVersion(organizationId: string, memberId: string): Promise<number>;
  listMemberIdsForRole(roleId: string): Promise<string[]>;
  audit(event: IamAuditEvent): Promise<void>;
  invalidateSessions(memberIds: readonly string[]): Promise<void>;
}

export interface IamStore {
  transaction<T>(work: (transaction: IamTransaction) => Promise<T>): Promise<T>;
}

export interface BetterAuthAcOptions {
  catalog: PermissionCatalog;
  store: IamStore;
  resolveActiveMember(session: unknown): Promise<ActiveMember | null>;
  correlationId?(headers: Headers): string;
  developmentTraces?: boolean;
}

export class IamMutationError extends Error {
  constructor(
    message: string,
    readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID_INPUT",
  ) {
    super(message);
    this.name = "IamMutationError";
  }
}

const roleInput = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  rank: z.number().int().min(1).max(1_000_000),
});
const versionedRole = z.object({
  roleId: z.string().min(1),
  expectedVersion: z.number().int().min(0),
});
const effectInput = z.object({
  key: z.string().min(1),
  effect: z.enum(["ALLOW", "DENY"]),
});

function effective(
  catalog: PermissionCatalog,
  roles: readonly AssignedRole[],
  actor: ActiveMember,
) {
  return catalog.permissions.map((permission) =>
    evaluate({
      permission,
      roles,
      organizationId: actor.organizationId,
      teamIds: actor.teamIds,
    }),
  );
}

function auditEvent(
  type: AuditEventType,
  actor: ActiveMember,
  targetId: string,
  correlationId: string,
  data: Record<string, unknown>,
): IamAuditEvent {
  return {
    type,
    actorId: actor.userId,
    organizationId: actor.organizationId,
    targetId,
    outcome: "SUCCESS",
    correlationId,
    occurredAt: new Date().toISOString(),
    data,
  };
}

export class IamService {
  constructor(
    private readonly catalog: PermissionCatalog,
    private readonly store: IamStore,
  ) {}

  private async actorBoundary(transaction: IamTransaction, actor: ActiveMember) {
    const roles = await transaction.getMemberRoles(actor.organizationId, actor.memberId);
    const decisions = effective(this.catalog, roles, actor);
    return {
      roles,
      decisions,
      boundary: {
        organizationId: actor.organizationId,
        rank: roles.length ? Math.min(...roles.map(({ rank }) => rank)) : Number.MAX_SAFE_INTEGER,
        isOwner: actor.isOwner,
        permissions: decisions.filter(({ allowed }) => allowed).map(({ key }) => key),
      },
    };
  }

  private require(decisions: readonly Decision[], key: string, isOwner: boolean): void {
    if (!isOwner && !decisions.some((decision) => decision.key === key && decision.allowed)) {
      throw new IamMutationError(`Missing permission: ${key}`, "FORBIDDEN");
    }
  }

  listRoles(actor: ActiveMember): Promise<IamRoleWithPermissions[]> {
    return this.store.transaction(async (transaction) => {
      const { decisions } = await this.actorBoundary(transaction, actor);
      this.require(decisions, "iam.role.read", actor.isOwner);
      const roles = await transaction.listRoles(actor.organizationId);
      return Promise.all(
        roles.map(async (role) => ({
          ...role,
          permissions: await transaction.getRolePermissions(role.id),
        })),
      );
    });
  }

  createRole(
    actor: ActiveMember,
    input: z.infer<typeof roleInput>,
    correlationId: string,
  ): Promise<IamRole> {
    return this.store.transaction(async (transaction) => {
      const { decisions, boundary } = await this.actorBoundary(transaction, actor);
      this.require(decisions, "iam.role.manage", actor.isOwner);
      assertRoleMutation(boundary, {
        organizationId: actor.organizationId,
        rank: input.rank,
        isProtected: false,
      });
      const role = await transaction.createRole({
        ...input,
        organizationId: actor.organizationId,
        isProtected: false,
      });
      await transaction.audit(
        auditEvent("IAM_ROLE_CREATED", actor, role.id, correlationId, {
          rank: role.rank,
          version: role.version,
        }),
      );
      return role;
    });
  }

  updateRole(
    actor: ActiveMember,
    input: z.infer<typeof roleInput> & z.infer<typeof versionedRole>,
    correlationId: string,
  ): Promise<IamRole> {
    return this.store.transaction(async (transaction) => {
      const { decisions, boundary } = await this.actorBoundary(transaction, actor);
      this.require(decisions, "iam.role.manage", actor.isOwner);
      const target = await transaction.getRole(actor.organizationId, input.roleId);
      if (!target) throw new IamMutationError("Role not found", "NOT_FOUND");
      assertRoleMutation(boundary, target);
      assertRoleMutation(boundary, { ...target, rank: input.rank });
      const role = await transaction.updateRole(input.roleId, input.expectedVersion, input);
      await transaction.audit(
        auditEvent("IAM_ROLE_UPDATED", actor, role.id, correlationId, {
          fromVersion: input.expectedVersion,
          toVersion: role.version,
        }),
      );
      return role;
    });
  }

  deleteRole(
    actor: ActiveMember,
    input: z.infer<typeof versionedRole>,
    correlationId: string,
  ): Promise<void> {
    return this.store.transaction(async (transaction) => {
      const { decisions, boundary } = await this.actorBoundary(transaction, actor);
      this.require(decisions, "iam.role.manage", actor.isOwner);
      const target = await transaction.getRole(actor.organizationId, input.roleId);
      if (!target) throw new IamMutationError("Role not found", "NOT_FOUND");
      assertRoleMutation(boundary, target);
      const members = await transaction.listMemberIdsForRole(target.id);
      await transaction.deleteRole(target.id, input.expectedVersion);
      await transaction.invalidateSessions(members);
      await transaction.audit(
        auditEvent("IAM_ROLE_DELETED", actor, target.id, correlationId, {
          version: input.expectedVersion,
        }),
      );
    });
  }

  setRolePermissions(
    actor: ActiveMember,
    input: z.infer<typeof versionedRole> & { effects: RolePermission[] },
    correlationId: string,
  ): Promise<IamRole> {
    return this.store.transaction(async (transaction) => {
      const effects = [...input.effects].sort((a, b) => a.key.localeCompare(b.key));
      assertKnownEffects(this.catalog, effects);
      const { decisions, boundary } = await this.actorBoundary(transaction, actor);
      this.require(decisions, "iam.role.manage", actor.isOwner);
      const target = await transaction.getRole(actor.organizationId, input.roleId);
      if (!target) throw new IamMutationError("Role not found", "NOT_FOUND");
      const allowedKeys = effects.filter(({ effect }) => effect === "ALLOW").map(({ key }) => key);
      assertRoleMutation(boundary, target, allowedKeys);
      const before = (await transaction.getRolePermissions(target.id)).sort((a, b) =>
        a.key.localeCompare(b.key),
      );
      if (JSON.stringify(before) === JSON.stringify(effects)) return target;
      const role = await transaction.setRolePermissions(target.id, input.expectedVersion, effects);
      const members = await transaction.listMemberIdsForRole(target.id);
      await transaction.invalidateSessions(members);
      await transaction.audit(
        auditEvent("IAM_ROLE_PERMISSIONS_CHANGED", actor, target.id, correlationId, {
          ...diffEffects(before, effects),
          fromVersion: input.expectedVersion,
          toVersion: role.version,
        }),
      );
      return role;
    });
  }

  setMemberRoles(
    actor: ActiveMember,
    input: { memberId: string; roleIds: string[]; expectedVersion: number },
    correlationId: string,
  ): Promise<{ version: number; roles: AssignedRole[] }> {
    return this.store.transaction(async (transaction) => {
      const { decisions, boundary } = await this.actorBoundary(transaction, actor);
      this.require(decisions, "iam.member-role.manage", actor.isOwner);
      const roleIds = [...new Set(input.roleIds)].sort();
      for (const roleId of roleIds) {
        const role = await transaction.getRole(actor.organizationId, roleId);
        if (!role) throw new IamMutationError("Role not found", "NOT_FOUND");
        assertRoleMutation(
          boundary,
          role,
          (await transaction.getRolePermissions(role.id))
            .filter(({ effect }) => effect === "ALLOW")
            .map(({ key }) => key),
        );
      }
      const currentRoles = await transaction.getMemberRoles(actor.organizationId, input.memberId);
      if (JSON.stringify(currentRoles.map(({ id }) => id).sort()) === JSON.stringify(roleIds)) {
        return {
          version: await transaction.getMemberRoleVersion(actor.organizationId, input.memberId),
          roles: currentRoles,
        };
      }
      const result = await transaction.setMemberRoles(
        actor.organizationId,
        input.memberId,
        input.expectedVersion,
        roleIds,
      );
      await transaction.invalidateSessions([input.memberId]);
      await transaction.audit(
        auditEvent("IAM_MEMBER_ROLES_CHANGED", actor, input.memberId, correlationId, {
          roleIds,
          fromVersion: input.expectedVersion,
          toVersion: result.version,
        }),
      );
      return result;
    });
  }

  memberRoles(actor: ActiveMember, memberId: string) {
    return this.store.transaction(async (transaction) => {
      const { decisions } = await this.actorBoundary(transaction, actor);
      this.require(decisions, "iam.role.read", actor.isOwner);
      const roles = await transaction.getMemberRoles(actor.organizationId, memberId);
      return {
        version: await transaction.getMemberRoleVersion(actor.organizationId, memberId),
        roles,
        decisions: effective(this.catalog, roles, { ...actor, memberId }),
      };
    });
  }

  ability(actor: ActiveMember, developmentTraces = false) {
    return this.store.transaction(async (transaction) => {
      const roles = await transaction.getMemberRoles(actor.organizationId, actor.memberId);
      const decisions = actor.isOwner
        ? this.catalog.permissions.map(({ key }): Decision => ({
            key,
            effect: "ALLOW",
            allowed: true,
            reason: "The organization owner has this permission.",
            trace: [],
          }))
        : effective(this.catalog, roles, actor);
      return {
        ...toCaslRules(this.catalog, decisions),
        ...(developmentTraces ? { decisions } : {}),
      };
    });
  }
}

function toApiError(error: unknown): never {
  if (error instanceof IamMutationError) {
    const status =
      error.code === "UNAUTHENTICATED"
        ? "UNAUTHORIZED"
        : error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : error.code === "CONFLICT"
              ? "CONFLICT"
              : "BAD_REQUEST";
    throw new APIError(status, { message: error.message });
  }
  if (error instanceof z.ZodError) {
    throw new APIError("BAD_REQUEST", { message: "Invalid IAM request" });
  }
  throw error;
}

export function betterAuthAc(options: BetterAuthAcOptions) {
  const service = new IamService(options.catalog, options.store);
  const actor = async (session: unknown) => {
    const active = await options.resolveActiveMember(session);
    if (!active) throw new IamMutationError("No active organization member", "UNAUTHENTICATED");
    return active;
  };
  const correlation = (headers?: Headers) => {
    const requestHeaders = headers ?? new Headers();
    return (
      options.correlationId?.(requestHeaders) ??
      requestHeaders.get("x-request-id") ??
      crypto.randomUUID()
    );
  };

  return {
    id: "better-auth-ac",
    schema: {
      iamRole: {
        fields: {
          organizationId: {
            type: "string",
            references: { model: "organization", field: "id", onDelete: "cascade" },
          },
          name: { type: "string" },
          color: { type: "string" },
          rank: { type: "number" },
          isProtected: { type: "boolean" },
          version: { type: "number" },
          createdAt: { type: "date" },
          updatedAt: { type: "date" },
        },
      },
      iamRolePermission: {
        fields: {
          roleId: {
            type: "string",
            references: { model: "iamRole", field: "id", onDelete: "cascade" },
          },
          permissionKey: { type: "string" },
          effect: { type: "string" },
        },
      },
      iamMemberRole: {
        fields: {
          memberId: {
            type: "string",
            references: { model: "member", field: "id", onDelete: "cascade" },
          },
          roleId: {
            type: "string",
            references: { model: "iamRole", field: "id", onDelete: "cascade" },
          },
        },
      },
    },
    endpoints: {
      iamCatalog: createAuthEndpoint(
        "/iam/catalog",
        { method: "GET", use: [sessionMiddleware] },
        async (ctx) => {
          await actor(ctx.context.session);
          return ctx.json(options.catalog);
        },
      ),
      iamListRoles: createAuthEndpoint(
        "/iam/roles",
        { method: "GET", use: [sessionMiddleware] },
        async (ctx) => {
          try {
            return ctx.json({ roles: await service.listRoles(await actor(ctx.context.session)) });
          } catch (error) {
            toApiError(error);
          }
        },
      ),
      iamCreateRole: createAuthEndpoint(
        "/iam/roles/create",
        { method: "POST", body: roleInput, use: [sessionMiddleware] },
        async (ctx) => {
          try {
            return ctx.json(
              await service.createRole(
                await actor(ctx.context.session),
                ctx.body,
                correlation(ctx.headers),
              ),
            );
          } catch (error) {
            toApiError(error);
          }
        },
      ),
      iamUpdateRole: createAuthEndpoint(
        "/iam/roles/update",
        { method: "POST", body: roleInput.and(versionedRole), use: [sessionMiddleware] },
        async (ctx) => {
          try {
            return ctx.json(
              await service.updateRole(
                await actor(ctx.context.session),
                ctx.body,
                correlation(ctx.headers),
              ),
            );
          } catch (error) {
            toApiError(error);
          }
        },
      ),
      iamDeleteRole: createAuthEndpoint(
        "/iam/roles/delete",
        { method: "POST", body: versionedRole, use: [sessionMiddleware] },
        async (ctx) => {
          try {
            await service.deleteRole(
              await actor(ctx.context.session),
              ctx.body,
              correlation(ctx.headers),
            );
            return ctx.json({ success: true });
          } catch (error) {
            toApiError(error);
          }
        },
      ),
      iamSetRolePermissions: createAuthEndpoint(
        "/iam/roles/set-permissions",
        {
          method: "POST",
          body: versionedRole.extend({ effects: z.array(effectInput).max(10_000) }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          try {
            return ctx.json(
              await service.setRolePermissions(
                await actor(ctx.context.session),
                ctx.body,
                correlation(ctx.headers),
              ),
            );
          } catch (error) {
            toApiError(error);
          }
        },
      ),
      iamSetMemberRoles: createAuthEndpoint(
        "/iam/members/set-roles",
        {
          method: "POST",
          body: z.object({
            memberId: z.string().min(1),
            roleIds: z.array(z.string().min(1)).max(100),
            expectedVersion: z.number().int().min(0),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          try {
            return ctx.json(
              await service.setMemberRoles(
                await actor(ctx.context.session),
                ctx.body,
                correlation(ctx.headers),
              ),
            );
          } catch (error) {
            toApiError(error);
          }
        },
      ),
      iamMemberRoles: createAuthEndpoint(
        "/iam/member/roles",
        {
          method: "GET",
          query: z.object({ memberId: z.string().min(1) }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          try {
            return ctx.json(
              await service.memberRoles(await actor(ctx.context.session), ctx.query.memberId),
            );
          } catch (error) {
            toApiError(error);
          }
        },
      ),
      iamAbility: createAuthEndpoint(
        "/iam/me/ability",
        { method: "GET", use: [sessionMiddleware] },
        async (ctx) => {
          try {
            return ctx.json(
              await service.ability(
                await actor(ctx.context.session),
                options.developmentTraces === true,
              ),
            );
          } catch (error) {
            toApiError(error);
          }
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

export const betterAuthAcClient = () =>
  ({
    id: "better-auth-ac",
    $InferServerPlugin: {} as ReturnType<typeof betterAuthAc>,
  }) satisfies BetterAuthClientPlugin;

export type { PermissionEffect };

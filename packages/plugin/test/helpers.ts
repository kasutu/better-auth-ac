import type { AssignedRole, RolePermission } from "@better-auth-ac/core";
import {
  IamMutationError,
  type IamAuditEvent,
  type IamRole,
  type IamStore,
  type IamTransaction,
} from "../src/index.js";

export class MemoryStore implements IamStore {
  roles = new Map<string, IamRole>();
  permissions = new Map<string, RolePermission[]>();
  memberRoles = new Map<string, string[]>();
  memberVersions = new Map<string, number>();
  audits: IamAuditEvent[] = [];
  invalidations: string[][] = [];

  async transaction<T>(work: (transaction: IamTransaction) => Promise<T>): Promise<T> {
    return work(this.transactionApi());
  }

  private key(organizationId: string, memberId: string): string {
    return `${organizationId}:${memberId}`;
  }

  private assigned(organizationId: string, memberId: string): AssignedRole[] {
    return (this.memberRoles.get(this.key(organizationId, memberId)) ?? []).flatMap((id) => {
      const role = this.roles.get(id);
      return role && role.organizationId === organizationId
        ? [
            {
              id: role.id,
              organizationId: role.organizationId,
              name: role.name,
              rank: role.rank,
              permissions: this.permissions.get(role.id) ?? [],
            },
          ]
        : [];
    });
  }

  private checkVersion(role: IamRole, expectedVersion: number): void {
    if (role.version !== expectedVersion) throw new IamMutationError("Stale version", "CONFLICT");
  }

  private transactionApi(): IamTransaction {
    return {
      listRoles: async (organizationId) =>
        [...this.roles.values()].filter((role) => role.organizationId === organizationId),
      getRole: async (organizationId, roleId) => {
        const role = this.roles.get(roleId);
        return role?.organizationId === organizationId ? role : null;
      },
      createRole: async (input) => {
        if (
          [...this.roles.values()].some(
            (role) => role.organizationId === input.organizationId && role.name === input.name,
          )
        ) {
          throw new IamMutationError("Duplicate role name", "CONFLICT");
        }
        const now = new Date();
        const role: IamRole = {
          ...input,
          id: `role-${this.roles.size + 1}`,
          version: 0,
          createdAt: now,
          updatedAt: now,
        };
        this.roles.set(role.id, role);
        return role;
      },
      updateRole: async (roleId, expectedVersion, patch) => {
        const role = this.roles.get(roleId);
        if (!role) throw new IamMutationError("Role not found", "NOT_FOUND");
        this.checkVersion(role, expectedVersion);
        const updated = { ...role, ...patch, version: role.version + 1, updatedAt: new Date() };
        this.roles.set(roleId, updated);
        return updated;
      },
      deleteRole: async (roleId, expectedVersion) => {
        const role = this.roles.get(roleId);
        if (!role) throw new IamMutationError("Role not found", "NOT_FOUND");
        this.checkVersion(role, expectedVersion);
        this.roles.delete(roleId);
        this.permissions.delete(roleId);
        for (const [key, roles] of this.memberRoles) {
          this.memberRoles.set(
            key,
            roles.filter((id) => id !== roleId),
          );
        }
      },
      getRolePermissions: async (roleId) => this.permissions.get(roleId) ?? [],
      setRolePermissions: async (roleId, expectedVersion, effects) => {
        const role = this.roles.get(roleId);
        if (!role) throw new IamMutationError("Role not found", "NOT_FOUND");
        this.checkVersion(role, expectedVersion);
        this.permissions.set(roleId, [...effects]);
        const updated = { ...role, version: role.version + 1, updatedAt: new Date() };
        this.roles.set(roleId, updated);
        return updated;
      },
      getMemberRoles: async (organizationId, memberId) => this.assigned(organizationId, memberId),
      setMemberRoles: async (organizationId, memberId, expectedVersion, roleIds) => {
        const key = this.key(organizationId, memberId);
        const version = this.memberVersions.get(key) ?? 0;
        if (version !== expectedVersion) throw new IamMutationError("Stale version", "CONFLICT");
        this.memberRoles.set(key, [...roleIds]);
        this.memberVersions.set(key, version + 1);
        return { version: version + 1, roles: this.assigned(organizationId, memberId) };
      },
      getMemberRoleVersion: async (organizationId, memberId) =>
        this.memberVersions.get(this.key(organizationId, memberId)) ?? 0,
      listMemberIdsForRole: async (roleId) =>
        [...this.memberRoles].flatMap(([key, roleIds]) =>
          roleIds.includes(roleId) ? [key.slice(key.indexOf(":") + 1)] : [],
        ),
      audit: async (event) => {
        this.audits.push(event);
      },
      invalidateSessions: async (memberIds) => {
        this.invalidations.push([...memberIds]);
      },
    };
  }
}

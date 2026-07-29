import { Inject, Injectable } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type Database from "better-sqlite3";
import {
  PermissionCatalogService,
  type AuthorizationContextResolver,
  type VerifiedAuthorizationContext,
} from "@better-auth-ac/nest";
import type { AssignedRole, RolePermission } from "@better-auth-ac/core";
import { DATABASE } from "./database.js";
import { SessionService } from "./session.service.js";

@Injectable()
export class PermissionContextResolver implements AuthorizationContextResolver {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(DATABASE) private readonly database: Database.Database,
    @Inject(PermissionCatalogService) private readonly catalog: PermissionCatalogService,
  ) {}

  async resolve(context: ExecutionContext): Promise<VerifiedAuthorizationContext | null> {
    const request = context.switchToHttp().getRequest<Request>();
    const actor = await this.sessions.active(request);
    const roles = actor.isOwner
      ? [this.ownerRole(actor.organizationId)]
      : this.memberRoles(actor.organizationId, actor.memberId);
    return {
      organizationId: actor.organizationId,
      teamIds: actor.teamIds,
      roles,
    };
  }

  private memberRoles(organizationId: string, memberId: string): AssignedRole[] {
    const rows = this.database
      .prepare(
        `SELECT r.id, r.organizationId, r.name, r.rank, p.permissionKey, p.effect
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
  }

  private ownerRole(organizationId: string): AssignedRole {
    return {
      id: "organization-owner",
      organizationId,
      name: "Organization owner",
      rank: 0,
      permissions: this.catalog
        .getCatalog()
        .permissions.map(({ key }) => ({ key, effect: "ALLOW" as const })),
    };
  }
}

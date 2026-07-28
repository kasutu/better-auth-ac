import { Inject, Injectable } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import {
  PermissionCatalogService,
  type AuthorizationContextResolver,
  type VerifiedAuthorizationContext,
} from "@better-auth-ac/nest";
import type { AssignedRole } from "@better-auth-ac/core";
import { SqliteIamStore } from "./database.js";
import { SessionService } from "./session.service.js";

@Injectable()
export class PermissionContextResolver implements AuthorizationContextResolver {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(SqliteIamStore) private readonly store: SqliteIamStore,
    @Inject(PermissionCatalogService) private readonly catalog: PermissionCatalogService,
  ) {}

  async resolve(context: ExecutionContext): Promise<VerifiedAuthorizationContext | null> {
    const request = context.switchToHttp().getRequest<Request>();
    const actor = await this.sessions.active(request);
    const roles = actor.isOwner
      ? [this.ownerRole(actor.organizationId)]
      : await this.store.transaction((transaction) =>
          transaction.getMemberRoles(actor.organizationId, actor.memberId),
        );
    return {
      organizationId: actor.organizationId,
      teamIds: actor.teamIds,
      roles,
    };
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

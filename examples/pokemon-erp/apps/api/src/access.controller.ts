import { Controller, Get, Post } from "@nestjs/common";
import { Permission, PermissionGroup } from "@better-auth-ac/nest";

@PermissionGroup("iam")
@Controller("api/access")
export class AccessController {
  @Permission("role.read", {
    name: "Read roles",
    description: "View organization roles and permission effects.",
    subject: "IamRole",
    action: "read",
    scope: "organization",
  })
  @Get("roles")
  canReadRoles() {
    return { allowed: true };
  }

  @Permission("role.manage", {
    name: "Manage roles",
    description: "Create, update, and delete lower-ranked roles.",
    subject: "IamRole",
    action: "manage",
    scope: "organization",
  })
  @Post("roles")
  canManageRoles() {
    return { allowed: true };
  }

  @Permission("member-role.manage", {
    name: "Assign member roles",
    description: "Assign lower-ranked roles to organization members.",
    subject: "IamMemberRole",
    action: "manage",
    scope: "organization",
  })
  @Post("member-roles")
  canAssignMemberRoles() {
    return { allowed: true };
  }
}

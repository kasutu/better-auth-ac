import { expect, it } from "vitest";
import { defineCatalog } from "@better-auth-ac/core";
import { IamService, type ActiveMember, type IamRole } from "../src/index.js";
import { MemoryStore } from "./helpers.js";

const catalog = defineCatalog([
  {
    key: "iam.role.manage",
    name: "Manage roles",
    description: "Manage lower roles.",
    group: "IAM",
    subject: "IamRole",
    action: "manage",
    scope: "organization",
  },
  {
    key: "secret.read",
    name: "Read secrets",
    description: "Read organization secrets.",
    group: "Secrets",
    subject: "Secret",
    action: "read",
    scope: "organization",
  },
]);

it("blocks cross-tenant access, rank bypass, protected roles, and self-escalation", async () => {
  const store = new MemoryStore();
  const actorRole: IamRole = {
    id: "actor-role",
    organizationId: "org-1",
    name: "Manager",
    color: "#000000",
    rank: 10,
    isProtected: false,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.roles.set(actorRole.id, actorRole);
  store.permissions.set(actorRole.id, [{ key: "iam.role.manage", effect: "ALLOW" }]);
  store.memberRoles.set("org-1:actor-member", [actorRole.id]);
  const actor: ActiveMember = {
    userId: "actor",
    memberId: "actor-member",
    organizationId: "org-1",
    teamIds: [],
    isOwner: false,
  };
  const service = new IamService(catalog, store);

  await expect(
    service.createRole(actor, { name: "Too high", color: "#ffffff", rank: 1 }, "request"),
  ).rejects.toThrow("not below");

  const target = { ...actorRole, id: "target", name: "Target", rank: 20, isProtected: true };
  store.roles.set(target.id, target);
  await expect(
    service.setRolePermissions(
      actor,
      {
        roleId: target.id,
        expectedVersion: 0,
        effects: [{ key: "secret.read", effect: "ALLOW" }],
      },
      "request",
    ),
  ).rejects.toThrow();

  store.roles.set(target.id, { ...target, isProtected: false, organizationId: "org-2" });
  await expect(
    service.setRolePermissions(
      actor,
      { roleId: target.id, expectedVersion: 0, effects: [] },
      "request",
    ),
  ).rejects.toThrow("not found");
});

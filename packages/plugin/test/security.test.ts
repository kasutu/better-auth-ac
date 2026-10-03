import { describe, expect, it } from "vitest";
import { defineCatalog } from "@better-auth-ac/core";
import {
  IamMutationError,
  IamService,
  type ActiveMember,
  type IamRole,
  type IamStore,
} from "../src/index.js";
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

describe("wildcard actor", () => {
  const catalog = defineCatalog(
    ["iam.role.read", "iam.role.manage", "iam.member-role.manage", "secret.read"].map((key) => ({
      key,
      name: key,
      description: key,
      group: "IAM",
      subject: key,
      action: "use",
      scope: "organization" as const,
    })),
  );
  const actor: ActiveMember = {
    userId: "operator",
    memberId: "no-member-row",
    organizationId: "org-1",
    teamIds: [],
    isOwner: false,
    wildcard: true,
  };
  // A store whose member lookups fail, like Better Auth when the actor has no member row.
  const memberless = (store: MemoryStore): IamStore => ({
    transaction: (work) =>
      store.transaction((transaction) =>
        work({
          ...transaction,
          getMemberRoles: async (organizationId, memberId) => {
            if (memberId === actor.memberId) {
              throw new IamMutationError("Member not found", "NOT_FOUND");
            }
            return transaction.getMemberRoles(organizationId, memberId);
          },
        }),
      ),
  });

  it("reads the ability as manage-all without a member row", async () => {
    const service = new IamService(catalog, memberless(new MemoryStore()));
    const ability = await service.ability(actor, true);
    expect(ability.rules).toEqual([{ subject: "all", action: "manage" }]);
    expect(ability.decisions?.every(({ allowed }) => allowed)).toBe(true);
    expect(await service.memberRoles(actor, actor.memberId)).toMatchObject({
      version: 0,
      roles: [],
    });
  });

  it("manages roles, audits the wildcard, and fails cleanly on its own member row", async () => {
    const store = new MemoryStore();
    const service = new IamService(catalog, memberless(store));
    const role = await service.createRole(
      actor,
      { name: "Admin", color: "#000000", rank: 1 },
      "request",
    );
    await service.setRolePermissions(
      actor,
      { roleId: role.id, expectedVersion: 0, effects: [{ key: "*", effect: "ALLOW" }] },
      "request",
    );
    expect(store.audits.map(({ data }) => data.actorWildcard)).toEqual([true, true]);

    await expect(
      service.setMemberRoles(
        actor,
        { memberId: actor.memberId, roleIds: [role.id], expectedVersion: 0 },
        "request",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not leak the actor wildcard into another member's decisions", async () => {
    const store = new MemoryStore();
    const service = new IamService(catalog, memberless(store));
    const result = await service.memberRoles(actor, "other-member");
    expect(result.decisions.some(({ allowed }) => allowed)).toBe(false);
  });

  it("does not let a non-owner grant or assign the wildcard", async () => {
    const store = new MemoryStore();
    const manager: IamRole = {
      id: "manager",
      organizationId: "org-1",
      name: "Manager",
      color: "#000000",
      rank: 10,
      isProtected: false,
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const admin = { ...manager, id: "admin", name: "Admin", rank: 20 };
    store.roles.set(manager.id, manager);
    store.roles.set(admin.id, admin);
    store.permissions.set(manager.id, [
      { key: "iam.role.manage", effect: "ALLOW" },
      { key: "iam.member-role.manage", effect: "ALLOW" },
      { key: "secret.read", effect: "ALLOW" },
    ]);
    store.permissions.set(admin.id, [{ key: "*", effect: "ALLOW" }]);
    store.memberRoles.set("org-1:manager-member", [manager.id]);
    const member: ActiveMember = {
      userId: "manager",
      memberId: "manager-member",
      organizationId: "org-1",
      teamIds: [],
      isOwner: false,
    };
    const service = new IamService(catalog, store);

    await expect(
      service.setRolePermissions(
        member,
        { roleId: admin.id, expectedVersion: 0, effects: [{ key: "*", effect: "ALLOW" }] },
        "request",
      ),
    ).rejects.toThrow("does not have");
    await expect(
      service.setMemberRoles(
        member,
        { memberId: "target", roleIds: [admin.id], expectedVersion: 0 },
        "request",
      ),
    ).rejects.toThrow("does not have");
    await expect(
      service.setRolePermissions(
        member,
        { roleId: admin.id, expectedVersion: 0, effects: [{ key: "*", effect: "DENY" }] },
        "request",
      ),
    ).rejects.toThrow("only be allowed");
  });
});

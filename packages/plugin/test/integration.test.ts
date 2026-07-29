import { expect, it } from "vitest";
import { defineCatalog } from "@better-auth-ac/core";
import { IamService, type ActiveMember } from "../src/index.js";
import { MemoryStore } from "./helpers.js";

const catalog = defineCatalog([
  {
    key: "order.refund",
    name: "Refund",
    description: "Refund an order.",
    group: "Orders",
    subject: "Order",
    action: "refund",
    scope: "organization",
  },
]);
const owner: ActiveMember = {
  userId: "owner-user",
  memberId: "owner-member",
  organizationId: "org-1",
  teamIds: [],
  isOwner: true,
};

it("creates roles, sets effects, assigns multiple roles, audits, and invalidates sessions", async () => {
  const store = new MemoryStore();
  const service = new IamService(catalog, store);
  const allow = await service.createRole(
    owner,
    { name: "Refunders", color: "#336699", rank: 10 },
    "request-1",
  );
  const deny = await service.createRole(
    owner,
    { name: "Restricted", color: "#993333", rank: 20 },
    "request-2",
  );
  expect(allow.permissions).toEqual([]);
  const allowWithPermissions = await service.setRolePermissions(
    owner,
    { roleId: allow.id, expectedVersion: 0, effects: [{ key: "order.refund", effect: "ALLOW" }] },
    "request-3",
  );
  expect(allowWithPermissions.permissions).toEqual([{ key: "order.refund", effect: "ALLOW" }]);
  await service.setRolePermissions(
    owner,
    { roleId: deny.id, expectedVersion: 0, effects: [{ key: "order.refund", effect: "DENY" }] },
    "request-4",
  );
  await service.setMemberRoles(
    owner,
    { memberId: "member-2", roleIds: [allow.id, deny.id], expectedVersion: 0 },
    "request-5",
  );
  const ability = await service.ability({ ...owner, memberId: "member-2", isOwner: false });
  expect(ability.rules).toEqual([
    {
      subject: "Order",
      action: "refund",
      inverted: true,
      reason: "An assigned role explicitly denies this permission.",
    },
  ]);
  expect(store.audits.map(({ type }) => type)).toEqual([
    "IAM_ROLE_CREATED",
    "IAM_ROLE_CREATED",
    "IAM_ROLE_PERMISSIONS_CHANGED",
    "IAM_ROLE_PERMISSIONS_CHANGED",
    "IAM_MEMBER_ROLES_CHANGED",
  ]);
  expect(store.invalidations).toContainEqual(["member-2"]);
});

it("makes set-style mutation retries no-ops", async () => {
  const store = new MemoryStore();
  const service = new IamService(catalog, store);
  const role = await service.createRole(
    owner,
    { name: "Refunders", color: "#336699", rank: 10 },
    "create",
  );
  const input = {
    roleId: role.id,
    expectedVersion: 0,
    effects: [{ key: "order.refund", effect: "ALLOW" as const }],
  };
  await service.setRolePermissions(owner, input, "set");
  await service.setRolePermissions(owner, input, "set-retry");
  expect(store.roles.get(role.id)?.version).toBe(1);
  expect(store.audits.filter(({ type }) => type === "IAM_ROLE_PERMISSIONS_CHANGED")).toHaveLength(
    1,
  );
});

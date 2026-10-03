import { expect, it } from "vitest";
import { assertRoleMutation, evaluate, type PermissionDefinition } from "../src/index.js";

const permission: PermissionDefinition = {
  key: "order.read",
  name: "Read orders",
  description: "Read orders.",
  group: "Orders",
  subject: "Order",
  action: "read",
  scope: "organization",
};

it("fails closed across tenants and role boundaries", () => {
  const decision = evaluate({
    permission,
    organizationId: "org-a",
    roles: [
      {
        id: "foreign",
        name: "Foreign",
        organizationId: "org-b",
        rank: 10,
        permissions: [{ key: "order.read", effect: "ALLOW" }],
      },
    ],
  });
  expect(decision.allowed).toBe(false);
  expect(() =>
    assertRoleMutation(
      { organizationId: "org-a", rank: 10, isOwner: false, permissions: [] },
      { organizationId: "org-a", rank: 1, isProtected: false },
      ["order.read"],
    ),
  ).toThrow();
});

it("lets only an owner grant the wildcard permission", () => {
  const target = { organizationId: "org-a", rank: 20, isProtected: false };
  expect(() =>
    assertRoleMutation(
      { organizationId: "org-a", rank: 10, isOwner: false, permissions: ["order.read"] },
      target,
      ["*"],
    ),
  ).toThrow("does not have");
  expect(() =>
    assertRoleMutation(
      { organizationId: "org-a", rank: 10, isOwner: true, permissions: [] },
      target,
      ["*"],
    ),
  ).not.toThrow();
});

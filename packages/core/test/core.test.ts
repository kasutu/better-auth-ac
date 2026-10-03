import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  WILDCARD_PERMISSION,
  assertKnownEffects,
  defineCatalog,
  diffEffects,
  evaluate,
  type AssignedRole,
  type PermissionDefinition,
} from "../src/index.js";

const permission: PermissionDefinition = {
  key: "order.refund",
  name: "Refund orders",
  description: "Issue a refund.",
  group: "Orders",
  subject: "Order",
  action: "refund",
  scope: "organization",
};

const role = (id: string, effect: "ALLOW" | "DENY", organizationId = "org-1"): AssignedRole => ({
  id,
  organizationId,
  name: id,
  rank: 10,
  permissions: [{ key: permission.key, effect }],
});

describe("core authorization", () => {
  it("is deterministic, default-deny, and gives explicit deny precedence", () => {
    expect(evaluate({ permission, roles: [], organizationId: "org-1" }).effect).toBe("NONE");
    const decision = evaluate({
      permission,
      roles: [role("z", "ALLOW"), role("a", "DENY")],
      organizationId: "org-1",
    });
    expect(decision).toMatchObject({ allowed: false, effect: "DENY" });
    expect(decision.trace.map(({ roleId }) => roleId)).toEqual(["a", "z"]);
  });

  it("rejects conflicting catalog definitions", () => {
    expect(() => defineCatalog([permission, { ...permission, action: "delete" }])).toThrow(
      AuthorizationError,
    );
  });

  it("validates and freezes catalog fields", () => {
    for (const fields of [[], [""], [" "], ["id", "id"]]) {
      expect(() => defineCatalog([{ ...permission, fields }])).toThrow(AuthorizationError);
    }

    const fields = ["id", "total"];
    const catalog = defineCatalog([{ ...permission, fields }]);
    fields.push("status");

    expect(catalog.permissions[0]?.fields).toEqual(["id", "total"]);
    expect(Object.isFrozen(catalog.permissions[0]?.fields)).toBe(true);
  });

  it("includes ordered fields in the catalog version", () => {
    const first = defineCatalog([{ ...permission, fields: ["id", "total"] }]);
    const reordered = defineCatalog([{ ...permission, fields: ["total", "id"] }]);
    const changed = defineCatalog([{ ...permission, fields: ["id", "status"] }]);

    expect(first.version).not.toBe(reordered.version);
    expect(first.version).not.toBe(changed.version);
  });

  it("produces a stable effects diff", () => {
    expect(
      diffEffects(
        [
          { key: "order.cancel", effect: "ALLOW" },
          { key: "inventory.adjust", effect: "DENY" },
        ],
        [
          { key: "order.refund", effect: "ALLOW" },
          { key: "order.cancel", effect: "DENY" },
        ],
      ),
    ).toEqual({
      added: [{ key: "order.refund", effect: "ALLOW" }],
      changed: [{ key: "order.cancel", from: "ALLOW", to: "DENY" }],
      removed: ["inventory.adjust"],
    });
  });
});

describe("wildcard permission", () => {
  const wildcardRole = (id = "admin", organizationId = "org-1"): AssignedRole => ({
    id,
    organizationId,
    name: id,
    rank: 10,
    permissions: [{ key: WILDCARD_PERMISSION, effect: "ALLOW" }],
  });

  it("lets a role wildcard allow every catalog key", () => {
    const decision = evaluate({ permission, roles: [wildcardRole()], organizationId: "org-1" });
    expect(decision).toMatchObject({ effect: "ALLOW", allowed: true });
    expect(decision.trace).toEqual([
      { roleId: "admin", roleName: "admin", effect: "ALLOW", reason: "Wildcard role effect." },
    ]);
  });

  it("keeps explicit deny precedence over a role wildcard", () => {
    const sameRole: AssignedRole = {
      ...wildcardRole(),
      permissions: [
        { key: WILDCARD_PERMISSION, effect: "ALLOW" },
        { key: permission.key, effect: "DENY" },
      ],
    };
    expect(evaluate({ permission, roles: [sameRole], organizationId: "org-1" }).effect).toBe(
      "DENY",
    );
    expect(
      evaluate({
        permission,
        roles: [wildcardRole(), role("deny", "DENY")],
        organizationId: "org-1",
      }).effect,
    ).toBe("DENY");
  });

  it("keeps tenant and team checks for a role wildcard", () => {
    expect(
      evaluate({ permission, roles: [wildcardRole("x", "org-2")], organizationId: "org-1" })
        .allowed,
    ).toBe(false);
    const teamPermission = { ...permission, scope: "team" as const };
    expect(
      evaluate({
        permission: teamPermission,
        roles: [wildcardRole()],
        organizationId: "org-1",
        teamIds: ["team-1"],
        requiredTeamId: "team-2",
      }).allowed,
    ).toBe(false);
  });

  it("lets an actor wildcard bypass roles, denies, and team scope", () => {
    const decision = evaluate({
      permission: { ...permission, scope: "team" },
      roles: [role("deny", "DENY")],
      organizationId: "org-1",
      requiredTeamId: "team-2",
      wildcard: true,
    });
    expect(decision).toEqual({
      key: permission.key,
      effect: "ALLOW",
      allowed: true,
      reason: "The actor holds the wildcard permission.",
      trace: [],
    });
  });

  it("accepts only an allowed wildcard role effect", () => {
    const catalog = defineCatalog([permission]);
    expect(() =>
      assertKnownEffects(catalog, [{ key: WILDCARD_PERMISSION, effect: "ALLOW" }]),
    ).not.toThrow();
    expect(() =>
      assertKnownEffects(catalog, [{ key: WILDCARD_PERMISSION, effect: "DENY" }]),
    ).toThrow(AuthorizationError);
    expect(() => defineCatalog([{ ...permission, key: WILDCARD_PERMISSION }])).toThrow(
      AuthorizationError,
    );
  });
});

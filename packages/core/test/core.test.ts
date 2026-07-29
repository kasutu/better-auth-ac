import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
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

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

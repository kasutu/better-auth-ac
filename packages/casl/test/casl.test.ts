import { expect, it } from "vitest";
import { defineCatalog } from "@better-auth-ac/core";
import { toCaslRules } from "../src/index.js";

it("emits deterministic allow and inverted deny rules", () => {
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
    {
      key: "order.read",
      name: "Read",
      description: "Read an order.",
      group: "Orders",
      subject: "Order",
      action: "read",
      scope: "organization",
    },
  ]);
  const payload = toCaslRules(catalog, [
    { key: "order.refund", effect: "DENY", allowed: false, reason: "Denied.", trace: [] },
    { key: "order.read", effect: "ALLOW", allowed: true, reason: "Allowed.", trace: [] },
  ]);
  expect(payload.rules).toEqual([
    { subject: "Order", action: "read" },
    { subject: "Order", action: "refund", inverted: true, reason: "Denied." },
  ]);
});

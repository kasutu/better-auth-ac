import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("ships normalized constraints and explicit delete rules", () => {
  const sql = readFileSync(new URL("../../../docs/postgres-schema.sql", import.meta.url), "utf8");
  expect(sql).toContain('UNIQUE ("organizationId", name)');
  expect(sql).toContain('PRIMARY KEY ("roleId", "permissionKey")');
  expect(sql).toContain('PRIMARY KEY ("memberId", "roleId")');
  expect(sql).toContain("ON DELETE CASCADE");
  expect(sql).not.toMatch(/json|comma/i);
});

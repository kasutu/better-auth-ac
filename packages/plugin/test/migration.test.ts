import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("ships normalized constraints and explicit delete rules", () => {
  const sql = readFileSync(new URL("../../../docs/postgres-schema.sql", import.meta.url), "utf8");
  expect(sql).toContain('UNIQUE ("organizationId", name)');
  expect(sql).toContain('UNIQUE ("roleId", "permissionKey")');
  expect(sql).toContain('UNIQUE ("memberId", "roleId")');
  expect(sql).toContain('ADD COLUMN "iamRoleVersion" integer NULL');
  expect(sql).toContain('CREATE TABLE "IamAudit"');
  expect(sql).toContain("ON DELETE CASCADE");
  expect(sql).not.toMatch(/comma/i);
});

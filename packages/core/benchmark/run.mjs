import { performance } from "node:perf_hooks";
import { evaluate } from "../dist/index.js";

const catalog = Array.from({ length: 500 }, (_, index) => ({
  key: `resource.${index}`,
  name: `Permission ${index}`,
  description: `Benchmark permission ${index}.`,
  group: "Benchmark",
  subject: "Resource",
  action: String(index),
  scope: "organization",
}));
const roles = Array.from({ length: 20 }, (_, roleIndex) => ({
  id: `role-${String(roleIndex).padStart(2, "0")}`,
  organizationId: "benchmark",
  name: `Role ${roleIndex}`,
  rank: roleIndex,
  permissions: catalog.map(({ key }, permissionIndex) => ({
    key,
    effect: roleIndex === 19 && permissionIndex % 7 === 0 ? "DENY" : "ALLOW",
  })),
}));
const started = performance.now();
for (const permission of catalog) evaluate({ permission, roles, organizationId: "benchmark" });
const duration = performance.now() - started;
console.log(
  JSON.stringify({ permissions: 500, roles: 20, durationMs: Number(duration.toFixed(2)) }),
);

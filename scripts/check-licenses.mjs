import { readFileSync } from "node:fs";

const allowed = new Set(["0BSD", "Apache-2.0", "BSD-3-Clause", "ISC", "MIT"]);
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
for (const [path, value] of Object.entries(lock.packages)) {
  if (!path.startsWith("node_modules/") || value.link) continue;
  if (!allowed.has(value.license)) {
    throw new Error(
      `${path}: review disallowed or missing license ${value.license ?? "(missing)"}`,
    );
  }
}

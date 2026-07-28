import { readFileSync } from "node:fs";

const allowed = new Set(["0BSD", "Apache-2.0", "BSD-3-Clause", "CC-BY-4.0", "ISC", "MIT"]);
const reviewed = new Map([
  ["node_modules/busboy", "MIT"],
  ["node_modules/streamsearch", "MIT"],
]);
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
for (const [path, value] of Object.entries(lock.packages)) {
  if (!path.startsWith("node_modules/") || value.link) continue;
  const license = value.license ?? reviewed.get(path);
  const choices = license?.replace(/[()]/g, "").split(" OR ") ?? [];
  if (!choices.some((choice) => allowed.has(choice))) {
    throw new Error(`${path}: review disallowed or missing license ${license ?? "(missing)"}`);
  }
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const signatures = JSON.parse(readFileSync("api-signatures.json", "utf8"));
for (const [path, expected] of Object.entries(signatures)) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== expected) {
    throw new Error(`${path} changed; review semver and update api-signatures.json intentionally`);
  }
}

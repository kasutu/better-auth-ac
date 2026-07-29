import { defineCatalog } from "@better-auth-ac/core";
import { caslModuleEtag } from "@better-auth-ac/casl";
import { expect, it } from "vitest";
import { betterAuthAc } from "../src/index.js";
import { MemoryStore } from "./helpers.js";

const catalog = defineCatalog([
  {
    key: "supply.read",
    name: "Read supplies",
    description: "View factory supplies.",
    group: "Supplies",
    subject: "Supply",
    action: "read",
    scope: "organization",
  },
]);

function plugin() {
  return betterAuthAc({
    catalog,
    store: new MemoryStore(),
    resolveActiveMember: async () => null,
    authorizeCatalogArtifact: (headers) => headers.get("authorization") === "Bearer build-token",
  });
}

it("protects the generated catalog artifact", async () => {
  const endpoint = plugin().endpoints!.iamCatalogCasl;

  await expect(endpoint({ headers: new Headers() } as never)).rejects.toThrow(
    "Invalid catalog authorization",
  );
});

it("returns the generated catalog artifact with cache headers", async () => {
  const endpoint = plugin().endpoints!.iamCatalogCasl;
  const headers = new Headers({ authorization: "Bearer build-token" });
  const response = (await endpoint({ headers } as never)) as Response;

  expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  const contents = await response.text();
  expect(response.headers.get("etag")).toBe(caslModuleEtag(contents));
  expect(contents).toContain('| ["read", "Supply"]');

  headers.set("if-none-match", caslModuleEtag(contents));
  const cached = (await endpoint({ headers } as never)) as Response;
  expect(cached.status).toBe(304);
});

import { expect, it } from "vitest";
import { defineCatalog } from "@better-auth-ac/core";
import { IamService, type ActiveMember } from "../src/index.js";
import { MemoryStore } from "./helpers.js";

it("rejects one of two concurrent writes with the same version", async () => {
  const store = new MemoryStore();
  const service = new IamService(defineCatalog([]), store);
  const owner: ActiveMember = {
    userId: "owner",
    memberId: "owner-member",
    organizationId: "org-1",
    teamIds: [],
    isOwner: true,
  };
  const role = await service.createRole(
    owner,
    { name: "Initial", color: "#111111", rank: 10 },
    "create",
  );
  const results = await Promise.allSettled([
    service.updateRole(
      owner,
      { roleId: role.id, expectedVersion: 0, name: "One", color: "#111111", rank: 10 },
      "one",
    ),
    service.updateRole(
      owner,
      { roleId: role.id, expectedVersion: 0, name: "Two", color: "#111111", rank: 10 },
      "two",
    ),
  ]);
  expect(results.map(({ status }) => status).sort()).toEqual(["fulfilled", "rejected"]);
});

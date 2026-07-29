import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import { UpdatesService } from "../src/updates.service.js";

describe("realtime updates", () => {
  it("only publishes updates for the active organization", async () => {
    const updates = new UpdatesService();
    const event = firstValueFrom(updates.forOrganization("org-a"));

    updates.publish("org-b", ["supplies"]);
    updates.publish("org-a", ["roles", "audit"]);

    await expect(event).resolves.toMatchObject({ data: ["roles", "audit"] });
  });
});

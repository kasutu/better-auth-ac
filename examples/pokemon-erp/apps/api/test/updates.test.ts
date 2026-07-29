import { UnauthorizedException } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { UpdatesController } from "../src/updates.controller.js";
import { UpdatesService } from "../src/updates.service.js";

describe("realtime updates", () => {
  it("only publishes updates for the active organization", async () => {
    const updates = new UpdatesService();
    const event = firstValueFrom(updates.forOrganization("org-a"));

    updates.publish("org-b", ["supplies"]);
    updates.publish("org-a", ["roles", "audit"]);

    await expect(event).resolves.toMatchObject({ data: ["roles", "audit"] });
  });

  it("notifies a client when its session was invalidated", async () => {
    const updates = new UpdatesService();
    const sessions = {
      active: vi
        .fn()
        .mockResolvedValueOnce({ organizationId: "org-a" })
        .mockRejectedValueOnce(new UnauthorizedException("Invalid session")),
    };
    const controller = new UpdatesController(sessions as never, updates);
    const stream = await controller.stream({} as never);
    const event = firstValueFrom(stream);

    updates.publish("org-a", ["ability"]);

    await expect(event).resolves.toMatchObject({ type: "session-invalidated", data: [] });
  });
});

import { Controller, Inject, Req, Sse } from "@nestjs/common";
import type { Request } from "express";
import { SessionService } from "./session.service.js";
import { UpdatesService } from "./updates.service.js";

@Controller("api/updates")
export class UpdatesController {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(UpdatesService) private readonly updates: UpdatesService,
  ) {}

  @Sse()
  async stream(@Req() request: Request) {
    const actor = await this.sessions.active(request);
    return this.updates.forOrganization(actor.organizationId);
  }
}

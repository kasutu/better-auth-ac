import {
  Controller,
  Inject,
  Req,
  Sse,
  UnauthorizedException,
  type MessageEvent,
} from "@nestjs/common";
import type { Request } from "express";
import { concatMap } from "rxjs";
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
    return this.updates.forOrganization(actor.organizationId).pipe(
      concatMap(async (event) => {
        try {
          await this.sessions.active(request);
          return event;
        } catch (error) {
          if (!(error instanceof UnauthorizedException)) throw error;
          return { type: "session-invalidated", data: [] } satisfies MessageEvent;
        }
      }),
    );
  }
}

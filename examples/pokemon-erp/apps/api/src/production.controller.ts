import { Body, Controller, Get, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { Permission, PermissionGroup } from "@better-auth-ac/nest";
import { ErpService } from "./erp.service.js";
import { SessionService } from "./session.service.js";

@PermissionGroup("production")
@Controller("api/production")
export class ProductionController {
  constructor(
    @Inject(ErpService) private readonly erp: ErpService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Permission("read", {
    name: "Read production orders",
    description: "View factory production orders.",
    subject: "ProductionOrder",
    action: "read",
    scope: "organization",
  })
  @Get()
  async list(@Req() request: Request) {
    const actor = await this.sessions.active(request);
    return this.erp.listProduction(actor.organizationId);
  }

  @Permission("run", {
    name: "Run production",
    description: "Complete a production order and consume supplies.",
    subject: "ProductionOrder",
    action: "create",
    scope: "organization",
  })
  @Post()
  async run(@Req() request: Request, @Body() body: { product?: string; quantity?: number }) {
    const actor = await this.sessions.active(request);
    return this.erp.runProduction(
      actor.organizationId,
      body.product ?? "",
      Number(body.quantity ?? 0),
    );
  }
}

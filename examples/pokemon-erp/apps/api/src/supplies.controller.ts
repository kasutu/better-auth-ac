import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { Permission, PermissionGroup } from "@better-auth-ac/nest";
import { ErpService } from "./erp.service.js";
import { SessionService } from "./session.service.js";
import { UpdatesService } from "./updates.service.js";

@PermissionGroup("supplies")
@Controller("api/supplies")
export class SuppliesController {
  constructor(
    @Inject(ErpService) private readonly erp: ErpService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(UpdatesService) private readonly updates: UpdatesService,
  ) {}

  @Permission("read", {
    name: "Read supplies",
    description: "View factory supplies and stock levels.",
    subject: "Supply",
    action: "read",
    scope: "organization",
    fields: ["id", "name", "category", "quantity", "reorderLevel"],
  })
  @Get()
  async list(@Req() request: Request) {
    const actor = await this.sessions.active(request);
    return this.erp.listSupplies(actor.organizationId);
  }

  @Permission("create", {
    name: "Create supplies",
    description: "Add a supply to the factory inventory.",
    subject: "Supply",
    action: "create",
    scope: "organization",
    fields: ["id", "name", "category", "quantity", "reorderLevel"],
  })
  @Post()
  async create(
    @Req() request: Request,
    @Body()
    body: { name?: string; category?: string; quantity?: number; reorderLevel?: number },
  ) {
    const actor = await this.sessions.active(request);
    const supply = this.erp.createSupply(actor.organizationId, {
      name: body.name ?? "",
      category: body.category ?? "",
      quantity: Number(body.quantity ?? 0),
      reorderLevel: Number(body.reorderLevel ?? 0),
    });
    this.updates.publish(actor.organizationId, ["supplies"]);
    return supply;
  }

  @Permission("adjust", {
    name: "Adjust stock",
    description: "Increase or decrease a supply stock level.",
    subject: "Supply",
    action: "update",
    scope: "organization",
    fields: ["quantity"],
  })
  @Patch(":id/stock")
  async adjust(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: { change?: number },
  ) {
    const actor = await this.sessions.active(request);
    const supply = this.erp.adjustStock(actor.organizationId, id, Number(body.change ?? 0));
    this.updates.publish(actor.organizationId, ["supplies"]);
    return supply;
  }
}

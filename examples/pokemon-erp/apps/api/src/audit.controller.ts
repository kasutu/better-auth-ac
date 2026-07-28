import { Controller, Get, Inject, Req } from "@nestjs/common";
import type { Request } from "express";
import type Database from "better-sqlite3";
import { Permission, PermissionGroup } from "@better-auth-ac/nest";
import { DATABASE } from "./database.js";
import { SessionService } from "./session.service.js";

@PermissionGroup("audit", "Audit")
@Controller("api/audit")
export class AuditController {
  constructor(
    @Inject(DATABASE) private readonly database: Database.Database,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Permission("read", {
    name: "Read audit events",
    description: "View access-control mutation events.",
    subject: "AuditEvent",
    action: "read",
    scope: "organization",
  })
  @Get()
  async list(@Req() request: Request) {
    const actor = await this.sessions.active(request);
    return (
      this.database
        .prepare(
          `SELECT id, type, actorId, targetId, outcome, correlationId, occurredAt, data
           FROM iamAudit
           WHERE organizationId = ?
           ORDER BY occurredAt DESC
           LIMIT 100`,
        )
        .all(actor.organizationId) as Array<Record<string, unknown> & { data: string }>
    ).map((event) => ({ ...event, data: JSON.parse(event.data) }));
  }
}

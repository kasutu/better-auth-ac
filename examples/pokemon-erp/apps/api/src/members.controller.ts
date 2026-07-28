import { BadRequestException, Body, Controller, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import type Database from "better-sqlite3";
import { Permission, PermissionGroup } from "@better-auth-ac/nest";
import { AuthService } from "./auth.service.js";
import { DATABASE } from "./database.js";
import { SessionService } from "./session.service.js";

@PermissionGroup("members", "Members")
@Controller("api/members")
export class MembersController {
  constructor(
    @Inject(DATABASE) private readonly database: Database.Database,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Permission("manage", {
    name: "Manage members",
    description: "Add an existing user to the active organization.",
    subject: "OrganizationMember",
    action: "manage",
    scope: "organization",
  })
  @Post()
  async add(@Req() request: Request, @Body() body: { email?: string }) {
    const actor = await this.sessions.active(request);
    const user = this.database
      .prepare("SELECT id FROM user WHERE lower(email) = lower(?)")
      .get(body.email ?? "") as { id: string } | undefined;
    if (!user) throw new BadRequestException("Create that user account before adding it");
    return this.auth.addMember({
      body: {
        userId: user.id,
        organizationId: actor.organizationId,
        role: "member",
      },
    });
  }
}

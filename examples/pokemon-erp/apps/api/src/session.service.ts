import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { ActiveMember } from "better-auth-ac";
import { AuthService } from "./auth.service.js";

@Injectable()
export class SessionService {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async active(request: Request): Promise<ActiveMember> {
    const session = await this.auth.getSession(fromNodeHeaders(request.headers));
    const member = this.auth.resolveSession(session);
    if (!member) throw new UnauthorizedException("Select an active organization");
    return member;
  }
}

import type { RawRuleOf } from "@casl/ability";
import type { AppAbility } from "./generated/better-auth-ac";

export type AbilityRule = RawRuleOf<AppAbility>;

export interface AbilityPayload {
  version: string;
  rules: AbilityRule[];
}

export interface CatalogPermission {
  key: string;
  name: string;
  description: string;
  group: string;
  subject: string;
  action: string;
  scope: "organization" | "team";
  fields?: readonly string[];
}

export interface Catalog {
  version: string;
  permissions: CatalogPermission[];
}

export interface Role {
  id: string;
  organizationId: string;
  name: string;
  color: string;
  rank: number;
  isProtected: boolean;
  version: number;
  permissions: Array<{ key: string; effect: "ALLOW" | "DENY" }>;
}

export interface Supply {
  id: string;
  name: string;
  category: string;
  quantity: number;
  reorderLevel: number;
}

export interface ProductionOrder {
  id: string;
  product: string;
  quantity: number;
  status: string;
  createdAt: string;
}

export interface Member {
  id: string;
  userId: string;
  role: string;
  user: { name: string; email: string };
}

export interface MemberRoles {
  version: number;
  roles: Array<{ id: string }>;
}

export interface AuditEvent {
  id: string;
  type: string;
  actorId: string;
  targetId: string;
  outcome: string;
  correlationId: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

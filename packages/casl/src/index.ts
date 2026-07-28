import type { Decision, PermissionCatalog } from "@better-auth-ac/core";
import type { RawRuleOf } from "@casl/ability";

export interface AbilityRule {
  subject: string;
  action: string;
  inverted?: true;
  reason?: string;
}

export interface AbilityPayload {
  version: string;
  rules: AbilityRule[];
}

export function toCaslRules(
  catalog: PermissionCatalog,
  decisions: readonly Decision[],
): AbilityPayload {
  const byKey = new Map(decisions.map((decision) => [decision.key, decision]));
  const rules = catalog.permissions.flatMap<AbilityRule>((permission) => {
    const decision = byKey.get(permission.key);
    if (!decision || decision.effect === "NONE") return [];
    return [
      decision.effect === "DENY"
        ? {
            subject: permission.subject,
            action: permission.action,
            inverted: true,
            reason: decision.reason,
          }
        : { subject: permission.subject, action: permission.action },
    ];
  });
  return { version: catalog.version, rules };
}

export type CaslRawRule = RawRuleOf<import("@casl/ability").MongoAbility>;

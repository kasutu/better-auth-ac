import type { CanProps } from "@casl/react";
import type { AppAbility } from "./generated/better-auth-ac";

const valid: CanProps<AppAbility> = { I: "update", a: "Supply", children: null };

// @ts-expect-error "update" is not defined for "AuditEvent".
const invalid: CanProps<AppAbility> = { I: "update", a: "AuditEvent", children: null };

void valid;
void invalid;

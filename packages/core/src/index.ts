export type PermissionEffect = "ALLOW" | "DENY";
export type DecisionEffect = PermissionEffect | "NONE";
export type PermissionScope = "organization" | "team";

export interface PermissionDefinition {
  key: string;
  name: string;
  description: string;
  group: string;
  subject: string;
  action: string;
  scope: PermissionScope;
}

export interface RolePermission {
  key: string;
  effect: PermissionEffect;
}

export interface AssignedRole {
  id: string;
  organizationId: string;
  name: string;
  rank: number;
  permissions: readonly RolePermission[];
}

export interface DecisionTraceEntry {
  roleId: string;
  roleName: string;
  effect: DecisionEffect;
  reason: string;
}

export interface Decision {
  key: string;
  effect: DecisionEffect;
  allowed: boolean;
  reason: string;
  trace: readonly DecisionTraceEntry[];
}

export interface PermissionCatalog {
  version: string;
  permissions: readonly PermissionDefinition[];
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "DUPLICATE_PERMISSION"
      | "INVALID_PERMISSION"
      | "UNKNOWN_PERMISSION"
      | "TENANT_MISMATCH"
      | "INSUFFICIENT_RANK"
      | "PROTECTED_ROLE"
      | "PRIVILEGE_ESCALATION",
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

const keyPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;

export function assertPermissionDefinition(value: PermissionDefinition): void {
  if (
    !keyPattern.test(value.key) ||
    !value.name.trim() ||
    !value.description.trim() ||
    !value.group.trim() ||
    !value.subject.trim() ||
    !value.action.trim() ||
    !["organization", "team"].includes(value.scope)
  ) {
    throw new AuthorizationError(
      `Invalid permission definition: ${value.key}`,
      "INVALID_PERMISSION",
    );
  }
}

function stableDefinition(value: PermissionDefinition): string {
  return [
    value.key,
    value.name,
    value.description,
    value.group,
    value.subject,
    value.action,
    value.scope,
  ].join("\u001f");
}

function catalogHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function defineCatalog(definitions: readonly PermissionDefinition[]): PermissionCatalog {
  const byKey = new Map<string, PermissionDefinition>();
  for (const definition of definitions) {
    assertPermissionDefinition(definition);
    const existing = byKey.get(definition.key);
    if (existing && stableDefinition(existing) !== stableDefinition(definition)) {
      throw new AuthorizationError(
        `Conflicting definitions for permission ${definition.key}`,
        "DUPLICATE_PERMISSION",
      );
    }
    byKey.set(definition.key, Object.freeze({ ...definition }));
  }
  const permissions = Object.freeze([...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)));
  return Object.freeze({
    version: catalogHash(permissions.map(stableDefinition).join("\n")),
    permissions,
  });
}

export function assertKnownEffects(
  catalog: PermissionCatalog,
  effects: readonly RolePermission[],
): void {
  const known = new Set(catalog.permissions.map(({ key }) => key));
  const seen = new Set<string>();
  for (const effect of effects) {
    if (!known.has(effect.key)) {
      throw new AuthorizationError(`Unknown permission: ${effect.key}`, "UNKNOWN_PERMISSION");
    }
    if (seen.has(effect.key) || !["ALLOW", "DENY"].includes(effect.effect)) {
      throw new AuthorizationError(
        `Invalid permission effect: ${effect.key}`,
        "INVALID_PERMISSION",
      );
    }
    seen.add(effect.key);
  }
}

export interface EvaluateInput {
  permission: PermissionDefinition;
  roles: readonly AssignedRole[];
  organizationId: string;
  teamIds?: readonly string[];
  requiredTeamId?: string;
}

export function evaluate(input: EvaluateInput): Decision {
  const trace: DecisionTraceEntry[] = [];
  let resolved: DecisionEffect = "NONE";

  for (const role of [...input.roles].sort((a, b) => a.id.localeCompare(b.id))) {
    const record = role.permissions.find(({ key }) => key === input.permission.key);
    const effect = record?.effect ?? "NONE";
    const tenantMatch = role.organizationId === input.organizationId;
    trace.push({
      roleId: role.id,
      roleName: role.name,
      effect: tenantMatch ? effect : "NONE",
      reason: tenantMatch
        ? record
          ? "Stored role effect."
          : "No stored effect."
        : "Tenant mismatch.",
    });
    if (!tenantMatch) continue;
    if (effect === "DENY") resolved = "DENY";
    else if (effect === "ALLOW" && resolved === "NONE") resolved = "ALLOW";
  }

  if (
    resolved === "ALLOW" &&
    input.permission.scope === "team" &&
    (!input.requiredTeamId || !input.teamIds?.includes(input.requiredTeamId))
  ) {
    return {
      key: input.permission.key,
      effect: "NONE",
      allowed: false,
      reason: "Team scope does not match the verified session.",
      trace,
    };
  }

  return {
    key: input.permission.key,
    effect: resolved,
    allowed: resolved === "ALLOW",
    reason:
      resolved === "DENY"
        ? "An assigned role explicitly denies this permission."
        : resolved === "ALLOW"
          ? "An assigned role allows this permission."
          : "No assigned role allows this permission.",
    trace,
  };
}

export interface RoleBoundary {
  organizationId: string;
  rank: number;
  isProtected: boolean;
}

export function assertRoleMutation(
  actor: { organizationId: string; rank: number; isOwner: boolean; permissions: readonly string[] },
  target: RoleBoundary,
  grantedKeys: readonly string[] = [],
): void {
  if (actor.organizationId !== target.organizationId) {
    throw new AuthorizationError("Role belongs to another organization", "TENANT_MISMATCH");
  }
  if (target.isProtected) {
    throw new AuthorizationError("Protected roles cannot be changed", "PROTECTED_ROLE");
  }
  if (!actor.isOwner && target.rank <= actor.rank) {
    throw new AuthorizationError("Role is not below the actor", "INSUFFICIENT_RANK");
  }
  if (!actor.isOwner) {
    const held = new Set(actor.permissions);
    if (grantedKeys.some((key) => !held.has(key))) {
      throw new AuthorizationError(
        "Cannot grant a permission the actor does not have",
        "PRIVILEGE_ESCALATION",
      );
    }
  }
}

export interface EffectsDiff {
  added: RolePermission[];
  changed: { key: string; from: PermissionEffect; to: PermissionEffect }[];
  removed: string[];
}

export function diffEffects(
  before: readonly RolePermission[],
  after: readonly RolePermission[],
): EffectsDiff {
  const oldEffects = new Map(before.map(({ key, effect }) => [key, effect]));
  const newEffects = new Map(after.map(({ key, effect }) => [key, effect]));
  const added: RolePermission[] = [];
  const changed: EffectsDiff["changed"] = [];
  const removed: string[] = [];
  for (const [key, effect] of [...newEffects].sort(([a], [b]) => a.localeCompare(b))) {
    const previous = oldEffects.get(key);
    if (!previous) added.push({ key, effect });
    else if (previous !== effect) changed.push({ key, from: previous, to: effect });
  }
  for (const key of [...oldEffects.keys()].sort()) if (!newEffects.has(key)) removed.push(key);
  return { added, changed, removed };
}

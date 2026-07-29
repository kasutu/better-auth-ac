import { defineCatalog, type Decision, type PermissionCatalog } from "@better-auth-ac/core";
import type { RawRuleOf } from "@casl/ability";

export interface AbilityRule {
  subject: string;
  action: string;
  fields?: string[];
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
            ...(permission.fields ? { fields: [...permission.fields] } : {}),
            inverted: true,
            reason: decision.reason,
          }
        : {
            subject: permission.subject,
            action: permission.action,
            ...(permission.fields ? { fields: [...permission.fields] } : {}),
          },
    ];
  });
  return { version: catalog.version, rules };
}

interface PolicyNode {
  permission?: PermissionCatalog["permissions"][number];
  children: Map<string, PolicyNode>;
}

export function caslModuleEtag(contents: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < contents.length; index += 1) {
    hash ^= contents.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `"casl-${(hash >>> 0).toString(16).padStart(8, "0")}"`;
}

function policyName(segment: string): string {
  const name = segment
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
  return /^\d/.test(name) ? `_${name}` : name;
}

function firstPermissionKey(node: PolicyNode): string {
  if (node.permission) return node.permission.key;
  for (const child of node.children.values()) {
    if (child.permission || child.children.size > 0) return firstPermissionKey(child);
  }
  throw new Error("Generated policy tree contains an empty branch");
}

function policyTree(catalog: PermissionCatalog): PolicyNode {
  const root: PolicyNode = { children: new Map() };
  const permissions = [...catalog.permissions].sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
  );

  for (const permission of permissions) {
    let node = root;
    const segments = permission.key.split(".");
    for (const [index, segment] of segments.entries()) {
      if (node.permission) {
        throw new Error(
          `Generated policy identifier collision: ${node.permission.key} and ${permission.key}`,
        );
      }
      const name = policyName(segment);
      let child = node.children.get(name);
      if (!child) {
        child = { children: new Map() };
        node.children.set(name, child);
      }
      node = child;
      if (index === segments.length - 1) {
        if (node.permission || node.children.size > 0) {
          const otherKey = firstPermissionKey(node);
          throw new Error(
            `Generated policy identifier collision: ${otherKey} and ${permission.key}`,
          );
        }
        node.permission = permission;
      }
    }
  }
  return root;
}

function renderPolicyNode(node: PolicyNode, indentation: string): string {
  return [...node.children.entries()]
    .map(([name, child]) => {
      if (child.permission) {
        const permission = child.permission;
        const serializedFields = permission.fields?.map((field) => JSON.stringify(field));
        const inlineFields = `${indentation}  fields: [${serializedFields?.join(", ")}],`;
        const fields = serializedFields
          ? inlineFields.length <= 100
            ? `\n${inlineFields}`
            : `\n${indentation}  fields: [\n${serializedFields
                .map((field) => `${indentation}    ${field},`)
                .join("\n")}\n${indentation}  ],`
          : "";
        return `${indentation}${name}: {\n${indentation}  key: ${JSON.stringify(permission.key)},\n${indentation}  action: ${JSON.stringify(permission.action)},\n${indentation}  subject: ${JSON.stringify(permission.subject)},${fields}\n${indentation}},`;
      }
      return `${indentation}${name}: {\n${renderPolicyNode(child, `${indentation}  `)}\n${indentation}},`;
    })
    .join("\n");
}

export function generateCaslModule(catalog: PermissionCatalog): string {
  const validatedCatalog = defineCatalog(catalog.permissions);
  if (validatedCatalog.version !== catalog.version) {
    throw new Error("Permission catalog version does not match its definitions");
  }
  const abilities = [
    ...new Set(
      validatedCatalog.permissions.map(
        ({ action, subject }) => `[${JSON.stringify(action)}, ${JSON.stringify(subject)}]`,
      ),
    ),
  ].sort();
  const abilitiesType = abilities.length
    ? `\n${abilities.map((ability) => `  | ${ability}`).join("\n")}`
    : " never";
  const policy = renderPolicyNode(policyTree(validatedCatalog), "  ");

  return `// Generated by @better-auth-ac/casl. Do not edit.

import type { MongoAbility } from "@casl/ability";

export const catalogVersion = ${JSON.stringify(validatedCatalog.version)};

export const Policy = {
${policy}
} as const;

export type AppAbilities =${abilitiesType};
export type AppAbility = MongoAbility<AppAbilities>;
`;
}

export type CaslRawRule = RawRuleOf<import("@casl/ability").MongoAbility>;

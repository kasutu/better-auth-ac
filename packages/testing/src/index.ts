import type {
  AssignedRole,
  Decision,
  PermissionDefinition,
  RolePermission,
} from "@better-auth-ac/core";
import type { ActiveMember, IamRole } from "better-auth-ac";

export const permissionFixture = (
  overrides: Partial<PermissionDefinition> = {},
): PermissionDefinition => ({
  key: "order.read",
  name: "Read orders",
  description: "Read organization orders.",
  group: "Orders",
  subject: "Order",
  action: "read",
  scope: "organization",
  ...overrides,
});

export const roleFixture = (
  overrides: Partial<AssignedRole> & { permissions?: readonly RolePermission[] } = {},
): AssignedRole => ({
  id: "role-1",
  organizationId: "org-1",
  name: "Operator",
  rank: 100,
  permissions: [{ key: "order.read", effect: "ALLOW" }],
  ...overrides,
});

export const storedRoleFixture = (overrides: Partial<IamRole> = {}): IamRole => ({
  id: "role-1",
  organizationId: "org-1",
  name: "Operator",
  color: "#336699",
  rank: 100,
  isProtected: false,
  version: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export const memberFixture = (overrides: Partial<ActiveMember> = {}): ActiveMember => ({
  userId: "user-1",
  memberId: "member-1",
  organizationId: "org-1",
  teamIds: [],
  isOwner: false,
  ...overrides,
});

export const decisionFixture = (overrides: Partial<Decision> = {}): Decision => ({
  key: "order.read",
  effect: "ALLOW",
  allowed: true,
  reason: "An assigned role allows this permission.",
  trace: [],
  ...overrides,
});

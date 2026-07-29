# Better Auth AC

![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178c6.svg)
![Monorepo](https://img.shields.io/badge/Monorepo-npm%20workspaces-orange.svg)
![Tests](https://img.shields.io/badge/Tests-Vitest-6e9f18.svg)

Scoped, multi-tenant role-based access control for Better Auth, NestJS, and CASL.

**[Features](#features)** | **[Quick Start](#quick-start)** | **[Packages](#packages)** |
**[Architecture](#architecture)**

---

## Features

### Core Authorization

- **Default deny**: A missing permission record does not grant access.
- **Explicit deny**: `DENY` overrides `ALLOW` across all assigned roles.
- **Multiple roles**: A member can have more than one organization role.
- **Decision traces**: The evaluator returns stable role and effect details.
- **Scope checks**: Organization and team checks run after role evaluation.

### Role Management

- **Organization roles**: Each organization owns its role names and ranks.
- **Permission effects**: Each role stores `ALLOW`, `DENY`, or no record for a catalog key.
- **Rank checks**: A role manager can change only lower-ranked roles.
- **Protected roles**: Normal mutations cannot change owner or system roles.
- **Version checks**: Compare-and-set writes prevent lost updates.

### Permission Catalog

- **Group boundaries**: `@PermissionGroup()` defines a controller permission prefix.
- **Permission leaves**: `@Permission()` defines and enforces a method permission.
- **Catalog discovery**: Nest `DiscoveryService` reads the same route metadata.
- **Duplicate checks**: Conflicting definitions for one key stop catalog creation.
- **Stable versions**: Catalog content produces a deterministic version.

### Better Auth Integration

- **Server plugin**: The plugin adds schemas and authenticated IAM endpoints.
- **Client plugin**: The client infers the server endpoint types.
- **Verified context**: The plugin gets the organization and member from the session.
- **Transactions**: The host store applies each mutation in one transaction.
- **Session invalidation**: Permission and role changes invalidate affected sessions.

### CASL Output

- **UI rules**: Effective decisions convert to deterministic CASL rules.
- **Deny rules**: An explicit deny creates an inverted rule with a reason.
- **Backend authority**: The backend does not accept CASL rules as authorization evidence.

### Audit Events

- `IAM_ROLE_CREATED`
- `IAM_ROLE_UPDATED`
- `IAM_ROLE_DELETED`
- `IAM_ROLE_PERMISSIONS_CHANGED`
- `IAM_MEMBER_ROLES_CHANGED`

Each event contains the actor, organization, target, outcome, time, and correlation ID. Permission
events contain added, changed, and removed effects.

---

## Quick Start

### Installation

Install the packages that your application uses:

```bash
npm install better-auth-ac @better-auth-ac/core
npm install @better-auth-ac/nest @better-auth-ac/casl
npm install --save-dev @better-auth-ac/testing
```

### Better Auth Setup

```ts
import { betterAuth } from "better-auth";
import { betterAuthAc } from "better-auth-ac";

export const auth = betterAuth({
  database,
  plugins: [
    betterAuthAc({
      catalog,
      store,
      resolveActiveMember: async (session) => {
        return getVerifiedActiveMember(session);
      },
    }),
  ],
});
```

The `store` must implement `IamStore`. It must keep mutations, audit delivery, and session
invalidation in one transaction.

### Permission Declaration

The group decorator works like `@Controller()`. The permission decorator works like `@Get()`.

```ts
import { Controller, Get } from "@nestjs/common";
import { Permission, PermissionGroup } from "@better-auth-ac/nest";

@PermissionGroup("inventory")
@Controller("inventory")
export class InventoryController {
  @Permission("item-types", {
    name: "Read item types",
    description: "Read inventory item types.",
    subject: "ItemType",
    action: "read",
    scope: "organization",
  })
  @Get("item-types")
  listItemTypes() {}
}
```

This declaration creates the permission key `inventory.item-types`. The group key also supplies its
display label, so `inventory` becomes `Inventory`. Use
`@PermissionGroup("iam", { name: "Access control" })` only when the derived label is not suitable.

### Core Evaluation

```ts
import { evaluate } from "@better-auth-ac/core";

const decision = evaluate({
  permission,
  roles,
  organizationId: session.activeOrganizationId,
  teamIds: session.teamIds,
});

if (!decision.allowed) {
  throw new Error(decision.reason);
}
```

### Run the Example

The example requires Node.js 20 or later and npm.

1. Clone the repository and enter its directory:

   ```bash
   git clone https://github.com/kasutu/better-auth-ac.git
   cd better-auth-ac
   ```

2. Install the workspace dependencies:

   ```bash
   npm install
   ```

3. Start the NestJS API and Vite client:

   ```bash
   npm run example:dev
   ```

4. Open `http://127.0.0.1:5173`.
5. Create an account and a factory organization.

The API runs at `http://127.0.0.1:3000`. The example stores its data in
`examples/pokemon-erp/data/pokemon-erp.sqlite`.

---

## Packages

The monorepo contains five packages:

| Package                       | Purpose                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| **`@better-auth-ac/core`**    | Permission types, catalog validation, evaluation, and decision traces     |
| **`better-auth-ac`**          | Better Auth schemas, endpoints, mutations, audit events, and client types |
| **`@better-auth-ac/nest`**    | Group and permission decorators, catalog discovery, module, and guard     |
| **`@better-auth-ac/casl`**    | Deterministic CASL rule output                                            |
| **`@better-auth-ac/testing`** | Permission, role, member, and decision fixtures                           |

---

## Architecture

### High-Level Overview

```text
┌─────────────────────────────────────────────────────┐
│ Better Auth application                             │
│ Verified session → active organization and member   │
└───────────────────────┬─────────────────────────────┘
                        │
                ┌───────▼────────┐
                │ Better Auth AC │
                │ Endpoints      │
                │ Transactions   │
                │ Audit events   │
                └───────┬────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
   ┌──────▼──────┐ ┌────▼────┐ ┌──────▼──────┐
   │ Core        │ │ Nest    │ │ CASL        │
   │ Evaluation  │ │ Guard   │ │ UI rules    │
   │ Validation  │ │ Catalog │ │ Deny rules  │
   └─────────────┘ └─────────┘ └─────────────┘
```

### Authorization Flow

```text
1. Verify the Better Auth session.
2. Get the active organization, member, and teams.
3. Load all assigned roles in one bounded query.
4. Resolve DENY > ALLOW > NONE.
5. Check the organization or team scope.
6. Allow or deny the backend request.
7. Convert the same decisions to CASL rules for the UI.
```

### Data Model

```text
IamRole
  id
  organizationId
  name
  color
  rank
  isProtected
  version
  createdAt
  updatedAt

IamRolePermission
  roleId
  permissionKey
  effect

IamMemberRole
  memberId
  roleId
```

The database must enforce unique role names in each organization. It must also enforce both
role-permission and member-role compound keys.

---

## Security

- Get the tenant from the verified session.
- Do not trust an organization ID from a request body.
- Do not accept frontend CASL rules as authorization evidence.
- Reject unknown catalog keys at the API boundary.
- Protect role changes with tenant, rank, and privilege checks.
- Use database constraints as the final integrity boundary.
- Do not log session tokens, personal data, or complete permission payloads.

---

## Compatibility

| Component   | Supported version      |
| ----------- | ---------------------- |
| Node.js     | 20, 22, 24             |
| Better Auth | 1.6.x                  |
| NestJS      | 10.x, 11.x             |
| CASL        | 6.7.x, 7.x             |
| PostgreSQL  | 15–17 reference schema |

---

## Testing

```bash
npm install
npm run format
npm run typecheck
npm test
npm run build
npm run pack:check
npm run benchmark
```

The tests cover effect precedence, multiple roles, tenant isolation, rank checks, protected roles,
CASL output, audit events, session invalidation, idempotent retries, migration constraints, and
concurrent updates.

---

## License

Apache License 2.0.

The repository records the reviewed `better-auth-iam` source at commit
`cf2761e49e3190a4eb76a38e0a2edc917ad6f698`. The initial release does not copy upstream production
source.

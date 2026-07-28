# better-auth-ac

Scoped, multi-tenant RBAC for Better Auth. One core evaluator resolves multiple organization roles
with `DENY > ALLOW > NONE`; Nest enforces the result and CASL receives deterministic UI rules.

```ts
import { defineCatalog, evaluate } from "@better-auth-ac/core";

const catalog = defineCatalog([
  {
    key: "order.refund",
    name: "Refund orders",
    description: "Issue a full or partial order refund.",
    group: "Orders",
    subject: "Order",
    action: "refund",
    scope: "organization",
  },
]);

const decision = evaluate({
  permission: catalog.permissions[0],
  roles,
  organizationId: session.activeOrganizationId,
});
```

The backend is authoritative. Never accept CASL rules or tenant identifiers from clients as
authorization evidence.

See [docs/integration.md](docs/integration.md), [docs/security.md](docs/security.md), and
[docs/operations.md](docs/operations.md).

# Integration

## Better Auth

Create the catalog through `@better-auth-ac/nest`, then pass it to the plugin:

```ts
betterAuth({
  plugins: [
    betterAuthAc({
      catalog,
      store,
      resolveActiveMember: async (session) => verifiedMemberFromSession(session),
    }),
  ],
});
```

`resolveActiveMember` must derive the active organization and member from the verified Better Auth
session. It must not read an organization ID from request input.

Implement `IamStore` on the application's database adapter. Every callback passed to `transaction`
must run in one database transaction. `audit` and `invalidateSessions` must write to Carbon's durable
delivery mechanism in that same transaction. A worker can then call `AuditService.event()` and
delete affected Better Auth sessions with retry and idempotency.

For Prisma, generate the Better Auth plugin models, add the compound keys and `version` fields from
`postgres-schema.sql`, then implement compare-and-set writes:

```sql
UPDATE "IamRole"
SET version = version + 1
WHERE id = $1 AND version = $2;
```

A zero-row update is a conflict. Do not silently retry it.

## Nest

Import `BetterAuthAcModule.forRoot({ contextResolver })`. The resolver must load all assigned roles
in one query (or a bounded cached query), and the guard evaluates them with the core package.

Permission keys use the same group/leaf composition as Nest controller routes:

```ts
@PermissionGroup("inventory")
@Controller("inventory")
class InventoryController {
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

This declares `inventory.item-types`, and the group display label becomes `Inventory`. A method
permission without a controller group is rejected during catalog discovery. Pass
`{ name: "Custom label" }` as the second argument only when the derived label is not suitable.

## AuditService

Map the five `IamAuditEvent.type` values directly to Carbon audit actions. The event contains IDs,
catalog keys, effect changes, versions, outcome, time, and correlation ID. Do not enrich durable
payloads with session tokens, names, emails, or complete role snapshots.

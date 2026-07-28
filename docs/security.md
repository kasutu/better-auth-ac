# Threat model and security review

## Assets and trust boundaries

The protected assets are organization data, role assignments, permission effects, audit records,
and sessions. HTTP input, frontend CASL rules, tenant IDs, role IDs, permission keys, and versions
are untrusted. Only a verified Better Auth session establishes the actor, active organization,
member, and team memberships.

## Controls

- Default deny and explicit-deny precedence are implemented once in `@better-auth-ac/core`.
- Foreign-organization roles are ignored by evaluation and inaccessible through the store contract.
- Team checks run after RBAC resolution.
- Protected roles cannot be changed through normal mutations.
- Non-owners can manage only lower-ranked roles and cannot grant permissions they lack.
- Catalog keys and request bodies are validated at the boundary.
- Mutations use compare-and-set versions, normalized unique keys, and transactions.
- Audit delivery and session invalidation are transaction responsibilities, preventing unrecorded
  changes and stale authorization after a successful commit.
- CASL output is display-only and is never accepted by backend authorization.
- Production responses omit decision traces.

## Residual risks and release review

Consumer store adapters are security-critical. Before release, review their tenant predicates,
transaction isolation, compare-and-set row counts, durable audit/invalidation delivery, and retry
idempotency. Run the integration suite against every supported adapter and database version.

The initial supported reference is PostgreSQL 15–17 through a consumer-provided transactional
adapter. Other databases are unsupported until equivalent constraint and concurrency tests pass.

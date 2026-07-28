# Operations

## Compatibility

| Component   | Supported              |
| ----------- | ---------------------- |
| Node.js     | 20, 22, 24             |
| Better Auth | 1.6.x                  |
| NestJS      | 10.x, 11.x             |
| CASL        | 6.7.x, 7.x             |
| PostgreSQL  | 15–17 reference schema |

## Migration

1. Back up the authorization tables and session store.
2. Install the normalized schema.
3. Load the discovered catalog and reject unknown legacy keys.
4. Create roles, effects, and member-role rows in one transaction per organization.
5. Compare every member's legacy and new effective permissions.
6. Stop and roll back the organization on any missing role, key, or mismatch.
7. Switch backend guards, invalidate organization sessions, then enable the CASL endpoint.
8. Remove legacy comma and permission-JSON readers only after verification.

## Rollback

Disable IAM mutations, restore the backup or reverse the new tables, switch guards to the previous
resolver, and invalidate all affected sessions. Keep the audit and correlation records.

## Backup

Back up the four IAM tables with the organization, member, session, and durable delivery tables in
the same recovery point. Test restore and effective-permission comparison quarterly.

## Incident response

Freeze IAM mutations, invalidate affected sessions, preserve audit and application logs, identify
organizations and catalog versions by correlation ID, repair assignments transactionally, compare
effective permissions, and document the root cause before re-enabling writes.

## Metrics and logs

Record counts and latency for authorization denials, mutation failures, conflicts, catalog load
failures, audit delivery failures, and invalidation failures. Include correlation ID, action,
organization ID, outcome, and catalog version. Exclude tokens, personal data, and policy snapshots.

## Benchmark

Run `npm run build && npm run benchmark`. The benchmark evaluates 500 catalog permissions across 20
roles with conflicting effects. Record Node version, CPU, operating system, commit, and output in
the release notes; do not treat a developer laptop result as an SLA.

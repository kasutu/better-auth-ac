# Changelog

## 0.4.0

- Add the `*` wildcard role permission. It matches every catalog key. Explicit `DENY` still wins.
  Only owners and wildcard actors can grant it.
- Add `wildcard` to `ActiveMember`, `VerifiedAuthorizationContext`, and `EvaluateInput`. A wildcard
  actor has every permission and needs no member row.
- `toCaslRules()` accepts `{ wildcard: true }` and returns one `manage`/`all` rule.
- Audit events from a wildcard actor contain `actorWildcard: true`.

## 0.3.0

- Add field-aware permission definitions and CASL rules.
- Add the `better-auth-ac-casl` CLI with `init`, `pull`, and `check` commands.
- Add a protected CASL TypeScript artifact endpoint with ETag support.
- Add generated action and subject types for frontend CASL components.
- Fix role mutation responses to include permission effects.
- Fix realtime handling for invalidated member sessions.

## 0.1.0

- Initial core, Better Auth, Nest, CASL, and testing packages.

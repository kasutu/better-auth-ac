# CASL Policy Code Generation Plan

## Status

Final.

## Goal

Pull TypeScript policy values from the Better Auth AC catalog with an explicit command. The
generated module must give IntelliSense and reject invalid CASL action and subject combinations.

```tsx
import { Can } from "./can.js";

<Can I="read" a="Contact">
  View contact
</Can>;
```

The frontend must not maintain a second manual list of actions or subjects.

## Non-goals

- Do not generate user-specific permissions. The `/iam/me/ability` endpoint remains the runtime
  source for the current user's rules.
- Do not make the catalog endpoint public.
- Do not add a Vite plugin or a file watcher.
- Do not fetch policies during `dev` or `build`.
- Do not use generated frontend rules as backend authorization evidence.
- Do not generate DTO types from persistence entities.
- Do not import React, Vue, Angular, or another UI framework in the generated module.

## Current repository support

- `@better-auth-ac/core` defines `PermissionCatalog`.
- `@better-auth-ac/nest` discovers permissions from controller decorators.
- `better-auth-ac` exposes the authenticated `GET /iam/catalog` endpoint.
- `@better-auth-ac/casl` converts effective decisions to CASL rules.
- The example frontend already loads `/iam/me/ability` at runtime.

The code generator can reuse the catalog and CASL packages. The server can generate one
framework-agnostic TypeScript artifact for all CASL consumers.

## Decision

Add a deterministic TypeScript generator to `@better-auth-ac/casl`. The server runs the generator
for its catalog and exposes the result as an authenticated artifact.

Add small `init`, `pull`, and `check` commands to the same package. The `init` command creates the
configuration file. The `pull` command downloads the artifact into the consumer repository.

| Option                                                    | Result                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| Shared handwritten types                                  | Reject. The frontend can drift from backend decorators.        |
| Runtime endpoint inference                                | Reject. Runtime JSON cannot provide compile-time IntelliSense. |
| Vite plugin and watcher                                   | Defer. Policies change less often than source files.           |
| Server-generated artifact with `init` and `pull` commands | Select. One generator serves all repository layouts.           |

Do not add a code-generation framework. Node.js includes the required HTTP, file, and formatting
functions.

## Catalog requirements

Add optional field names to each permission definition:

```ts
export interface PermissionDefinition {
  key: string;
  name: string;
  description: string;
  group: string;
  subject: string;
  action: string;
  scope: PermissionScope;
  fields?: readonly string[];
}
```

Validation must reject empty, blank, or duplicate field names. The catalog version must include the
ordered field list. A field change must produce a new catalog version.

The existing catalog remains the generator input:

```json
{
  "version": "fnv1a-a42d17c0",
  "permissions": [
    {
      "key": "contact.read",
      "subject": "Contact",
      "action": "read",
      "fields": ["id", "displayName", "companyName"]
    }
  ]
}
```

## Server interface

`@better-auth-ac/casl` exports a pure function:

```ts
generateCaslModule(catalog: PermissionCatalog): string
```

`better-auth-ac` uses this function to expose an authenticated artifact:

```http
GET /iam/catalog/casl.ts
Content-Type: text/plain; charset=utf-8
ETag: "casl-3f94716a"
```

The endpoint generates the file once and uses its content hash as the ETag. It must not include
user decisions, session data, or credentials.

## CLI commands

Initialize a frontend project:

```bash
bunx @better-auth-ac/casl init
```

The command guides the user through each required setup value:

1. Confirm that the current directory contains a frontend `package.json`.
2. Explain that the source URL must return the generated CASL TypeScript artifact.
3. Ask for the source URL.
4. Ask for the generated file path. Use `src/generated/better-auth-ac.ts` as the default.
5. Ask whether the endpoint needs authorization.
6. If authorization is required, ask for the environment variable name.
7. Show the proposed configuration and ask for confirmation.
8. Create `better-auth-ac.json`.
9. Offer to run `pull` immediately.

The command creates this configuration:

```json
{
  "source": "http://localhost:3000/api/auth/iam/catalog/casl.ts",
  "output": "src/generated/better-auth-ac.ts",
  "authorizationEnv": "BETTER_AUTH_AC_CATALOG_TOKEN"
}
```

Omit `authorizationEnv` when the source does not require authorization.

### Setup defaults

| Setting                            | Default                                              |
| ---------------------------------- | ---------------------------------------------------- |
| Configuration file                 | `better-auth-ac.json`                                |
| Source URL                         | `http://localhost:3000/api/auth/iam/catalog/casl.ts` |
| Output file                        | `src/generated/better-auth-ac.ts`                    |
| Authorization environment variable | `BETTER_AUTH_AC_CATALOG_TOKEN`                       |
| Pull after initialization          | Yes                                                  |
| Overwrite an existing file         | No                                                   |
| Commit the generated file          | Yes                                                  |

`init` must ask the user to confirm the source URL. Backend ports and authentication paths can
differ between applications.

The command must not overwrite an existing configuration file without confirmation. Flags must
support non-interactive CI and project setup:

```bash
bunx @better-auth-ac/casl init \
  --source https://api.example.com/api/auth/iam/catalog/casl.ts \
  --output src/generated/better-auth-ac.ts
```

After setup, `init` prints these next steps:

```text
1. Set the configured authorization environment variable if the source requires authorization.
2. Run: bunx @better-auth-ac/casl pull
3. Import AppAbility from ./src/generated/better-auth-ac.ts in your CASL integration.
4. Commit better-auth-ac.json and src/generated/better-auth-ac.ts.
```

The guide must remain framework-agnostic. It can link to separate React, Vue, and Angular examples,
but it must not install or generate a framework adapter.

Pull or update the policy module:

```bash
bunx @better-auth-ac/casl pull
```

The application owns endpoint authentication. The CLI reads credentials from environment
variables. It must not print or write credentials.

The `pull` command requires `better-auth-ac.json`. It uses the saved source and output paths.

The configuration supports these fields:

- `source`
- `output`
- optional `authorizationEnv`

The CLI also provides `check` to compare the local file with the server artifact.

The `pull` command must fail on a network error, non-success response, invalid artifact, or
unwritable output. It must use `ETag` and write the output only when the content changes.

## Generated module

The output file is local to the frontend repository:

```ts
// src/generated/better-auth-ac.ts
// Generated by @better-auth-ac/casl. Do not edit.

import type { MongoAbility } from "@casl/ability";

export const catalogVersion = "fnv1a-a42d17c0";

export const Policy = {
  Contact: {
    Read: {
      key: "contact.read",
      action: "read",
      subject: "Contact",
      fields: ["id", "displayName", "companyName"],
    },
  },
} as const;

export type AppAbilities = ["read", "Contact"];
export type AppAbility = MongoAbility<AppAbilities>;
```

The generator must derive names deterministically from permission keys. It must report a collision
instead of renaming a policy silently.

The generated module depends only on `@casl/ability`. It must not depend on a UI framework.

Each UI framework binds its own component or directive. A React application can add this local
adapter:

```tsx
// can.ts
import { Can as CaslCan, type CanProps } from "@casl/react";
import type { ComponentType } from "react";
import type { AppAbility } from "./generated/better-auth-ac.js";

export const Can = CaslCan as ComponentType<CanProps<AppAbility>>;
```

The first version provides action and subject IntelliSense. CASL declares its `field` prop as
`string`, so typed field-to-subject correlation requires a later framework adapter.

## Frontend workflow

Pull or update the policy file explicitly:

```bash
bunx @better-auth-ac/casl pull
```

Development and build commands stay unchanged:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "policy:check": "better-auth-ac-casl check"
  }
}
```

Commit `better-auth-ac.json` and `src/generated/better-auth-ac.ts`. The generated file gives
editors IntelliSense and lets developers inspect policy changes in reviews.

## Pokémon ERP example update

Update the example as part of this feature. The example must show the complete setup and pull
workflow.

### API changes

1. Add `fields` to the permission decorators in the API controllers.
2. Expose the generated artifact at
   `http://127.0.0.1:3000/api/auth/iam/catalog/casl.ts`.
3. Protect the artifact with the example application's build-token middleware.
4. Read the token from `BETTER_AUTH_AC_CATALOG_TOKEN`.
5. Add the variable name and setup instructions to the example README.

Do not provide a default token. The API and frontend commands must use the same environment value.

### Web configuration

Add `examples/pokemon-erp/apps/web/better-auth-ac.json`:

```json
{
  "source": "http://127.0.0.1:3000/api/auth/iam/catalog/casl.ts",
  "output": "src/generated/better-auth-ac.ts",
  "authorizationEnv": "BETTER_AUTH_AC_CATALOG_TOKEN"
}
```

Run the explicit pull command from the web application:

```bash
bunx @better-auth-ac/casl pull
```

Commit the generated module.

### Web code changes

1. Add `src/can.ts` and bind the React `Can` component to generated `AppAbility`.
2. Create the runtime ability with generated `AppAbilities`.
3. Import `AppAbility` from `src/generated/better-auth-ac.ts`.
4. Remove the untyped `[string, string]` ability declaration from `src/types.ts`.
5. Replace direct `@casl/react` `Can` imports with the local typed component.
6. Keep `/iam/me/ability` as the runtime source for the signed-in user's rules.
7. Add `policy:check` to the web package scripts.

The example README must show this sequence:

```text
1. Start the API.
2. Set BETTER_AUTH_AC_CATALOG_TOKEN.
3. Run bunx @better-auth-ac/casl pull after a catalog change.
4. Review and commit the generated file.
5. Start the web application.
```

The README must also explain that new frontend applications run `init` once to create their
configuration.

## Repository layouts

### Monorepo

Run the backend before the frontend `pull` command. The frontend can use the local artifact URL.

```text
backend starts
  -> server generates the CASL artifact
  -> developer runs CASL pull
  -> generated diff is reviewed
```

### Separate repositories

The frontend fetches the deployed CASL artifact. The build environment supplies its credential.

```text
backend deploys generated CASL artifact
  -> frontend team runs CASL pull
  -> generated diff is reviewed
  -> normal development continues
```

The generated file stays in the frontend repository. npm cache state does not affect generation.

## Implementation steps

1. Add and validate `fields` in `PermissionDefinition`.
2. Include fields in catalog hashing and CASL rule output.
3. Add `generateCaslModule()` to `@better-auth-ac/casl`.
4. Add the authenticated `/iam/catalog/casl.ts` artifact endpoint.
5. Add the `bunx @better-auth-ac/casl init`, `pull`, and `check` commands.
6. Add URL loading, safe header handling, `ETag`, and atomic writes.
7. Complete the Pokémon ERP example update in this plan.
8. Add `policy:check` without changing the frontend `dev` and `build` scripts.
9. Update API signatures after the public API review.

## Validation

Add one focused test for each boundary:

- Core rejects invalid fields and changes the catalog version when fields change.
- CASL includes catalog fields in allow and deny rules.
- `generateCaslModule()` produces stable output for the same catalog.
- The server rejects naming collisions and invalid catalogs.
- The `init` command creates configuration and protects an existing file.
- The `init` command explains each value and prints the required next steps.
- The `pull` command preserves an unchanged file and rejects an invalid artifact.
- The `check` command fails when the local artifact is stale.
- Type tests accept valid action-subject pairs and reject invalid pairs.
- The example frontend builds from an installed module.
- The example README documents `init`, `pull`, token setup, and generated-file review.

## Security and operational risks

- Catalog access needs a machine-safe authentication method. Do not store a user session cookie in
  source control.
- Generated policies describe possible actions. They do not grant access.
- Backend guards and purpose-limited DTOs remain the security boundary.
- A separate frontend repository can lag behind a backend deployment. CI should run
  `policy:check` against the intended backend environment.
- The generated module must stay framework-agnostic. Framework adapters remain consumer code.

## Acceptance criteria

- `bunx @better-auth-ac/casl init` creates `better-auth-ac.json`.
- Interactive `init` guides the user through source, output, and authorization setup.
- `bunx @better-auth-ac/casl pull` installs or updates the generated policy file.
- `bun run dev` and `bun run build` do not access the catalog endpoint.
- `<Can I="..." a="...">` provides IntelliSense from the backend catalog.
- TypeScript rejects invalid action-subject combinations.
- `pull` works with local and remote artifact URLs.
- Repeated `pull` commands do not change an unchanged file.
- The generated module imports no UI framework.
- No generator credential appears in output, logs, or generated files.

# Pokémon Supplies Factory ERP

This example uses a Vite React client and a NestJS API. Better Auth and the ERP use one SQLite
file. The API also provides the generated CASL policy contract.

```bash
npm install
export BETTER_AUTH_AC_CATALOG_TOKEN="use-a-local-secret"
npm run dev -w pokemon-erp-api
```

The example does not provide a default catalog token. Keep the same token in a second terminal.

```bash
export BETTER_AUTH_AC_CATALOG_TOKEN="use-a-local-secret"
cd examples/pokemon-erp/apps/web
bunx @better-auth-ac/casl pull
npm run dev
```

Or use Bun:

```bash
bun install
bun run example:dev
```

Open `http://127.0.0.1:5173`. Create an account, create an organization, and use the owner account
to configure roles.

The API runs at `http://127.0.0.1:3000`. It accepts credentialed CORS requests only from
`http://127.0.0.1:5173`.

Run `pull` after an API permission catalog change. Review and commit
`src/generated/better-auth-ac.ts`.

For a new frontend application, run `bunx @better-auth-ac/casl init` once. The command creates
`better-auth-ac.json` and guides you through the source URL, output file, and authorization setup.
The normal `dev` and `build` commands do not download the policy contract.

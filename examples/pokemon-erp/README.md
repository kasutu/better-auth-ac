# Pokémon Supplies Factory ERP

This example uses a Vite React client and a NestJS API. Better Auth and the ERP use one SQLite
file.

```bash
npm install
npm run example:dev
```

Open `http://127.0.0.1:5173`. Create an account, create an organization, and use the owner account
to configure roles.

The API runs at `http://127.0.0.1:3000`. It accepts credentialed CORS requests only from
`http://127.0.0.1:5173`.

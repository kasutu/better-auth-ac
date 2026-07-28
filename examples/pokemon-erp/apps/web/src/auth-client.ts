import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { betterAuthAcClient } from "better-auth-ac/client";

export const API_ORIGIN = "http://127.0.0.1:3000";

export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  plugins: [organizationClient({ teams: { enabled: true } }), betterAuthAcClient()],
});

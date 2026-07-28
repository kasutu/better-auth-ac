import { useEffect, useMemo, useState } from "react";
import { createMongoAbility } from "@casl/ability";
import { AbilityProvider } from "@casl/react";
import { authClient } from "./auth-client";
import { api } from "./api";
import type { AbilityPayload } from "./types";
import { AuthScreen } from "./components/AuthScreen";
import { OrganizationSetup } from "./components/OrganizationSetup";
import { SuppliesPanel } from "./components/SuppliesPanel";
import { ProductionPanel } from "./components/ProductionPanel";
import { RolesPanel } from "./components/RolesPanel";
import { MembersPanel } from "./components/MembersPanel";
import { AuditPanel } from "./components/AuditPanel";

type Tab = "supplies" | "production" | "roles" | "members" | "audit";

export default function App() {
  const session = authClient.useSession();
  const ability = useMemo(() => createMongoAbility<[string, string]>([]), []);
  const [abilityVersion, setAbilityVersion] = useState("");
  const [tab, setTab] = useState<Tab>("supplies");
  const [error, setError] = useState("");
  const activeOrganizationId = (
    session.data?.session as { activeOrganizationId?: string | null } | undefined
  )?.activeOrganizationId;

  async function loadAbility() {
    try {
      const payload = await api<AbilityPayload>("/api/auth/iam/me/ability");
      ability.update(payload.rules);
      setAbilityVersion(payload.version);
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not load ability");
    }
  }

  useEffect(() => {
    if (activeOrganizationId) void loadAbility();
  }, [activeOrganizationId]);

  const tabs = useMemo(
    () =>
      [
        ["supplies", "Supplies", ability.can("read", "Supply")],
        ["production", "Production", ability.can("read", "ProductionOrder")],
        ["roles", "Roles", ability.can("read", "IamRole")],
        ["members", "Members", ability.can("manage", "OrganizationMember")],
        ["audit", "Audit", ability.can("read", "AuditEvent")],
      ].filter((value) => value[2]) as Array<[Tab, string, boolean]>,
    [ability, abilityVersion],
  );

  useEffect(() => {
    const firstTab = tabs[0]?.[0];
    if (firstTab && !tabs.some(([value]) => value === tab)) setTab(firstTab);
  }, [tab, tabs]);

  if (session.isPending) return <p>Loading session…</p>;
  if (!session.data) return <AuthScreen />;
  if (!activeOrganizationId) return <OrganizationSetup />;

  const panels: Record<Tab, React.ReactNode> = {
    supplies: <SuppliesPanel />,
    production: <ProductionPanel />,
    roles: <RolesPanel />,
    members: <MembersPanel />,
    audit: <AuditPanel />,
  };

  return (
    <AbilityProvider value={ability}>
      <header>
        <h1>Pokémon Supplies Factory ERP</h1>
        <p>
          Signed in as {session.data.user.name} ({session.data.user.email})
        </p>
        <button type="button" onClick={() => void loadAbility()}>
          Refresh ability
        </button>
        <button type="button" onClick={() => void authClient.signOut()}>
          Sign out
        </button>
      </header>
      <nav aria-label="ERP sections">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-current={tab === value ? "page" : undefined}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main>
        {error ? <p role="alert">{error}</p> : null}
        {tabs.length ? panels[tab] : <p>Your assigned roles do not allow any ERP actions.</p>}
      </main>
    </AbilityProvider>
  );
}

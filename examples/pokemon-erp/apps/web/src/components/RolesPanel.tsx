import { useEffect, useState, type FormEvent } from "react";
import { Can } from "@casl/react";
import { api } from "../api";
import type { Catalog, Role } from "../types";

type Effect = "ALLOW" | "DENY" | "NONE";

export function RolesPanel() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [effects, setEffects] = useState<Record<string, Effect>>({});
  const [error, setError] = useState("");
  const selected = roles.find(({ id }) => id === selectedId);

  async function load(preferredId?: string) {
    try {
      const [catalogValue, roleValue] = await Promise.all([
        api<Catalog>("/api/auth/iam/catalog"),
        api<{ roles: Role[] }>("/api/auth/iam/roles"),
      ]);
      setCatalog(catalogValue);
      setRoles(roleValue.roles);
      setSelectedId(preferredId ?? roleValue.roles[0]?.id ?? "");
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not load roles");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setEffects(
      Object.fromEntries(
        catalog?.permissions.map((permission) => [
          permission.key,
          selected?.permissions.find(({ key }) => key === permission.key)?.effect ?? "NONE",
        ]) ?? [],
      ),
    );
  }, [catalog, selected]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = await api<Role>("/api/auth/iam/roles/create", {
      method: "POST",
      body: {
        name: form.get("name"),
        color: form.get("color"),
        rank: Number(form.get("rank")),
      },
    });
    await load(role.id);
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const role = await api<Role>("/api/auth/iam/roles/update", {
      method: "POST",
      body: {
        roleId: selected.id,
        expectedVersion: selected.version,
        name: form.get("name"),
        color: form.get("color"),
        rank: Number(form.get("rank")),
      },
    });
    await load(role.id);
  }

  async function saveEffects() {
    if (!selected) return;
    const role = await api<Role>("/api/auth/iam/roles/set-permissions", {
      method: "POST",
      body: {
        roleId: selected.id,
        expectedVersion: selected.version,
        effects: Object.entries(effects).flatMap(([key, effect]) =>
          effect === "NONE" ? [] : [{ key, effect }],
        ),
      },
    });
    await load(role.id);
  }

  async function remove() {
    if (!selected || !window.confirm(`Delete ${selected.name}?`)) return;
    await api("/api/auth/iam/roles/delete", {
      method: "POST",
      body: { roleId: selected.id, expectedVersion: selected.version },
    });
    await load();
  }

  return (
    <section>
      <h2>Access roles</h2>
      {error ? <p role="alert">{error}</p> : null}
      <Can I="manage" a="IamRole">
        <h3>Create role</h3>
        <form onSubmit={(event) => void create(event)}>
          <label>
            Name
            <input name="name" required />
          </label>
          <label>
            Color
            <input name="color" type="color" defaultValue="#336699" required />
          </label>
          <label>
            Rank
            <input name="rank" type="number" min="1" defaultValue="100" required />
          </label>
          <button type="submit">Create role</button>
        </form>
      </Can>

      {roles.length ? (
        <label>
          Role
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name} (rank {role.rank})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p>No roles.</p>
      )}

      {selected && catalog ? (
        <>
          <Can I="manage" a="IamRole">
            <h3>Role details</h3>
            <form key={selected.id} onSubmit={(event) => void update(event)}>
              <label>
                Name
                <input name="name" defaultValue={selected.name} required />
              </label>
              <label>
                Color
                <input name="color" type="color" defaultValue={selected.color} required />
              </label>
              <label>
                Rank
                <input name="rank" type="number" min="1" defaultValue={selected.rank} required />
              </label>
              <button type="submit">Update role</button>
              <button type="button" onClick={() => void remove()}>
                Delete role
              </button>
            </form>
          </Can>

          <h3>Permission effects</h3>
          <table>
            <thead>
              <tr>
                <th>Permission</th>
                <th>Description</th>
                <th>Effect</th>
              </tr>
            </thead>
            <tbody>
              {catalog.permissions.map((permission) => (
                <tr key={permission.key}>
                  <td>
                    {permission.group}: {permission.name}
                    <br />
                    <code>{permission.key}</code>
                  </td>
                  <td>{permission.description}</td>
                  <td>
                    <select
                      value={effects[permission.key] ?? "NONE"}
                      onChange={(event) =>
                        setEffects((value) => ({
                          ...value,
                          [permission.key]: event.target.value as Effect,
                        }))
                      }
                    >
                      <option value="DENY">DENY</option>
                      <option value="NONE">NONE</option>
                      <option value="ALLOW">ALLOW</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Can I="manage" a="IamRole">
            <button type="button" onClick={() => void saveEffects()}>
              Save permission effects
            </button>
          </Can>
        </>
      ) : null}
    </section>
  );
}

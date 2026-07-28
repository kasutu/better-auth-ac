import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "../auth-client";

type Organization = { id: string; name: string; slug: string };

export function OrganizationSetup() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void authClient.organization.list().then(({ data }) => setOrganizations(data ?? []));
  }, []);

  async function select(organizationId: string) {
    const result = await authClient.organization.setActive({ organizationId });
    if (result.error) setError(result.error.message ?? "Could not select organization");
    else window.location.reload();
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name"));
    const slug = String(form.get("slug"));
    const result = await authClient.organization.create({ name, slug });
    if (result.error) {
      setError(result.error.message ?? "Could not create organization");
      return;
    }
    if (result.data) await select(result.data.id);
  }

  return (
    <main>
      <h1>Select a factory</h1>
      {organizations.length ? (
        <ul>
          {organizations.map((organization) => (
            <li key={organization.id}>
              <button type="button" onClick={() => void select(organization.id)}>
                {organization.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <h2>Create a factory</h2>
      <form onSubmit={create}>
        <label>
          Name
          <input name="name" defaultValue="Kanto Supply Works" required />
        </label>
        <label>
          Slug
          <input name="slug" defaultValue={`kanto-${Date.now()}`} required />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit">Create factory</button>
      </form>
    </main>
  );
}

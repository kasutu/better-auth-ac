import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "../auth-client";
import { api } from "../api";
import type { Member, MemberRoles, Role } from "../types";
import { useRealtime } from "../realtime";

const MEMBER_TOPICS = ["members", "roles"] as const;

export function MembersPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [memberResult, roleResult] = await Promise.all([
        authClient.organization.listMembers({
          query: { limit: 100 },
          fetchOptions: { cache: "no-store" },
        }),
        api<{ roles: Role[] }>("/api/auth/iam/roles"),
      ]);
      const values = (memberResult.data?.members ?? []) as Member[];
      setMembers(values);
      setRoles(roleResult.roles);
      setSelectedMemberId((current) => current || values[0]?.id || "");
      setError(memberResult.error?.message ?? "");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not load members");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function loadMemberRoles() {
    if (!selectedMemberId) return;
    return api<MemberRoles>(
      `/api/auth/iam/member/roles?memberId=${encodeURIComponent(selectedMemberId)}`,
    )
      .then((value) => {
        setVersion(value.version);
        setSelectedRoleIds(value.roles.map(({ id }) => id));
      })
      .catch((value: unknown) =>
        setError(value instanceof Error ? value.message : "Could not load member roles"),
      );
  }

  useEffect(() => {
    void loadMemberRoles();
  }, [selectedMemberId]);
  useRealtime(MEMBER_TOPICS, () => {
    void load();
    void loadMemberRoles();
  });

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const email = String(form.get("email"));
    const member: Member = {
      id: crypto.randomUUID(),
      userId: "",
      role: "member",
      user: { name: email, email },
    };
    setMembers((value) => [...value, member]);
    try {
      await api("/api/members", {
        method: "POST",
        body: { email },
      });
      element.reset();
      await load();
    } catch (value) {
      setMembers((value) => value.filter(({ id }) => id !== member.id));
      setError(value instanceof Error ? value.message : "Could not add member");
    }
  }

  async function save() {
    setVersion((value) => value + 1);
    try {
      await api("/api/auth/iam/members/set-roles", {
        method: "POST",
        body: {
          memberId: selectedMemberId,
          roleIds: selectedRoleIds,
          expectedVersion: version,
        },
      });
    } catch (value) {
      setVersion((current) => current - 1);
      setError(value instanceof Error ? value.message : "Could not save member roles");
    }
  }

  return (
    <section>
      <h2>Members</h2>
      {error ? <p role="alert">{error}</p> : null}
      <form onSubmit={(event) => void add(event)}>
        <label>
          Existing user email
          <input name="email" type="email" required />
        </label>
        <button type="submit">Add member</button>
      </form>
      <p>Create the user account first, then add its email here.</p>

      <label>
        Member
        <select
          value={selectedMemberId}
          onChange={(event) => setSelectedMemberId(event.target.value)}
        >
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.user.name} ({member.user.email}) — {member.role}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Assigned AC roles</legend>
        {roles.map((role) => (
          <label key={role.id}>
            <input
              type="checkbox"
              checked={selectedRoleIds.includes(role.id)}
              onChange={(event) =>
                setSelectedRoleIds((value) =>
                  event.target.checked ? [...value, role.id] : value.filter((id) => id !== role.id),
                )
              }
            />
            {role.name}
          </label>
        ))}
      </fieldset>
      <button type="button" disabled={!selectedMemberId} onClick={() => void save()}>
        Save member roles
      </button>
    </section>
  );
}

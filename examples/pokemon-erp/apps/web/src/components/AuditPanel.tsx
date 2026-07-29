import { useEffect, useState } from "react";
import { api } from "../api";
import type { AuditEvent } from "../types";
import { useRealtime } from "../realtime";

export function AuditPanel() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");

  function load() {
    return api<AuditEvent[]>("/api/audit")
      .then(setEvents)
      .catch((value: unknown) =>
        setError(value instanceof Error ? value.message : "Could not load audit events"),
      );
  }

  useEffect(() => {
    void load();
  }, []);
  useRealtime("audit", () => void load());

  return (
    <section>
      <h2>Audit events</h2>
      {error ? <p role="alert">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Type</th>
            <th>Target</th>
            <th>Outcome</th>
            <th>Changes</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{new Date(event.occurredAt).toLocaleString()}</td>
              <td>{event.type}</td>
              <td>
                <code>{event.targetId}</code>
              </td>
              <td>{event.outcome}</td>
              <td>
                <pre>{JSON.stringify(event.data, null, 2)}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

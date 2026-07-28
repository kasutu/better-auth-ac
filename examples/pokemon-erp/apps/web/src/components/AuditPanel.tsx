import { useEffect, useState } from "react";
import { api } from "../api";
import type { AuditEvent } from "../types";

export function AuditPanel() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<AuditEvent[]>("/api/audit")
      .then(setEvents)
      .catch((value: unknown) =>
        setError(value instanceof Error ? value.message : "Could not load audit events"),
      );
  }, []);

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

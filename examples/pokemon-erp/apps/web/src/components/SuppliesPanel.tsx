import { useEffect, useState, type FormEvent } from "react";
import { Can } from "@casl/react";
import type { Supply } from "../types";
import { api } from "../api";

export function SuppliesPanel() {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      setSupplies(await api<Supply[]>("/api/supplies"));
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not load supplies");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/supplies", {
      method: "POST",
      body: {
        name: form.get("name"),
        category: form.get("category"),
        quantity: Number(form.get("quantity")),
        reorderLevel: Number(form.get("reorderLevel")),
      },
    });
    event.currentTarget.reset();
    await load();
  }

  async function adjust(id: string, change: number) {
    await api(`/api/supplies/${id}/stock`, { method: "PATCH", body: { change } });
    await load();
  }

  return (
    <section>
      <h2>Supplies</h2>
      {error ? <p role="alert">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Stock</th>
            <th>Reorder at</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {supplies.map((supply) => (
            <tr key={supply.id}>
              <td>{supply.name}</td>
              <td>{supply.category}</td>
              <td>{supply.quantity}</td>
              <td>{supply.reorderLevel}</td>
              <td>
                <Can I="update" a="Supply">
                  <button type="button" onClick={() => void adjust(supply.id, 1)}>
                    +1
                  </button>
                  <button type="button" onClick={() => void adjust(supply.id, -1)}>
                    -1
                  </button>
                </Can>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Can I="create" a="Supply">
        <h3>Add supply</h3>
        <form onSubmit={(event) => void create(event)}>
          <label>
            Name
            <input name="name" required />
          </label>
          <label>
            Category
            <input name="category" required />
          </label>
          <label>
            Quantity
            <input name="quantity" type="number" min="0" defaultValue="0" required />
          </label>
          <label>
            Reorder level
            <input name="reorderLevel" type="number" min="0" defaultValue="10" required />
          </label>
          <button type="submit">Add supply</button>
        </form>
      </Can>
    </section>
  );
}

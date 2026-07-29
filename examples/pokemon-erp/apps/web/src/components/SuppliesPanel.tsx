import { useEffect, useState, type FormEvent } from "react";
import { Can } from "../can";
import type { Supply } from "../types";
import { api } from "../api";
import { useRealtime } from "../realtime";

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
  useRealtime("supplies", () => void load());

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const supply: Supply = {
      id: crypto.randomUUID(),
      name: String(form.get("name")),
      category: String(form.get("category")),
      quantity: Number(form.get("quantity")),
      reorderLevel: Number(form.get("reorderLevel")),
    };
    setSupplies((value) => [...value, supply].sort((a, b) => a.name.localeCompare(b.name)));
    element.reset();
    try {
      const saved = await api<Supply>("/api/supplies", { method: "POST", body: supply });
      setSupplies((value) => value.map((item) => (item.id === supply.id ? saved : item)));
    } catch (value) {
      setSupplies((items) => items.filter(({ id }) => id !== supply.id));
      setError(value instanceof Error ? value.message : "Could not add supply");
    }
  }

  async function adjust(id: string, change: number) {
    const previous = supplies.find((supply) => supply.id === id);
    if (!previous) return;
    setSupplies((value) =>
      value.map((supply) =>
        supply.id === id ? { ...supply, quantity: supply.quantity + change } : supply,
      ),
    );
    try {
      const saved = await api<Supply>(`/api/supplies/${id}/stock`, {
        method: "PATCH",
        body: { change },
      });
      setSupplies((value) => value.map((supply) => (supply.id === id ? saved : supply)));
    } catch (value) {
      setSupplies((items) => items.map((supply) => (supply.id === id ? previous : supply)));
      setError(value instanceof Error ? value.message : "Could not adjust stock");
    }
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
                  <button
                    type="button"
                    disabled={supply.quantity === 0}
                    onClick={() => void adjust(supply.id, -1)}
                  >
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

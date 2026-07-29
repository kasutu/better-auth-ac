import { useEffect, useState, type FormEvent } from "react";
import { Can } from "@casl/react";
import type { ProductionOrder } from "../types";
import { api } from "../api";
import { useRealtime } from "../realtime";

export function ProductionPanel() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      setOrders(await api<ProductionOrder[]>("/api/production"));
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not load production");
    }
  }

  useEffect(() => {
    void load();
  }, []);
  useRealtime("production", () => void load());

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const order: ProductionOrder = {
      id: crypto.randomUUID(),
      product: String(form.get("product")),
      quantity: Number(form.get("quantity")),
      status: "COMPLETED",
      createdAt: new Date().toISOString(),
    };
    setOrders((value) => [order, ...value]);
    try {
      const saved = await api<ProductionOrder>("/api/production", {
        method: "POST",
        body: order,
      });
      setOrders((value) => value.map((item) => (item.id === order.id ? saved : item)));
    } catch (value) {
      setOrders((value) => value.filter(({ id }) => id !== order.id));
      setError(value instanceof Error ? value.message : "Production failed");
    }
  }

  return (
    <section>
      <h2>Production</h2>
      {error ? <p role="alert">{error}</p> : null}
      <Can I="create" a="ProductionOrder">
        <form onSubmit={(event) => void run(event)}>
          <label>
            Product
            <select name="product">
              <option>Poké Ball Crate</option>
              <option>Great Ball Crate</option>
              <option>Potion Kit</option>
            </select>
          </label>
          <label>
            Quantity
            <input name="quantity" type="number" min="1" defaultValue="1" required />
          </label>
          <button type="submit">Run production</button>
        </form>
      </Can>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Quantity</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.product}</td>
              <td>{order.quantity}</td>
              <td>{order.status}</td>
              <td>{new Date(order.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

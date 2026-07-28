import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { ErpService } from "../src/erp.service.js";

describe("ERP production", () => {
  it("consumes stock atomically and rejects an order that needs too much", () => {
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE supply (
        id TEXT PRIMARY KEY, organizationId TEXT NOT NULL, name TEXT NOT NULL,
        category TEXT NOT NULL, quantity INTEGER NOT NULL, reorderLevel INTEGER NOT NULL
      );
      CREATE TABLE productionOrder (
        id TEXT PRIMARY KEY, organizationId TEXT NOT NULL, product TEXT NOT NULL,
        quantity INTEGER NOT NULL, status TEXT NOT NULL, createdAt TEXT NOT NULL
      );
    `);
    const erp = new ErpService(database);

    erp.runProduction("factory", "Poké Ball Crate", 5);

    expect(
      erp.listSupplies("factory").find(({ name }) => name === "Poké Ball Shell")?.quantity,
    ).toBe(110);
    expect(() => erp.runProduction("factory", "Poké Ball Crate", 56)).toThrow(
      "Production requires 112 Poké Ball Shell units",
    );
    expect(erp.listProduction("factory")).toHaveLength(1);
    database.close();
  });
});

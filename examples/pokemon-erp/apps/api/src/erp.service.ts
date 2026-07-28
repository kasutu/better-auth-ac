import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type Database from "better-sqlite3";
import { DATABASE } from "./database.js";

export interface Supply {
  id: string;
  organizationId: string;
  name: string;
  category: string;
  quantity: number;
  reorderLevel: number;
}

export interface ProductionOrder {
  id: string;
  organizationId: string;
  product: string;
  quantity: number;
  status: string;
  createdAt: string;
}

@Injectable()
export class ErpService {
  constructor(@Inject(DATABASE) private readonly database: Database.Database) {}

  listSupplies(organizationId: string): Supply[] {
    this.seed(organizationId);
    return this.database
      .prepare("SELECT * FROM supply WHERE organizationId = ? ORDER BY name")
      .all(organizationId) as Supply[];
  }

  createSupply(
    organizationId: string,
    input: Pick<Supply, "name" | "category" | "quantity" | "reorderLevel">,
  ): Supply {
    if (!input.name.trim() || !input.category.trim()) {
      throw new BadRequestException("Name and category are required");
    }
    if (input.quantity < 0 || input.reorderLevel < 0) {
      throw new BadRequestException("Quantities must not be negative");
    }
    const id = randomUUID();
    this.database
      .prepare(
        `INSERT INTO supply
          (id, organizationId, name, category, quantity, reorderLevel)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        organizationId,
        input.name.trim(),
        input.category.trim(),
        input.quantity,
        input.reorderLevel,
      );
    return this.database.prepare("SELECT * FROM supply WHERE id = ?").get(id) as Supply;
  }

  adjustStock(organizationId: string, id: string, change: number): Supply {
    if (!Number.isInteger(change) || change === 0) {
      throw new BadRequestException("Stock change must be a non-zero integer");
    }
    const result = this.database
      .prepare(
        `UPDATE supply
         SET quantity = quantity + ?
         WHERE id = ? AND organizationId = ? AND quantity + ? >= 0`,
      )
      .run(change, id, organizationId, change);
    if (result.changes !== 1) throw new NotFoundException("Supply not found or stock is too low");
    return this.database.prepare("SELECT * FROM supply WHERE id = ?").get(id) as Supply;
  }

  listProduction(organizationId: string): ProductionOrder[] {
    return this.database
      .prepare("SELECT * FROM productionOrder WHERE organizationId = ? ORDER BY createdAt DESC")
      .all(organizationId) as ProductionOrder[];
  }

  runProduction(organizationId: string, product: string, quantity: number): ProductionOrder {
    if (!product.trim() || !Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException("Product and a positive quantity are required");
    }
    this.seed(organizationId);
    const order = this.database.transaction(() => {
      const material = this.database
        .prepare("SELECT * FROM supply WHERE organizationId = ? AND name = 'Poké Ball Shell'")
        .get(organizationId) as Supply;
      const required = quantity * 2;
      if (material.quantity < required) {
        throw new BadRequestException(`Production requires ${required} Poké Ball Shell units`);
      }
      this.database
        .prepare("UPDATE supply SET quantity = quantity - ? WHERE id = ?")
        .run(required, material.id);
      const value: ProductionOrder = {
        id: randomUUID(),
        organizationId,
        product: product.trim(),
        quantity,
        status: "COMPLETED",
        createdAt: new Date().toISOString(),
      };
      this.database
        .prepare(
          `INSERT INTO productionOrder
            (id, organizationId, product, quantity, status, createdAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          value.id,
          value.organizationId,
          value.product,
          value.quantity,
          value.status,
          value.createdAt,
        );
      return value;
    })();
    return order;
  }

  private seed(organizationId: string): void {
    const count = this.database
      .prepare("SELECT count(*) AS count FROM supply WHERE organizationId = ?")
      .get(organizationId) as { count: number };
    if (count.count) return;
    const insert = this.database.prepare(
      `INSERT INTO supply
        (id, organizationId, name, category, quantity, reorderLevel)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const item of [
      ["Poké Ball Shell", "Components", 120, 30],
      ["Potion Base", "Ingredients", 80, 20],
      ["Berry Extract", "Ingredients", 45, 15],
    ] as const) {
      insert.run(randomUUID(), organizationId, ...item);
    }
  }
}

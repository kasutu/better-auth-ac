import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export const DATABASE = Symbol("pokemon-erp:database");

export function createDatabase(): Database.Database {
  const path = process.env.DATABASE_PATH
    ? resolve(process.env.DATABASE_PATH)
    : fileURLToPath(new URL("../../../data/pokemon-erp.sqlite", import.meta.url));
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  return database;
}

export function ensureExampleSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS supply (
      id TEXT PRIMARY KEY,
      organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      reorderLevel INTEGER NOT NULL DEFAULT 0,
      UNIQUE (organizationId, name)
    );

    CREATE TABLE IF NOT EXISTS productionOrder (
      id TEXT PRIMARY KEY,
      organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      product TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
}

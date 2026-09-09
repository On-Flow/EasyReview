import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "fs";
import path from "path";

const DB_DIR = path.join(process.cwd(), ".cache");
const DB_PATH = path.join(DB_DIR, "easyreview.db");

let db: DatabaseSync | null = null;

// Module-level singleton: Next.js keeps this module alive across requests
// within one server process, so we only want one open handle to the file.
export function getDb(): DatabaseSync {
  if (db) return db;

  mkdirSync(DB_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS prs (
      pr_number INTEGER PRIMARY KEY,
      head_sha TEXT NOT NULL,
      data TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviewed_hunks (
      pr_number INTEGER NOT NULL,
      hunk_id TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      PRIMARY KEY (pr_number, hunk_id)
    );
  `);
  return db;
}

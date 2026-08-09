import { Client } from "pg";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "migrations");

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    text primary key,
    applied_at  timestamptz not null default now()
  )
`);
}

async function getAppliedMigrations(client: Client): Promise<Set<string>> {
  const res = await client.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations",
  );
  const filenameSet = res.rows.map((r) => r.filename);
  return new Set(filenameSet);
}

async function getPendingMigrations(applied: Set<string>): Promise<string[]> {
  const dirs = await readdir(MIGRATIONS_DIR);
  return dirs
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !applied.has(f))
    .sort();
}

async function applyMigration(client: Client, filename: string): Promise<void> {
  const sql = await readFile(path.join(MIGRATIONS_DIR, filename), "utf8");
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
      filename,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("url is not set");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const pending = await getPendingMigrations(applied);

    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    for (const filename of pending) {
      console.log(`Applying ${filename}`);
      await applyMigration(client, filename);
    }
    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

runMigrations().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

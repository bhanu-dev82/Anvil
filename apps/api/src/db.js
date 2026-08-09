import pg from "pg";

export function createPool(url) {
  return new pg.Pool({ connectionString: url, max: 10 });
}

export async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      tool TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INT NOT NULL DEFAULT 0,
      message TEXT,
      input_keys JSONB NOT NULL DEFAULT '[]',
      options JSONB NOT NULL DEFAULT '{}',
      output_key TEXT,
      output_name TEXT,
      input_bytes BIGINT,
      output_bytes BIGINT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS jobs_created_idx ON jobs (created_at DESC);
    CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);
  `);
}

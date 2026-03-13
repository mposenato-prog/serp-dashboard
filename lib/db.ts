import { sql } from "@vercel/postgres";

export { sql };

export async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT 'it',
      language TEXT NOT NULL DEFAULT 'it',
      keywords TEXT NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS runs (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      with_ai INTEGER NOT NULL DEFAULT 0,
      with_domain INTEGER NOT NULL DEFAULT 0,
      with_domain_in_ai INTEGER NOT NULL DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS keyword_results (
      id SERIAL PRIMARY KEY,
      run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL,
      has_ai_overview BOOLEAN NOT NULL DEFAULT FALSE,
      domain_in_organic BOOLEAN NOT NULL DEFAULT FALSE,
      domain_position INTEGER,
      domain_in_ai_sources BOOLEAN NOT NULL DEFAULT FALSE,
      total_organic_results INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      error TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ai_sources (
      id SERIAL PRIMARY KEY,
      keyword_result_id INTEGER NOT NULL REFERENCES keyword_results(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      domain TEXT NOT NULL
    )
  `;
}

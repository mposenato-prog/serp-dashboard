import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export async function GET() {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM projects ORDER BY created_at DESC`;
  return NextResponse.json({ projects: rows });
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const { name, domain, location, language, keywords } = await req.json();
  if (!name || !domain) {
    return NextResponse.json({ error: "name and domain required" }, { status: 400 });
  }
  const { rows } = await sql`
    INSERT INTO projects (name, domain, location, language, keywords)
    VALUES (${name}, ${domain}, ${location || "it"}, ${language || "it"}, ${JSON.stringify(keywords || [])})
    RETURNING *
  `;
  return NextResponse.json({ project: rows[0] });
}

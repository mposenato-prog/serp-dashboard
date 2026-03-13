import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSchema();
  const { id } = await params;
  const { rows } = await sql`SELECT * FROM projects WHERE id = ${id}`;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project: rows[0] });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSchema();
  const { id } = await params;
  const { name, domain, location, language, keywords } = await req.json();
  const { rows } = await sql`
    UPDATE projects SET name=${name}, domain=${domain}, location=${location}, language=${language}, keywords=${JSON.stringify(keywords || [])}
    WHERE id=${id} RETURNING *
  `;
  return NextResponse.json({ project: rows[0] });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSchema();
  const { id } = await params;
  await sql`DELETE FROM projects WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}

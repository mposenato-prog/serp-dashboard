import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  await ensureSchema();
  const { runId } = await params;

  const { rows: runRows } = await sql`SELECT * FROM runs WHERE id = ${runId}`;
  if (!runRows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { rows: kwRows } = await sql`
    SELECT * FROM keyword_results WHERE run_id = ${runId} ORDER BY id ASC
  `;

  const results = await Promise.all(
    kwRows.map(async (kw) => {
      const { rows: sources } = await sql`
        SELECT * FROM ai_sources WHERE keyword_result_id = ${kw.id}
      `;
      return {
        keyword: kw.keyword,
        hasAiOverview: kw.has_ai_overview,
        domainInOrganic: kw.domain_in_organic,
        domainPosition: kw.domain_position ?? null,
        domainInAiSources: kw.domain_in_ai_sources,
        totalOrganicResults: kw.total_organic_results,
        status: kw.status,
        error: kw.error,
        aiSources: sources.map((s) => ({
          title: s.title,
          url: s.url,
          domain: s.domain,
        })),
      };
    })
  );

  return NextResponse.json({ run: runRows[0], results });
}

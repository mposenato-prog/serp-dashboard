import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import type { KeywordResult } from "@/app/api/analyze/route";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSchema();
  const { id } = await params;
  const { rows } = await sql`
    SELECT * FROM runs WHERE project_id = ${id} ORDER BY run_at DESC
  `;
  return NextResponse.json({ runs: rows });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSchema();
  const { id } = await params;
  const { results, location, language } = (await req.json()) as {
    results: KeywordResult[];
    location: string;
    language: string;
  };

  const success = results.filter((r) => r.status === "success");
  const withAi = success.filter((r) => r.hasAiOverview).length;
  const withDomain = success.filter((r) => r.domainInOrganic).length;
  const withDomainInAi = success.filter((r) => r.domainInAiSources).length;

  const { rows: runRows } = await sql`
    INSERT INTO runs (project_id, location, language, total, with_ai, with_domain, with_domain_in_ai)
    VALUES (${id}, ${location}, ${language}, ${success.length}, ${withAi}, ${withDomain}, ${withDomainInAi})
    RETURNING *
  `;
  const run = runRows[0];

  for (const r of results) {
    const { rows: kwRows } = await sql`
      INSERT INTO keyword_results
        (run_id, keyword, has_ai_overview, domain_in_organic, domain_position, domain_in_ai_sources, total_organic_results, status, error)
      VALUES
        (${run.id}, ${r.keyword}, ${r.hasAiOverview}, ${r.domainInOrganic}, ${r.domainPosition ?? null},
         ${r.domainInAiSources}, ${r.totalOrganicResults}, ${r.status}, ${r.error ?? null})
      RETURNING id
    `;
    const kwId = kwRows[0].id;
    for (const s of r.aiSources) {
      await sql`
        INSERT INTO ai_sources (keyword_result_id, title, url, domain)
        VALUES (${kwId}, ${s.title}, ${s.url}, ${s.domain})
      `;
    }
  }

  return NextResponse.json({ run });
}

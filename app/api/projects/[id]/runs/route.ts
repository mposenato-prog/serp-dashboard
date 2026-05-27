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
    SELECT r.*,
      COUNT(CASE WHEN kr.domain_in_gemini = true THEN 1 END)::int      AS with_gemini,
      COUNT(CASE WHEN kr.domain_in_perplexity = true THEN 1 END)::int  AS with_perplexity,
      COUNT(CASE WHEN kr.domain_in_chatgpt = true THEN 1 END)::int     AS with_chatgpt,
      COUNT(CASE WHEN kr.gemini_mention = true AND kr.domain_in_gemini IS NOT TRUE THEN 1 END)::int AS with_gemini_mention,
      COUNT(CASE WHEN kr.chatgpt_mention = true AND kr.domain_in_chatgpt IS NOT TRUE THEN 1 END)::int AS with_chatgpt_mention,
      COUNT(CASE WHEN kr.domain_in_gemini IS NOT NULL OR kr.domain_in_chatgpt IS NOT NULL THEN 1 END)::int AS ai_checked
    FROM runs r
    LEFT JOIN keyword_results kr ON kr.run_id = r.id
    WHERE r.project_id = ${id}
    GROUP BY r.id
    ORDER BY r.run_at DESC
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

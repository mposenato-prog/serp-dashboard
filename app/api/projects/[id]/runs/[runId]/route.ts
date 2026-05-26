import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { extractDomain } from "@/app/api/ai-check/route";
import type { AiPlatformResult } from "@/app/api/ai-check/route";

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
      const { rows: aiSrcs } = await sql`
        SELECT * FROM ai_platform_sources WHERE keyword_result_id = ${kw.id}
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
        domainInGemini: kw.domain_in_gemini ?? null,
        domainInPerplexity: kw.domain_in_perplexity ?? null,
        domainInChatgpt: kw.domain_in_chatgpt ?? null,
        geminiSources: aiSrcs.filter((s) => s.platform === "gemini").map((s) => s.url),
        perplexitySources: aiSrcs.filter((s) => s.platform === "perplexity").map((s) => s.url),
        chatgptSources: aiSrcs.filter((s) => s.platform === "chatgpt").map((s) => s.url),
      };
    })
  );

  return NextResponse.json({ run: runRows[0], results });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  await ensureSchema();
  const { runId } = await params;
  const { aiResults }: { aiResults: AiPlatformResult[] } = await req.json();

  for (const r of aiResults) {
    await sql`
      UPDATE keyword_results SET
        domain_in_gemini = ${r.gemini},
        domain_in_perplexity = ${r.perplexity},
        domain_in_chatgpt = ${r.chatgpt}
      WHERE run_id = ${runId} AND keyword = ${r.keyword}
    `;

    const { rows } = await sql`
      SELECT id FROM keyword_results WHERE run_id = ${runId} AND keyword = ${r.keyword}
    `;
    const kwId = rows[0]?.id;
    if (!kwId) continue;

    await sql`DELETE FROM ai_platform_sources WHERE keyword_result_id = ${kwId}`;

    for (const url of r.geminiSources) {
      await sql`INSERT INTO ai_platform_sources (keyword_result_id, platform, url, domain) VALUES (${kwId}, 'gemini', ${url}, ${extractDomain(url)})`;
    }
    for (const url of r.perplexitySources) {
      await sql`INSERT INTO ai_platform_sources (keyword_result_id, platform, url, domain) VALUES (${kwId}, 'perplexity', ${url}, ${extractDomain(url)})`;
    }
    for (const url of r.chatgptSources) {
      await sql`INSERT INTO ai_platform_sources (keyword_result_id, platform, url, domain) VALUES (${kwId}, 'chatgpt', ${url}, ${extractDomain(url)})`;
    }
  }

  return NextResponse.json({ ok: true });
}

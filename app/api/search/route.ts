import { NextRequest, NextResponse } from "next/server";

export interface SearchResult {
  keyword: string;
  intent: string;
  intentColor: string;
  hasAiOverview: boolean;
  aiSources: { title: string; url: string; domain: string }[];
  topOrganic: { title: string; url: string; domain: string; position: number }[];
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function detectIntent(data: Record<string, unknown>): { label: string; color: string } {
  if (data.shopping_results) return { label: "Transazionale", color: "bg-orange-100 text-orange-700" };
  const ads = (data.ads as unknown[]) || [];
  if (ads.length >= 2) return { label: "Commerciale", color: "bg-yellow-100 text-yellow-700" };
  if (data.news_results) return { label: "Informazionale (News)", color: "bg-blue-100 text-blue-700" };
  if (data.knowledge_graph) return { label: "Navigazionale", color: "bg-purple-100 text-purple-700" };
  if (data.answer_box || data.ai_overview) return { label: "Informazionale", color: "bg-green-100 text-green-700" };
  return { label: "Informazionale", color: "bg-green-100 text-green-700" };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "SerpApi key not configured" }, { status: 500 });
  }

  const { keyword, location = "it", language = "it" } = await req.json();
  if (!keyword) {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    engine: "google",
    q: keyword,
    api_key: apiKey,
    hl: language,
    gl: location,
    num: "10",
  });

  const res = await fetch(`https://serpapi.com/search?${params}`, { next: { revalidate: 0 } });
  if (!res.ok) {
    return NextResponse.json({ error: `SerpApi error: ${res.status}` }, { status: 500 });
  }

  const data = await res.json();
  const intent = detectIntent(data);

  const hasAiOverview = !!data.ai_overview;
  const rawSources: Array<{ title?: string; link?: string; url?: string }> =
    data.ai_overview?.sources || data.ai_overview?.references || [];
  const aiSources = rawSources
    .filter((s) => s.link || s.url)
    .map((s) => {
      const url = (s.link || s.url) as string;
      return { title: s.title || extractDomain(url), url, domain: extractDomain(url) };
    });

  const organicResults: Array<{ title?: string; link?: string; position?: number }> =
    data.organic_results || [];
  const topOrganic = organicResults.slice(0, 10).map((r) => ({
    title: r.title || "",
    url: r.link || "",
    domain: extractDomain(r.link || ""),
    position: r.position || 0,
  }));

  const result: SearchResult = {
    keyword,
    intent: intent.label,
    intentColor: intent.color,
    hasAiOverview,
    aiSources,
    topOrganic,
  };

  return NextResponse.json({ result });
}

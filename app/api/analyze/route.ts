import { NextRequest, NextResponse } from "next/server";

export interface AiSource {
  title: string;
  url: string;
  domain: string;
}

export interface KeywordResult {
  keyword: string;
  hasAiOverview: boolean;
  aiSources: AiSource[];
  domainInOrganic: boolean;
  domainPosition: number | null;
  domainInAiSources: boolean;
  totalOrganicResults: number;
  status: "success" | "error";
  error?: string;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function domainMatches(url: string, domain: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const cleanDomain = domain.replace(/^www\./, "").replace(/^https?:\/\//, "");
    return hostname === cleanDomain || hostname.endsWith("." + cleanDomain);
  } catch {
    return false;
  }
}

async function analyzeKeyword(
  keyword: string,
  domain: string,
  location: string,
  language: string,
  apiKey: string
): Promise<KeywordResult> {
  try {
    const params = new URLSearchParams({
      engine: "google",
      q: keyword,
      api_key: apiKey,
      hl: language,
      gl: location,
      num: "10",
    });

    const res = await fetch(`https://serpapi.com/search?${params}`, {
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`SerpApi error: ${res.status}`);
    }

    const data = await res.json();

    const hasAiOverview = !!data.ai_overview;

    const organicResults: Array<{ link: string; position: number }> =
      data.organic_results || [];

    let domainPosition: number | null = null;
    for (const result of organicResults) {
      if (domainMatches(result.link, domain)) {
        domainPosition = result.position;
        break;
      }
    }

    // Extract AI Overview sources
    let aiSources: AiSource[] = [];
    let domainInAiSources = false;

    if (hasAiOverview && data.ai_overview) {
      const rawSources: Array<{ title?: string; link?: string; url?: string }> =
        data.ai_overview.sources ||
        data.ai_overview.references ||
        [];

      aiSources = rawSources
        .filter((s) => s.link || s.url)
        .map((s) => {
          const url = (s.link || s.url) as string;
          return {
            title: s.title || extractDomain(url),
            url,
            domain: extractDomain(url),
          };
        });

      domainInAiSources = aiSources.some((s) => domainMatches(s.url, domain));
    }

    return {
      keyword,
      hasAiOverview,
      aiSources,
      domainInOrganic: domainPosition !== null,
      domainPosition,
      domainInAiSources,
      totalOrganicResults: organicResults.length,
      status: "success",
    };
  } catch (err) {
    return {
      keyword,
      hasAiOverview: false,
      aiSources: [],
      domainInOrganic: false,
      domainPosition: null,
      domainInAiSources: false,
      totalOrganicResults: 0,
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey || apiKey === "your_serpapi_key_here") {
    return NextResponse.json(
      { error: "SerpApi key not configured" },
      { status: 500 }
    );
  }

  const body = await req.json();
  const {
    keywords,
    domain,
    location = "it",
    language = "it",
  }: {
    keywords: string[];
    domain: string;
    location?: string;
    language?: string;
  } = body;

  if (!keywords?.length || !domain) {
    return NextResponse.json(
      { error: "keywords and domain are required" },
      { status: 400 }
    );
  }

  const limited = keywords.slice(0, 50);
  const results: KeywordResult[] = [];

  const CONCURRENCY = 5;
  for (let i = 0; i < limited.length; i += CONCURRENCY) {
    const chunk = limited.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map((kw) => analyzeKeyword(kw, domain, location, language, apiKey))
    );
    results.push(...chunkResults);
  }

  return NextResponse.json({ results });
}

import { NextRequest, NextResponse } from "next/server";

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
    const clean = domain.replace(/^www\./, "").replace(/^https?:\/\//, "");
    return hostname === clean || hostname.endsWith("." + clean);
  } catch {
    return false;
  }
}

async function checkGemini(
  keyword: string,
  domain: string,
  apiKey: string
): Promise<{ cited: boolean; sources: string[] }> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: keyword }] }],
          tools: [{ google_search: {} }],
        }),
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) return { cited: false, sources: [] };
    const data = await res.json();
    const chunks: Array<{ web?: { uri?: string } }> =
      data.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.map((c) => c.web?.uri).filter(Boolean) as string[];
    return { cited: sources.some((url) => domainMatches(url, domain)), sources };
  } catch {
    return { cited: false, sources: [] };
  }
}

async function checkPerplexity(
  keyword: string,
  domain: string,
  apiKey: string
): Promise<{ cited: boolean; sources: string[] }> {
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: keyword }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { cited: false, sources: [] };
    const data = await res.json();
    const sources: string[] = data.citations || [];
    return { cited: sources.some((url) => domainMatches(url, domain)), sources };
  } catch {
    return { cited: false, sources: [] };
  }
}

async function checkChatGPT(
  keyword: string,
  domain: string,
  apiKey: string
): Promise<{ cited: boolean; sources: string[] }> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-search-preview",
        messages: [{ role: "user", content: keyword }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return { cited: false, sources: [] };
    const data = await res.json();
    const annotations: Array<{ type: string; url_citation?: { url?: string } }> =
      data.choices?.[0]?.message?.annotations || [];
    const sources = annotations
      .filter((a) => a.type === "url_citation")
      .map((a) => a.url_citation?.url)
      .filter(Boolean) as string[];
    return { cited: sources.some((url) => domainMatches(url, domain)), sources };
  } catch {
    return { cited: false, sources: [] };
  }
}

export interface AiPlatformResult {
  keyword: string;
  gemini: boolean | null;
  geminiSources: string[];
  perplexity: boolean | null;
  perplexitySources: string[];
  chatgpt: boolean | null;
  chatgptSources: string[];
}

export { extractDomain };

export async function POST(req: NextRequest) {
  const { keywords, domain }: { keywords: string[]; domain: string } =
    await req.json();

  if (!keywords?.length || !domain) {
    return NextResponse.json(
      { error: "keywords and domain are required" },
      { status: 400 }
    );
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const results: AiPlatformResult[] = [];
  const CONCURRENCY = 3;

  for (let i = 0; i < keywords.length; i += CONCURRENCY) {
    const chunk = keywords.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (keyword) => {
        const [gemini, perplexity, chatgpt] = await Promise.all([
          geminiKey
            ? checkGemini(keyword, domain, geminiKey)
            : Promise.resolve(null),
          perplexityKey
            ? checkPerplexity(keyword, domain, perplexityKey)
            : Promise.resolve(null),
          openaiKey
            ? checkChatGPT(keyword, domain, openaiKey)
            : Promise.resolve(null),
        ]);
        return {
          keyword,
          gemini: gemini?.cited ?? null,
          geminiSources: gemini?.sources ?? [],
          perplexity: perplexity?.cited ?? null,
          perplexitySources: perplexity?.sources ?? [],
          chatgpt: chatgpt?.cited ?? null,
          chatgptSources: chatgpt?.sources ?? [],
        } satisfies AiPlatformResult;
      })
    );
    results.push(...chunkResults);
  }

  return NextResponse.json({ results });
}

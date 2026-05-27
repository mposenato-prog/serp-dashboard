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

function brandMentioned(text: string, brands: string[]): boolean {
  if (!brands.length || !text) return false;
  const lower = text.toLowerCase();
  return brands.some(b => b.trim() && lower.includes(b.trim().toLowerCase()));
}

async function checkGemini(
  keyword: string,
  domain: string,
  brands: string[],
  apiKey: string
): Promise<{ cited: boolean; mention: boolean; sources: string[] }> {
  try {
    // gemini-1.5-flash with googleSearchRetrieval guarantees a web search every time.
    // gemini-2.0-flash with google_search tool only searches when the model decides to.
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: keyword }] }],
          tools: [{
            googleSearchRetrieval: {
              dynamicRetrievalConfig: { mode: "MODE_DYNAMIC", dynamicThreshold: 0 },
            },
          }],
        }),
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) return { cited: false, mention: false, sources: [] };
    const data = await res.json();
    const chunks: Array<{ web?: { uri?: string } }> =
      data.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.map((c) => c.web?.uri).filter(Boolean) as string[];
    const responseText: string = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join(" ") || "";
    return {
      cited: sources.some((url) => domainMatches(url, domain)),
      mention: brandMentioned(responseText, brands),
      sources,
    };
  } catch {
    return { cited: false, mention: false, sources: [] };
  }
}

async function checkPerplexity(
  keyword: string,
  domain: string,
  brands: string[],
  apiKey: string
): Promise<{ cited: boolean; mention: boolean; sources: string[] }> {
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
    if (!res.ok) return { cited: false, mention: false, sources: [] };
    const data = await res.json();
    const sources: string[] = data.citations || [];
    const responseText: string = data.choices?.[0]?.message?.content || "";
    return {
      cited: sources.some((url) => domainMatches(url, domain)),
      mention: brandMentioned(responseText, brands),
      sources,
    };
  } catch {
    return { cited: false, mention: false, sources: [] };
  }
}

async function checkChatGPT(
  keyword: string,
  domain: string,
  brands: string[],
  apiKey: string
): Promise<{ cited: boolean; mention: boolean; sources: string[] }> {
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
    if (!res.ok) return { cited: false, mention: false, sources: [] };
    const data = await res.json();
    const annotations: Array<{ type: string; url_citation?: { url?: string } }> =
      data.choices?.[0]?.message?.annotations || [];
    const sources = annotations
      .filter((a) => a.type === "url_citation")
      .map((a) => a.url_citation?.url)
      .filter(Boolean) as string[];
    const responseText: string = data.choices?.[0]?.message?.content || "";
    return {
      cited: sources.some((url) => domainMatches(url, domain)),
      mention: brandMentioned(responseText, brands),
      sources,
    };
  } catch {
    return { cited: false, mention: false, sources: [] };
  }
}

export interface AiPlatformResult {
  keyword: string;
  gemini: boolean | null;
  geminiMention: boolean | null;
  geminiSources: string[];
  perplexity: boolean | null;
  perplexityMention: boolean | null;
  perplexitySources: string[];
  chatgpt: boolean | null;
  chatgptMention: boolean | null;
  chatgptSources: string[];
}

export { extractDomain };

export async function POST(req: NextRequest) {
  const { keywords, domain, brands = [] }: { keywords: string[]; domain: string; brands?: string[] } =
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
          geminiKey ? checkGemini(keyword, domain, brands, geminiKey) : Promise.resolve(null),
          perplexityKey ? checkPerplexity(keyword, domain, brands, perplexityKey) : Promise.resolve(null),
          openaiKey ? checkChatGPT(keyword, domain, brands, openaiKey) : Promise.resolve(null),
        ]);
        return {
          keyword,
          gemini: gemini?.cited ?? null,
          geminiMention: gemini?.mention ?? null,
          geminiSources: gemini?.sources ?? [],
          perplexity: perplexity?.cited ?? null,
          perplexityMention: perplexity?.mention ?? null,
          perplexitySources: perplexity?.sources ?? [],
          chatgpt: chatgpt?.cited ?? null,
          chatgptMention: chatgpt?.mention ?? null,
          chatgptSources: chatgpt?.sources ?? [],
        } satisfies AiPlatformResult;
      })
    );
    results.push(...chunkResults);
  }

  return NextResponse.json({ results });
}

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

type CheckResult = { cited: boolean | null; mention: boolean | null; sources: string[] };
const API_ERROR: CheckResult = { cited: null, mention: null, sources: [] };

async function checkGemini(
  keyword: string,
  domain: string,
  brands: string[],
  apiKey: string
): Promise<CheckResult> {
  // Try gemini-1.5-flash with googleSearchRetrieval (forces search every time).
  // If that returns 400 (e.g. not supported on this key), fall back to
  // gemini-2.0-flash with google_search tool (searches when model decides to).
  try {
    const body15 = JSON.stringify({
      contents: [{ parts: [{ text: keyword }] }],
      tools: [{
        googleSearchRetrieval: {
          dynamicRetrievalConfig: { mode: "MODE_DYNAMIC", dynamicThreshold: 0 },
        },
      }],
    });

    const res15 = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body15,
        signal: AbortSignal.timeout(20000),
      }
    );

    if (!res15.ok) {
      const errText = await res15.text().catch(() => "(no body)");
      console.warn(`[Gemini 1.5-flash] ${res15.status} for "${keyword}":`, errText.slice(0, 300));
      // Fall back to 2.0-flash google_search
      return await checkGemini20Flash(keyword, domain, brands, apiKey);
    }

    const data15 = await res15.json();
    const chunks15: Array<{ web?: { uri?: string } }> =
      data15.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources15 = chunks15.map((c) => c.web?.uri).filter(Boolean) as string[];

    console.log(`[Gemini 1.5-flash] "${keyword}" → ${sources15.length} sources, domain="${domain}"`);
    if (sources15.length > 0) {
      console.log(`  sources:`, sources15.slice(0, 5));
    } else {
      // Log full response shape to diagnose missing grounding
      const keys = Object.keys(data15.candidates?.[0] || {});
      console.log(`  no sources. candidate keys:`, keys);
    }

    const responseText15: string =
      data15.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join(" ") || "";

    return {
      cited: sources15.some((url) => domainMatches(url, domain)),
      mention: brandMentioned(responseText15, brands),
      sources: sources15,
    };
  } catch (err) {
    console.error(`[Gemini] exception for "${keyword}":`, err);
    return API_ERROR;
  }
}

async function checkGemini20Flash(
  keyword: string,
  domain: string,
  brands: string[],
  apiKey: string
): Promise<CheckResult> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${apiKey}`,
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
    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      console.warn(`[Gemini 2.0-flash-001] ${res.status} for "${keyword}":`, errText.slice(0, 300));
      // Last resort: gemini-2.5-flash
      return await checkGemini25Flash(keyword, domain, brands, apiKey);
    }
    const data = await res.json();
    const chunks: Array<{ web?: { uri?: string } }> =
      data.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.map((c) => c.web?.uri).filter(Boolean) as string[];
    console.log(`[Gemini 2.0-flash] "${keyword}" → ${sources.length} sources`);
    const responseText: string =
      data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join(" ") || "";
    return {
      cited: sources.some((url) => domainMatches(url, domain)),
      mention: brandMentioned(responseText, brands),
      sources,
    };
  } catch (err) {
    console.error(`[Gemini 2.0-flash] exception for "${keyword}":`, err);
    return API_ERROR;
  }
}

async function checkGemini25Flash(
  keyword: string,
  domain: string,
  brands: string[],
  apiKey: string
): Promise<CheckResult> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: keyword }] }],
          tools: [{ google_search: {} }],
        }),
        signal: AbortSignal.timeout(25000),
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      console.warn(`[Gemini 2.5-flash] ${res.status} for "${keyword}":`, errText.slice(0, 300));
      return API_ERROR;
    }
    const data = await res.json();
    const chunks: Array<{ web?: { uri?: string } }> =
      data.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.map((c) => c.web?.uri).filter(Boolean) as string[];
    console.log(`[Gemini 2.5-flash] "${keyword}" → ${sources.length} sources`);
    const responseText: string =
      data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join(" ") || "";
    return {
      cited: sources.some((url) => domainMatches(url, domain)),
      mention: brandMentioned(responseText, brands),
      sources,
    };
  } catch (err) {
    console.error(`[Gemini 2.5-flash] exception for "${keyword}":`, err);
    return API_ERROR;
  }
}

async function checkPerplexity(
  keyword: string,
  domain: string,
  brands: string[],
  apiKey: string
): Promise<CheckResult> {
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
    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      console.warn(`[Perplexity] ${res.status} for "${keyword}":`, errText.slice(0, 300));
      return API_ERROR;
    }
    const data = await res.json();
    const sources: string[] = data.citations || [];
    const responseText: string = data.choices?.[0]?.message?.content || "";
    console.log(`[Perplexity] "${keyword}" → ${sources.length} sources`);
    return {
      cited: sources.some((url) => domainMatches(url, domain)),
      mention: brandMentioned(responseText, brands),
      sources,
    };
  } catch (err) {
    console.error(`[Perplexity] exception for "${keyword}":`, err);
    return API_ERROR;
  }
}

async function checkChatGPT(
  keyword: string,
  domain: string,
  brands: string[],
  apiKey: string
): Promise<CheckResult> {
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
    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      console.warn(`[ChatGPT] ${res.status} for "${keyword}":`, errText.slice(0, 300));
      return API_ERROR;
    }
    const data = await res.json();
    const annotations: Array<{ type: string; url_citation?: { url?: string } }> =
      data.choices?.[0]?.message?.annotations || [];
    const sources = annotations
      .filter((a) => a.type === "url_citation")
      .map((a) => a.url_citation?.url)
      .filter(Boolean) as string[];
    const responseText: string = data.choices?.[0]?.message?.content || "";
    console.log(`[ChatGPT] "${keyword}" → ${sources.length} sources`);
    if (sources.length > 0) console.log(`  sources:`, sources.slice(0, 5));
    return {
      cited: sources.some((url) => domainMatches(url, domain)),
      mention: brandMentioned(responseText, brands),
      sources,
    };
  } catch (err) {
    console.error(`[ChatGPT] exception for "${keyword}":`, err);
    return API_ERROR;
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

  console.log(`[ai-check] keys present: gemini=${!!geminiKey} perplexity=${!!perplexityKey} openai=${!!openaiKey}`);

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

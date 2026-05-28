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

function brandMentioned(text: string, brands: unknown): boolean {
  if (!Array.isArray(brands) || !brands.length || !text) return false;
  const lower = text.toLowerCase();
  return (brands as string[]).some(b => typeof b === "string" && b.trim() && lower.includes(b.trim().toLowerCase()));
}

type CheckResult = { cited: boolean | null; mention: boolean | null; sources: string[] };
const API_ERROR: CheckResult = { cited: null, mention: null, sources: [] };

// Gemini grounding returns vertexaisearch.cloud.google.com/grounding-api-redirect/...
// which are opaque proxy URLs. Follow the 302 to get the real URL.
async function resolveRedirect(url: string): Promise<string> {
  if (!url.includes("vertexaisearch.cloud.google.com")) return url;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    return res.headers.get("location") || url;
  } catch {
    return url;
  }
}

// Module-level cache — Promise ensures concurrent callers share one in-flight request
let geminiModelPromise: Promise<string | null> | null = null;

async function discoverGeminiModel(apiKey: string): Promise<string | null> {
  if (geminiModelPromise) return geminiModelPromise;
  geminiModelPromise = _fetchGeminiModel(apiKey);
  return geminiModelPromise;
}

async function _fetchGeminiModel(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) {
      console.warn("[Gemini] ListModels failed:", res.status);
      return null;
    }
    const data = await res.json();
    const models: Array<{ name: string; supportedGenerationMethods?: string[] }> = data.models || [];
    const ids = models
      .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
      .map(m => m.name.replace("models/", ""));
    console.log("[Gemini] available generateContent models:", ids.join(", "));

    // Prefer flash over pro, newer over older
    const preference = ["2.5-flash", "2.0-flash", "2.5-pro", "1.5-flash", "1.5-pro", "flash", "pro"];
    for (const pref of preference) {
      const found = ids.find(id => id.includes(pref));
      if (found) {
        console.log("[Gemini] selected model:", found);
        return found;
      }
    }
    if (ids[0]) return ids[0];
    return null;
  } catch (err) {
    console.error("[Gemini] ListModels exception:", err);
    return null;
  }
}

async function checkGemini(
  keyword: string,
  domain: string,
  brands: string[],
  apiKey: string
): Promise<CheckResult> {
  try {
    const model = await discoverGeminiModel(apiKey);
    if (!model) {
      console.warn("[Gemini] no usable model found");
      return API_ERROR;
    }

    // Use google_search tool — googleSearchRetrieval returns 400 on newer models
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
      console.warn(`[Gemini ${model}] ${res.status}:`, errText.slice(0, 200));
      return API_ERROR;
    }

    const data = await res.json();
    const rawChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const chunks: Array<{ web?: { uri?: string } }> = Array.isArray(rawChunks) ? rawChunks : [];
    const rawSources = chunks.map((c) => c.web?.uri).filter(Boolean) as string[];
    const rawParts = data.candidates?.[0]?.content?.parts;
    const responseText: string = Array.isArray(rawParts)
      ? rawParts.map((p: { text?: string }) => p.text || "").join(" ")
      : "";

    // Resolve Vertex AI redirect URLs to actual domains in parallel
    const sources = await Promise.all(rawSources.map(resolveRedirect));

    console.log(`[Gemini ${model}] "${keyword}" → ${sources.length} sources, domain="${domain}"`);
    if (sources.length > 0) console.log("  resolved sources:", sources.slice(0, 5));

    return {
      cited: sources.some((url) => domainMatches(url, domain)),
      mention: brandMentioned(responseText, brands),
      sources,
    };
  } catch (err) {
    console.error(`[Gemini] exception for "${keyword}":`, err);
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
    const rawCitations = data.citations;
    const sources: string[] = Array.isArray(rawCitations) ? rawCitations : [];
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
      signal: AbortSignal.timeout(35000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      console.warn(`[ChatGPT] ${res.status} for "${keyword}":`, errText.slice(0, 300));
      return API_ERROR;
    }
    const data = await res.json();
    const rawAnnotations = data.choices?.[0]?.message?.annotations;
    const annotations: Array<{ type: string; url_citation?: { url?: string } }> =
      Array.isArray(rawAnnotations) ? rawAnnotations : [];
    const sources = annotations
      .filter((a) => a.type === "url_citation")
      .map((a) => a.url_citation?.url)
      .filter(Boolean) as string[];
    const responseText: string = data.choices?.[0]?.message?.content || "";
    console.log(`[ChatGPT] "${keyword}" → ${sources.length} sources`);
    if (sources.length > 0) console.log("  sources:", sources.slice(0, 5));
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
  const { keywords, domain, brands: rawBrands }: { keywords: string[]; domain: string; brands?: unknown } = await req.json();
  const brands: string[] = Array.isArray(rawBrands) ? (rawBrands as string[]) : [];

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

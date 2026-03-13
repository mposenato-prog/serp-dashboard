import { NextRequest, NextResponse } from "next/server";

export interface ScrapedPage {
  url: string;
  title: string;
  headings: string[];
  text: string;
  error?: string;
}

function extractContent(html: string): { title: string; headings: string[]; text: string } {
  // Remove scripts, styles, nav, footer, header
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Extract title
  const titleMatch = clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";

  // Extract headings H1-H3
  const headingRegex = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(clean)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    if (text.length > 2 && text.length < 200) headings.push(`H${m[1]}: ${text}`);
  }

  // Extract body text - get main/article/body content
  const bodyMatch = clean.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i)
    || clean.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : clean;

  // Strip remaining HTML tags, decode entities, normalize whitespace
  const text = bodyHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);

  return { title, headings: headings.slice(0, 20), text };
}

async function scrapePage(url: string): Promise<ScrapedPage> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const { title, headings, text } = extractContent(html);
    return { url, title, headings, text };
  } catch (err) {
    return { url, title: "", headings: [], text: "", error: err instanceof Error ? err.message : "Error" };
  }
}

export async function POST(req: NextRequest) {
  const { urls } = await req.json() as { urls: string[] };
  if (!urls?.length) return NextResponse.json({ pages: [] });

  const limited = urls.slice(0, 5);
  const pages = await Promise.all(limited.map(scrapePage));
  return NextResponse.json({ pages });
}

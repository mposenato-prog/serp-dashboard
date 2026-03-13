import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { ScrapedPage } from "../scrape/route";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Agisci come Senior SEO Content Specialist con profonda esperienza in GEO (Generative Engine Optimization) per Google AI Overview.

Il tuo obiettivo è scrivere articoli di blog che:
1. Si posizionino in prima pagina su Google per la query target
2. Vengano citati come fonte autorevole nell'AI Overview di Google
3. Rispondano in modo esaustivo all'intento di ricerca dell'utente

REGOLE DI SCRITTURA:
- Scrivi in italiano, tono professionale ma accessibile
- Non usare mai "Guida a", "Manuale di", "Tutto su" nell'H1
- Inizia sempre con un paragrafo intro che risponde immediatamente alla query (per AI Overview)
- Ogni H2 deve rispondere a un'intenzione di ricerca specifica o a una PAA
- Usa dati, statistiche e fatti concreti estratti dai competitor dove disponibili
- Includi esempi pratici e numeri specifici
- Le FAQ devono essere strutturate per Featured Snippet (domanda → risposta concisa di 40-60 parole)
- Scrivi in HTML puro: usa solo tag h1, h2, h3, p, ul, li, strong, em, table, tr, td, th
- Non includere tag html, head, body, script, style
- Non aggiungere commenti HTML
- NON usare mai blocchi di codice markdown (no \`\`\`html, no \`\`\`): rispondi SOLO con HTML diretto
- La sezione Conclusioni deve essere sempre una lista <ul> con bullet point, non un paragrafo
- Usa il tag <strong> per mettere in grassetto la keyword principale e le sue varianti ogni volta che compaiono nel testo
- Lunghezza target: 1800-2500 parole`;

function buildCompetitorBlock(pages: ScrapedPage[]): string {
  if (!pages.length) return "Nessun dato competitor disponibile.";
  return pages
    .filter(p => !p.error && p.text.length > 100)
    .map((p, i) => `=== COMPETITOR ${i + 1}: ${p.title || p.url} ===
URL: ${p.url}
STRUTTURA:
${p.headings.join("\n")}
CONTENUTO:
${p.text}`)
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurata" }, { status: 500 });
  }

  const { query, prompt, competitorPages, paaQuestions } = await req.json() as {
    query: string;
    prompt: string;
    competitorPages: ScrapedPage[];
    paaQuestions: string[];
  };

  const competitorBlock = buildCompetitorBlock(competitorPages);
  const paaBlock = paaQuestions.length
    ? `\nDOMANDE PAA (People Also Ask) da includere come paragrafi/FAQ:\n${paaQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    : "";

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              cache_control: { type: "ephemeral" },
              text: `ANALISI COMPETITOR:\n${competitorBlock}`,
            },
            {
              type: "text",
              text: `QUERY TARGET: "${query}"
${paaBlock}

PROMPT / STRUTTURA DELL'ARTICOLO:
${prompt}

Scrivi l'articolo completo in HTML seguendo esattamente la struttura fornita.
Usa i dati dei competitor per verificare e arricchire i contenuti.
Le PAA devono essere inserite come sezioni H2/H3 o nella sezione FAQ.
Rispondi SOLO con l'HTML dell'articolo, nessun altro testo.`,
            },
          ],
        },
      ],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const article = raw.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const usage = response.usage as unknown as Record<string, number>;

    return NextResponse.json({
      article,
      usage: {
        input: usage.input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore generazione" },
      { status: 500 }
    );
  }
}

"use client";

import React, { useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  X, Loader2, Wand2, FileText, ChevronRight, AlertCircle,
  Bold, Italic, List, ListOrdered, Heading2, Heading3,
  Undo, Redo, ExternalLink, Copy, Check,
} from "lucide-react";
import type { SearchResult } from "../api/search/route";
import type { ScrapedPage } from "../api/scrape/route";

type Step = "idle" | "scraping" | "prompt" | "generating" | "editing";

interface Props {
  result: SearchResult;
  onClose: () => void;
}

function buildDefaultPrompt(query: string, paaQuestions: string[]): string {
  const paaSection = paaQuestions.length > 0
    ? `\n\n## Domande frequenti (FAQ)\n${paaQuestions.map(q => `### ${q}`).join("\n")}`
    : "";

  return `Agisci come Senior SEO Content Specialist. Query: "${query}".

REQUISITO TITOLO H1: Crea un titolo diretto e autorevole. NON USARE MAI "Guida a", "Manuale di", "Tutto su" o varianti simili.
HTML: Inizia direttamente con <h1>. Nessun tag head/body.

STRUTTURA SUGGERITA (puoi modificarla):

<h1>[Titolo ottimizzato per la query "${query}"]</h1>

<h2>Cos'è e perché è importante: risposta diretta</h2>

<h2>Come funziona: spiegazione dettagliata</h2>
<h3>Aspetto principale 1</h3>
<h3>Aspetto principale 2</h3>
<h3>Aspetto principale 3</h3>

<h2>Guida pratica passo dopo passo</h2>
<h3>Step 1</h3>
<h3>Step 2</h3>
<h3>Step 3</h3>

<h2>Errori comuni da evitare</h2>

<h2>Consigli degli esperti per ottimizzare i risultati</h2>${paaSection}

<h2>Conclusioni</h2>

NOTE SEO:
- H1: includi la keyword principale esatta
- Paragrafo introduttivo: risposta diretta in 2-3 frasi (ottimizza per AI Overview)
- FAQ: struttura ogni risposta in max 60 parole (ottimizza per Featured Snippet)
- Usa dati numerici specifici e fonti autorevoli
- Lunghezza target: 1800-2500 parole`;
}

function MenuBar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const btn = (action: () => void, icon: React.ReactNode, active?: boolean, title?: string) => (
    <button
      onClick={action}
      title={title}
      className={`p-1.5 rounded-lg transition-colors ${active ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
    >
      {icon}
    </button>
  );
  return (
    <div className="flex items-center gap-0.5 px-3 py-2 border-b border-gray-100 bg-gray-50 flex-wrap">
      {btn(() => editor.chain().focus().toggleBold().run(), <Bold size={15} />, editor.isActive("bold"), "Grassetto")}
      {btn(() => editor.chain().focus().toggleItalic().run(), <Italic size={15} />, editor.isActive("italic"), "Corsivo")}
      <div className="w-px h-5 bg-gray-200 mx-1" />
      {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 size={15} />, editor.isActive("heading", { level: 2 }), "H2")}
      {btn(() => editor.chain().focus().toggleHeading({ level: 3 }).run(), <Heading3 size={15} />, editor.isActive("heading", { level: 3 }), "H3")}
      <div className="w-px h-5 bg-gray-200 mx-1" />
      {btn(() => editor.chain().focus().toggleBulletList().run(), <List size={15} />, editor.isActive("bulletList"), "Lista puntata")}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={15} />, editor.isActive("orderedList"), "Lista numerata")}
      <div className="w-px h-5 bg-gray-200 mx-1" />
      {btn(() => editor.chain().focus().undo().run(), <Undo size={15} />, false, "Annulla")}
      {btn(() => editor.chain().focus().redo().run(), <Redo size={15} />, false, "Ripeti")}
    </div>
  );
}

export default function ArticleGenerator({ result, onClose }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [prompt, setPrompt] = useState(buildDefaultPrompt(result.keyword, result.paaQuestions));
  const [competitorPages, setCompetitorPages] = useState<ScrapedPage[]>([]);
  const [articleHtml, setArticleHtml] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [scrapingLog, setScrapingLog] = useState<string[]>([]);
  const [usage, setUsage] = useState<{ input: number; output: number; cacheRead: number; cacheWrite: number } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[400px] px-6 py-5 outline-none focus:outline-none",
      },
    },
  });

  // Set article content when available
  useEffect(() => {
    if (editor && articleHtml) {
      editor.commands.setContent(articleHtml);
    }
  }, [editor, articleHtml]);

  async function handleScrape() {
    setStep("scraping");
    setError("");
    setScrapingLog([]);

    // Collect URLs: top 3 organic + top 3 AI sources
    const organicUrls = result.topOrganic.slice(0, 3).map(r => r.url);
    const aiUrls = result.aiSources.slice(0, 3).map(s => s.url);
    const allUrls = [...new Set([...organicUrls, ...aiUrls])].slice(0, 5);

    setScrapingLog([`Analisi di ${allUrls.length} fonti competitor...`]);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: allUrls }),
      });
      const data = await res.json();
      const pages: ScrapedPage[] = data.pages || [];
      setCompetitorPages(pages);

      const log = pages.map(p =>
        p.error ? `✗ ${p.url} — ${p.error}` : `✓ ${p.title || p.url}`
      );
      setScrapingLog(log);

      // Wait a moment to show log
      await new Promise(r => setTimeout(r, 600));

      // Prepend scraping summary to prompt
      const successful = pages.filter(p => !p.error && p.text.length > 100);
      const failed = pages.filter(p => p.error || p.text.length <= 100);
      const scrapeSummary = [
        `// FONTI COMPETITOR ANALIZZATE:`,
        ...successful.map(p => `// ✓ ${p.title || p.url}`),
        ...failed.map(p => `// ✗ ${p.url} — non disponibile`),
        successful.length === 0 ? `// ⚠️ Nessuna fonte scrappata correttamente — il testo sarà generato senza dati competitor` : "",
        ``,
      ].filter(l => l !== undefined).join("\n");

      setPrompt(prev => scrapeSummary + prev);
      setStep("prompt");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore scraping");
      setStep("idle");
    }
  }

  async function handleGenerate() {
    setStep("generating");
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: result.keyword,
          prompt,
          competitorPages,
          paaQuestions: result.paaQuestions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore generazione");
      setArticleHtml(data.article);
      setUsage(data.usage);
      setStep("editing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore generazione");
      setStep("prompt");
    }
  }

  function copyHtml() {
    const html = editor ? editor.getHTML() : articleHtml;
    navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const stepLabels: Record<Step, string> = {
    idle: "Avvia analisi",
    scraping: "Analisi competitor",
    prompt: "Rivedi prompt",
    generating: "Generazione articolo",
    editing: "Modifica articolo",
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 p-2 rounded-xl">
              <Wand2 size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-white">Genera Articolo SEO</h2>
              <p className="text-white/70 text-xs mt-0.5">{result.keyword}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2 text-xs shrink-0">
          {(["scraping", "prompt", "generating", "editing"] as const).map((s, i) => {
            const steps: Step[] = ["scraping", "prompt", "generating", "editing"];
            const currentIdx = steps.indexOf(step === "idle" ? "scraping" : step);
            const thisIdx = i;
            const done = thisIdx < currentIdx;
            const active = thisIdx === currentIdx;
            return (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium transition-colors ${active ? "bg-indigo-100 text-indigo-700" : done ? "text-emerald-600" : "text-gray-400"}`}>
                  {done ? <Check size={11} /> : <span className="w-4 h-4 rounded-full border text-center leading-[14px] text-[10px] inline-flex items-center justify-center border-current">{i + 1}</span>}
                  {stepLabels[s]}
                </div>
                {i < 3 && <ChevronRight size={12} className="text-gray-300" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* STEP: idle */}
          {step === "idle" && (
            <div className="p-8 text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-2xl flex items-center justify-center">
                <FileText size={28} className="text-indigo-600" />
              </div>
              <h3 className="font-bold text-gray-900 text-lg">Pronto per generare l&apos;articolo</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Analizzerò i competitor e le fonti AI per la query <strong>&quot;{result.keyword}&quot;</strong>, costruirò un prompt SEO ottimizzato e genererò un articolo completo con Claude Haiku.
              </p>
              <div className="flex flex-wrap gap-3 justify-center text-xs text-gray-500">
                <span className="bg-gray-100 px-3 py-1.5 rounded-full">📊 {result.topOrganic.length} risultati organici</span>
                <span className="bg-violet-100 text-violet-700 px-3 py-1.5 rounded-full">🤖 {result.aiSources.length} fonti AI</span>
                <span className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full">❓ {result.paaQuestions.length} PAA</span>
              </div>
              <button
                onClick={handleScrape}
                className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold px-8 py-3 rounded-xl shadow-md shadow-indigo-200 flex items-center gap-2 mx-auto"
              >
                <Wand2 size={16} /> Avvia analisi competitor
              </button>
            </div>
          )}

          {/* STEP: scraping */}
          {step === "scraping" && (
            <div className="p-8 text-center space-y-4">
              <Loader2 size={36} className="animate-spin text-indigo-500 mx-auto" />
              <h3 className="font-semibold text-gray-900">Analisi competitor in corso...</h3>
              <div className="bg-gray-50 rounded-xl p-4 text-left max-w-md mx-auto space-y-1.5">
                {scrapingLog.map((l, i) => (
                  <p key={i} className="text-xs text-gray-600 font-mono">{l}</p>
                ))}
                {scrapingLog.length === 0 && <p className="text-xs text-gray-400">Connessione in corso...</p>}
              </div>
            </div>
          )}

          {/* STEP: prompt review */}
          {step === "prompt" && (
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">Rivedi e modifica il prompt</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Personalizza la struttura dell&apos;articolo prima di generarlo</p>
                </div>
                <div className="flex gap-2 text-xs">
                  {competitorPages.filter(p => !p.error).map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-100 transition-colors">
                      <ExternalLink size={10} /> {p.title.slice(0, 25) || `Fonte ${i + 1}`}
                    </a>
                  ))}
                </div>
              </div>

              {result.paaQuestions.length > 0 && (
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-blue-700 mb-1.5">❓ PAA rilevate ({result.paaQuestions.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.paaQuestions.map((q, i) => (
                      <span key={i} className="text-xs bg-white text-blue-600 border border-blue-200 px-2 py-1 rounded-lg">{q}</span>
                    ))}
                  </div>
                </div>
              )}

              <textarea
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none transition-all"
                rows={18}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
              />
              {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
            </div>
          )}

          {/* STEP: generating */}
          {step === "generating" && (
            <div className="p-8 text-center space-y-4">
              <div className="relative mx-auto w-16 h-16">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-2xl animate-pulse opacity-30" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Wand2 size={28} className="text-indigo-600" />
                </div>
              </div>
              <h3 className="font-bold text-gray-900">Generazione articolo in corso...</h3>
              <p className="text-sm text-gray-500">Claude Haiku sta scrivendo l&apos;articolo con prompt caching</p>
              <div className="flex justify-center gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          {/* STEP: editing */}
          {step === "editing" && editor && (
            <div className="flex flex-col h-full">
              <MenuBar editor={editor} />
              <div className="flex-1 overflow-y-auto">
                <EditorContent editor={editor} />
              </div>
              {usage && (
                <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-3 text-xs text-gray-400">
                  <span>Token input: {usage.input}</span>
                  <span>Output: {usage.output}</span>
                  {usage.cacheRead > 0 && <span className="text-emerald-600">Cache hit: {usage.cacheRead}</span>}
                  {usage.cacheWrite > 0 && <span className="text-amber-600">Cache write: {usage.cacheWrite}</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between shrink-0 bg-white">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">Chiudi</button>
          <div className="flex gap-3">
            {step === "editing" && (
              <>
                <button
                  onClick={() => { setStep("prompt"); setArticleHtml(""); }}
                  className="text-sm border border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 px-4 py-2 rounded-xl transition-colors"
                >
                  ← Rigenera
                </button>
                <button
                  onClick={copyHtml}
                  className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl transition-all font-semibold ${copied ? "bg-emerald-500 text-white" : "border border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"}`}
                >
                  {copied ? <><Check size={14} />Copiato!</> : <><Copy size={14} />Copia HTML</>}
                </button>
              </>
            )}
            {step === "prompt" && (
              <button
                onClick={handleGenerate}
                className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold px-6 py-2 rounded-xl shadow-md shadow-indigo-200 flex items-center gap-2 transition-all"
              >
                <Wand2 size={15} /> Genera articolo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

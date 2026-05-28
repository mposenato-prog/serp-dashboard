"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Bot, Search, CheckCircle2, XCircle,
  AlertCircle, Download, Loader2, ChevronDown, ChevronRight,
  Link, Plus, Trash2, FolderOpen, Clock, ChevronLeft, Pencil,
  Wand2, BarChart3, Sparkles,
} from "lucide-react";
import type { SearchResult } from "./api/search/route";

const ArticleGenerator = dynamic(() => import("./components/ArticleGenerator"), { ssr: false });
import type { KeywordResult, AiSource } from "./api/analyze/route";
import type { AiPlatformResult } from "./api/ai-check/route";
import {
  TrendChart, PositionChart, AiDonut, TopSourcesChart,
  AiPresenceBreakdown, GeoTrendChart, GeoPlatformBar, GeoRadar,
} from "./components/Charts";

// ── constants ─────────────────────────────────────────────────────────────────
const LOCATION_OPTIONS = [
  { label: "Italia", gl: "it", hl: "it" },
  { label: "USA", gl: "us", hl: "en" },
  { label: "UK", gl: "gb", hl: "en" },
  { label: "Francia", gl: "fr", hl: "fr" },
  { label: "Spagna", gl: "es", hl: "es" },
  { label: "Germania", gl: "de", hl: "de" },
];

// ── interfaces ────────────────────────────────────────────────────────────────
interface Project {
  id: number; name: string; domain: string;
  location: string; language: string;
  keywords: string; brands: string; created_at: string;
}
interface Run {
  id: number; project_id: number; run_at: string;
  location: string; language: string;
  total: number; with_ai: number; with_domain: number; with_domain_in_ai: number;
}

// ── style constants ───────────────────────────────────────────────────────────
const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none " +
  "focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white transition-colors";

const btnPrimary =
  "inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 " +
  "text-white text-sm font-semibold rounded-lg px-4 py-2 transition-colors";

const btnSecondary =
  "inline-flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 " +
  "disabled:opacity-40 text-slate-700 text-sm font-medium rounded-lg px-3 py-1.5 transition-colors";

// ── helpers ───────────────────────────────────────────────────────────────────
function clientExtractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function computeSourceRecap(results: KeywordResult[]) {
  const map = new Map<string, { domain: string; count: number; uniqueKeywords: Set<string> }>();
  for (const r of results) {
    if (!r.hasAiOverview) continue;
    const seenInThisKw = new Set<string>();
    for (const s of r.aiSources) {
      const ex = map.get(s.domain);
      if (ex) {
        ex.count++;
        if (!seenInThisKw.has(s.domain)) { ex.uniqueKeywords.add(r.keyword); seenInThisKw.add(s.domain); }
      } else {
        map.set(s.domain, { domain: s.domain, count: 1, uniqueKeywords: new Set([r.keyword]) });
        seenInThisKw.add(s.domain);
      }
    }
  }
  return Array.from(map.values())
    .map(v => ({ domain: v.domain, count: v.count, keywords: Array.from(v.uniqueKeywords) }))
    .sort((a, b) => b.keywords.length - a.keywords.length);
}

// ── micro components ──────────────────────────────────────────────────────────
function Fav({ domain, size = 14 }: { domain: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt="" width={size} height={size} className="rounded-sm shrink-0 opacity-80"
      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
  );
}

function Pill({ color, children }: { color?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${color ?? "bg-slate-50 text-slate-500 border-slate-200"}`}>
      {children}
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
        {label}
        {hint && <span className="normal-case font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

// metric tile used in top strips
function Metric({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div className="min-w-[80px]">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 leading-none">{label}</p>
      <p className={`text-2xl font-bold leading-none mt-1.5 ${accent ?? "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-1 leading-none">{sub}</p>}
    </div>
  );
}

// ── badge components ──────────────────────────────────────────────────────────
function Badge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${
      active ? "bg-emerald-50 text-emerald-700 border-emerald-200"
             : "bg-slate-50 text-slate-400 border-slate-200"
    }`}>{label}</span>
  );
}

function GoogleAiBadge({ hasOverview, domainInAi, sourcesCount, onClick }: {
  hasOverview: boolean; domainInAi: boolean; sourcesCount: number; onClick?: () => void;
}) {
  if (!hasOverview) return <span className="text-xs text-slate-300">—</span>;
  if (domainInAi) return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 transition-colors">
      <CheckCircle2 size={9} /> Citato · {sourcesCount}
    </button>
  );
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 transition-colors">
      <AlertCircle size={9} /> Presente
    </button>
  );
}

const PCOL = {
  gemini:     "bg-sky-50 text-sky-700 border-sky-200",
  perplexity: "bg-teal-50 text-teal-700 border-teal-200",
  chatgpt:    "bg-emerald-50 text-emerald-700 border-emerald-200",
} as const;

function AiPresenceBadge({ cited, mention, platform }: {
  cited: boolean | null | undefined;
  mention: boolean | null | undefined;
  platform: "gemini" | "perplexity" | "chatgpt";
}) {
  if (cited === null || cited === undefined) return <span className="text-slate-200 text-xs select-none">·</span>;
  if (cited) return <Pill color={PCOL[platform]}><CheckCircle2 size={9} /> Link</Pill>;
  if (mention) return <Pill color="bg-amber-50 text-amber-600 border-amber-200">Menzione</Pill>;
  return <span className="text-xs text-slate-400">—</span>;
}

function AiCoverageScore({ r }: { r: KeywordResult }) {
  const dots = [
    { color: "bg-violet-500",  active: r.hasAiOverview ? r.domainInAiSources : null, label: "Google AI" },
    { color: "bg-sky-500",     active: r.domainInGemini ?? null,     label: "Gemini" },
    { color: "bg-teal-500",    active: r.domainInPerplexity ?? null, label: "Perplexity" },
    { color: "bg-emerald-500", active: r.domainInChatgpt ?? null,    label: "ChatGPT" },
  ];
  return (
    <div className="flex items-center gap-1 justify-center">
      {dots.map((d, i) => (
        <span key={i} title={d.label} className={`w-2.5 h-2.5 rounded-full transition-colors ${
          d.active === true  ? d.color :
          d.active === false ? "bg-slate-200" :
          "bg-slate-100 border border-dashed border-slate-300"
        }`} />
      ))}
    </div>
  );
}

// ── SourcesPanel ──────────────────────────────────────────────────────────────
function SourcesPanel({
  results, domain, withAi, sourceRecap,
}: {
  results: KeywordResult[];
  domain: string;
  withAi: number;
  sourceRecap: { domain: string; count: number; keywords: string[] }[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"domains" | "bykeyword">("domains");
  const clean = domain.replace(/^www\./, "").replace(/^https?:\/\//, "");

  const urlsByDomain = new Map<string, { url: string; title: string; keywords: string[] }[]>();
  for (const r of results) {
    for (const s of r.aiSources) {
      const existing = urlsByDomain.get(s.domain) || [];
      const urlEntry = existing.find(e => e.url === s.url);
      if (urlEntry) { if (!urlEntry.keywords.includes(r.keyword)) urlEntry.keywords.push(r.keyword); }
      else existing.push({ url: s.url, title: s.title, keywords: [r.keyword] });
      urlsByDomain.set(s.domain, existing);
    }
  }
  const keywordsWithAi = results.filter(r => r.hasAiOverview);

  if (sourceRecap.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
      <Bot size={28} className="opacity-20" />
      <p className="text-sm">Nessuna fonte AI rilevata</p>
    </div>
  );

  return (
    <div className="flex h-full min-h-[500px]">
      {/* left rail */}
      <div className="w-72 shrink-0 border-r border-slate-100 flex flex-col">
        <div className="p-2 border-b border-slate-100 flex bg-slate-50/50">
          {(["domains", "bykeyword"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${view === v ? "bg-white shadow-sm text-indigo-600 border border-slate-200" : "text-slate-500 hover:text-slate-800"}`}>
              {v === "domains" ? "Per dominio" : "Per keyword"}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto flex-1">
          {view === "domains" && sourceRecap.map((s, i) => {
            const isTracked = s.domain.includes(clean);
            const pct = withAi ? Math.min(100, Math.round((s.keywords.length / withAi) * 100)) : 0;
            return (
              <button key={i} onClick={() => setSelected(s.domain === selected ? null : s.domain)}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors ${
                  selected === s.domain ? "bg-indigo-50" :
                  isTracked ? "bg-amber-50/60 hover:bg-amber-50" : "hover:bg-slate-50"
                }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] text-slate-300 font-mono w-4 shrink-0">{i + 1}</span>
                  <Fav domain={s.domain} />
                  <span className={`text-sm font-medium truncate ${isTracked ? "text-amber-700" : selected === s.domain ? "text-indigo-700" : "text-slate-800"}`}>{s.domain}</span>
                  {isTracked && <span className="ml-auto shrink-0 text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">★</span>}
                </div>
                <div className="flex items-center gap-2 pl-6">
                  <div className="flex-1 bg-slate-100 rounded-full h-1">
                    <div className={`h-1 rounded-full ${isTracked ? "bg-amber-400" : "bg-indigo-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">{pct}% · {s.keywords.length}q</span>
                </div>
              </button>
            );
          })}
          {view === "bykeyword" && keywordsWithAi.map((r, i) => (
            <button key={i} onClick={() => setSelected(r.keyword === selected ? null : r.keyword)}
              className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors ${selected === r.keyword ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
              <div className={`text-sm font-medium truncate ${selected === r.keyword ? "text-indigo-700" : "text-slate-800"}`}>{r.keyword}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-violet-500">{r.aiSources.length} fonti</span>
                {r.domainInAiSources && <span className="text-[10px] text-amber-500">★ citato</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* right detail */}
      <div className="flex-1 overflow-y-auto p-5">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <Link size={24} className="opacity-20" />
            <p className="text-sm">Seleziona {view === "domains" ? "un dominio" : "una keyword"}</p>
          </div>
        ) : view === "domains" ? (() => {
          const urls = urlsByDomain.get(selected) || [];
          const isTracked = selected.includes(clean);
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Fav domain={selected} size={18} />
                <div>
                  <h3 className={`font-bold ${isTracked ? "text-amber-700" : "text-slate-900"}`}>{selected}</h3>
                  <p className="text-xs text-slate-400">{urls.length} URL · {sourceRecap.find(s => s.domain === selected)?.keywords.length} query</p>
                </div>
                {isTracked && <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium border border-amber-200">★ Tuo dominio</span>}
              </div>
              <div className="space-y-2">
                {urls.map((u, i) => (
                  <div key={i} className="border border-slate-100 rounded-xl p-3 hover:border-indigo-200 transition-colors bg-white">
                    <a href={u.url} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-medium text-indigo-600 hover:underline flex items-start gap-1.5 mb-1">
                      <Link size={11} className="mt-0.5 shrink-0 opacity-60" />{u.title}
                    </a>
                    <p className="text-xs text-slate-400 truncate mb-2">{u.url}</p>
                    <div className="flex flex-wrap gap-1">
                      {u.keywords.map((kw, j) => (
                        <span key={j} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">{kw}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })() : (() => {
          const r = keywordsWithAi.find(r => r.keyword === selected);
          if (!r) return null;
          return (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-slate-900">{r.keyword}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{r.aiSources.length} fonti in AI Overview</p>
              </div>
              <div className="space-y-2">
                {r.aiSources.map((s, i) => {
                  const isTracked = s.domain.includes(clean);
                  return (
                    <div key={i} className={`border rounded-xl p-3 bg-white transition-colors ${isTracked ? "border-amber-200 bg-amber-50/50" : "border-slate-100 hover:border-indigo-200"}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Fav domain={s.domain} />
                        <span className={`text-xs font-medium ${isTracked ? "text-amber-700" : "text-slate-500"}`}>{s.domain}</span>
                        {isTracked && <span className="ml-auto text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">★ tuo dominio</span>}
                      </div>
                      <a href={s.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-medium text-indigo-600 hover:underline flex items-start gap-1.5">
                        <Link size={11} className="mt-0.5 shrink-0 opacity-60" />{s.title}
                      </a>
                      <p className="text-xs text-slate-400 truncate mt-1">{s.url}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── ResultsTable ──────────────────────────────────────────────────────────────
function ResultsTable({
  results, domain, withAi, runs, prevResults,
  onAiCheck, aiCheckLoading, aiCheckProgress,
}: {
  results: KeywordResult[];
  domain: string;
  withAi: number;
  runs: Run[];
  prevResults?: KeywordResult[];
  onAiCheck?: () => void;
  aiCheckLoading?: boolean;
  aiCheckProgress?: number;
}) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<"results" | "sources" | "competitor" | "charts">("results");
  const [filter, setFilter] = useState<"all" | "overview" | "cited" | "opportunity">("all");
  const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(null);
  const sourceRecap = computeSourceRecap(results);
  const hasAiPlatformData = results.some(r => r.domainInGemini !== null && r.domainInGemini !== undefined);

  const competitorMap = React.useMemo(() => {
    const cleanDomain = domain.replace(/^www\./, "").replace(/^https?:\/\//, "");
    const isOwn = (d: string) => d === cleanDomain || d.endsWith("." + cleanDomain) || d.includes(cleanDomain);
    const map = new Map<string, { googleAi: number; gemini: number; chatgpt: number; perplexity: number; keywords: Set<string> }>();
    const bump = (d: string, platform: "googleAi" | "gemini" | "chatgpt" | "perplexity", kw: string) => {
      if (!d || isOwn(d)) return;
      const e = map.get(d) ?? { googleAi: 0, gemini: 0, chatgpt: 0, perplexity: 0, keywords: new Set() };
      e[platform]++;
      e.keywords.add(kw);
      map.set(d, e);
    };
    for (const r of results) {
      for (const s of r.aiSources) bump(s.domain, "googleAi", r.keyword);
      for (const url of r.geminiSources ?? []) bump(clientExtractDomain(url), "gemini", r.keyword);
      for (const url of r.chatgptSources ?? []) bump(clientExtractDomain(url), "chatgpt", r.keyword);
      for (const url of r.perplexitySources ?? []) bump(clientExtractDomain(url), "perplexity", r.keyword);
    }
    return Array.from(map.entries())
      .map(([d, v]) => ({ domain: d, ...v, total: v.googleAi + v.gemini + v.chatgpt + v.perplexity, keywords: Array.from(v.keywords) }))
      .sort((a, b) => b.total - a.total);
  }, [results, domain]);

  const total = results.length;
  const withOverview = results.filter(r => r.hasAiOverview).length;
  const citedGoogleAi = results.filter(r => r.domainInAiSources).length;
  const citedGemini = results.filter(r => r.domainInGemini === true).length;
  const citedChatgpt = results.filter(r => r.domainInChatgpt === true).length;
  const opportunities = results.filter(r => r.hasAiOverview && !r.domainInAiSources && !r.domainInGemini && !r.domainInChatgpt).length;
  const checkedCount = results.filter(r => r.domainInGemini !== null && r.domainInGemini !== undefined).length;
  const geoScore = checkedCount > 0
    ? Math.round(((citedGoogleAi + citedGemini + citedChatgpt) / (3 * total)) * 100)
    : null;

  const filteredResults = results.filter(r => {
    if (filter === "overview") return r.hasAiOverview;
    if (filter === "cited") return r.domainInAiSources || r.domainInGemini === true || r.domainInChatgpt === true;
    if (filter === "opportunity") return r.hasAiOverview && !r.domainInAiSources && r.domainInGemini !== true && r.domainInChatgpt !== true;
    return true;
  });

  function toggleRow(i: number) {
    setExpandedRows(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  function exportCSV() {
    const header = ["Keyword", "Posizione SERP", "Google AI Overview", "Citato in Google AI", "Fonti Google AI", "Gemini", "Perplexity", "ChatGPT", "Stato"].join(",");
    const rows = results.map(r => [
      `"${r.keyword}"`,
      r.domainPosition ? `#${r.domainPosition}` : "Non presente",
      !r.hasAiOverview ? "Assente" : r.domainInAiSources ? "Citato" : "Presente",
      r.domainInAiSources ? "Sì" : "No",
      `"${r.aiSources.map(s => s.domain).join(" | ")}"`,
      r.domainInGemini == null ? "—" : r.domainInGemini ? "Sì" : "No",
      r.domainInPerplexity == null ? "—" : r.domainInPerplexity ? "Sì" : "No",
      r.domainInChatgpt == null ? "—" : r.domainInChatgpt ? "Sì" : "No",
      r.status,
    ].join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `serp-${domain}-${Date.now()}.csv`;
    a.click();
  }

  // tab labels
  const tabs = [
    { key: "results",    label: "Risultati",   count: total },
    { key: "sources",    label: "Fonti AI",    count: sourceRecap.length },
    { key: "competitor", label: "Competitor",  count: competitorMap.length },
    { key: "charts",     label: "Grafici",     count: null },
  ] as const;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">

      {/* ── top metric strip ─────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-6 bg-slate-50/50 overflow-x-auto">
        {geoScore !== null && (
          <>
            <div className="shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">GEO Score</p>
              <p className="text-3xl font-black text-indigo-600 leading-none mt-1">{geoScore}<span className="text-sm font-normal text-slate-400 ml-0.5">/100</span></p>
            </div>
            <div className="h-8 w-px bg-slate-200 shrink-0" />
          </>
        )}
        <Metric label="Keyword"    value={total} />
        <div className="h-8 w-px bg-slate-200 shrink-0" />
        <Metric label="AI Overview" value={withOverview}
          sub={`${total ? Math.round((withOverview / total) * 100) : 0}%`}
          accent="text-violet-600" />
        <Metric label="Citato Google" value={citedGoogleAi}
          sub={`${total ? Math.round((citedGoogleAi / total) * 100) : 0}%`}
          accent="text-violet-700" />
        {hasAiPlatformData && <>
          <div className="h-8 w-px bg-slate-200 shrink-0" />
          <Metric label="Gemini"  value={citedGemini}  accent="text-sky-600"
            sub={`${total ? Math.round((citedGemini / total) * 100) : 0}%`} />
          <Metric label="ChatGPT" value={citedChatgpt} accent="text-emerald-600"
            sub={`${total ? Math.round((citedChatgpt / total) * 100) : 0}%`} />
        </>}
        <div className="h-8 w-px bg-slate-200 shrink-0" />
        <Metric label="Opportunità" value={opportunities} accent="text-amber-600"
          sub="AI senza citazione" />
      </div>

      {/* ── tab bar + actions ─────────────────────────────────────────────── */}
      <div className="flex items-center border-b border-slate-100 px-4 gap-1">
        <div className="flex-1 flex">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}>
              {t.label}
              {t.count !== null && t.count > 0 && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  activeTab === t.key ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
                }`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 py-2 shrink-0">
          {activeTab === "results" && (
            <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
              {([
                { key: "all",         label: `Tutte (${total})` },
                { key: "overview",    label: `AI (${withOverview})` },
                { key: "cited",       label: `Citate (${citedGoogleAi})` },
                { key: "opportunity", label: `Opp. (${opportunities})` },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    filter === f.key ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {onAiCheck && (
            <button onClick={onAiCheck} disabled={aiCheckLoading} className={btnSecondary}>
              {aiCheckLoading
                ? <><Loader2 size={13} className="animate-spin" />{aiCheckProgress ?? 0}%</>
                : <><Bot size={13} />Verifica AI</>}
            </button>
          )}
          <button onClick={exportCSV} className={btnSecondary}>
            <Download size={13} />CSV
          </button>
        </div>
      </div>

      {/* ── results tab ───────────────────────────────────────────────────── */}
      {activeTab === "results" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="w-8 px-3 py-2.5"></th>
                <th className="text-left px-3 py-2.5">Keyword</th>
                <th className="text-center px-3 py-2.5 whitespace-nowrap">Pos. SERP</th>
                <th className="text-center px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" />Google AI</span>
                </th>
                <th className="text-center px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-500 inline-block" />Gemini</span>
                </th>
                <th className="text-center px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />Perplexity</span>
                </th>
                <th className="text-center px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />ChatGPT</span>
                </th>
                <th className="text-center px-3 py-2.5">Copertura</th>
                {prevResults && prevResults.length > 0 && <th className="text-center px-3 py-2.5">Δ</th>}
              </tr>
            </thead>
            <tbody>
              {filteredResults.length === 0 && (
                <tr><td colSpan={20} className="text-center py-12 text-sm text-slate-400">Nessuna keyword per questo filtro.</td></tr>
              )}
              {filteredResults.map((r, i) => {
                const prev = prevResults?.find(p => p.keyword === r.keyword);
                const aiChanged = prev ? (r.hasAiOverview !== prev.hasAiOverview ? (r.hasAiOverview ? "gained" : "lost") : null) : null;
                const posNow = r.domainPosition ?? null;
                const posPrev = prev?.domainPosition ?? null;
                const posDelta = (posNow !== null && posPrev !== null) ? posPrev - posNow : null;
                const canExpand = r.hasAiOverview || (r.geminiSources?.length ?? 0) > 0 || (r.chatgptSources?.length ?? 0) > 0;
                const isExpanded = expandedRows.has(i);

                return (
                  <React.Fragment key={i}>
                    <tr
                      className={`border-b border-slate-50 transition-colors ${
                        canExpand ? "cursor-pointer hover:bg-slate-50/70" : ""
                      } ${isExpanded ? "bg-indigo-50/30" : ""}`}
                      onClick={() => canExpand && toggleRow(i)}
                    >
                      <td className="px-3 py-2.5 text-slate-300">
                        {canExpand ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[220px]">
                        <span className="line-clamp-2 leading-snug text-sm">{r.keyword}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {r.domainPosition
                          ? <span className="text-sm font-bold text-indigo-600">#{r.domainPosition}</span>
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <GoogleAiBadge hasOverview={r.hasAiOverview} domainInAi={r.domainInAiSources}
                          sourcesCount={r.aiSources.length}
                          onClick={r.hasAiOverview ? () => toggleRow(i) : undefined} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <AiPresenceBadge cited={r.domainInGemini} mention={r.geminiMention} platform="gemini" />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <AiPresenceBadge cited={r.domainInPerplexity} mention={r.perplexityMention} platform="perplexity" />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <AiPresenceBadge cited={r.domainInChatgpt} mention={r.chatgptMention} platform="chatgpt" />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <AiCoverageScore r={r} />
                      </td>
                      {prevResults && prevResults.length > 0 && (
                        <td className="px-3 py-2.5 text-center">
                          {!prev ? <span className="text-[10px] text-slate-300">nuovo</span>
                            : aiChanged === "gained" ? <span className="text-[10px] font-semibold text-emerald-600">▲ AI</span>
                            : aiChanged === "lost" ? <span className="text-[10px] font-semibold text-red-500">▼ AI</span>
                            : posDelta !== null && posDelta !== 0 ? (
                              <span className={`text-[10px] font-semibold ${posDelta > 0 ? "text-emerald-600" : "text-red-500"}`}>
                                {posDelta > 0 ? `▲+${posDelta}` : `▼${posDelta}`}
                              </span>
                            ) : <span className="text-slate-200">—</span>}
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8 + (prevResults && prevResults.length > 0 ? 1 : 0)}
                          className="px-4 py-4 bg-slate-50/60 border-b border-slate-100">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {/* Google AI sources */}
                            <div className="bg-white rounded-xl border border-violet-100 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500 mb-2 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                                Google AI Overview {r.aiSources.length > 0 && `· ${r.aiSources.length} fonti`}
                              </p>
                              {r.aiSources.length === 0
                                ? <p className="text-xs text-slate-400 italic">{r.hasAiOverview ? "Nessuna fonte estratta" : "AI Overview assente"}</p>
                                : <div className="space-y-1 max-h-36 overflow-y-auto">
                                    {r.aiSources.map((s, j) => {
                                      const isMe = s.domain.includes(domain.replace(/^www\.|^https?:\/\//, ""));
                                      return (
                                        <a key={j} href={s.url} target="_blank" rel="noopener noreferrer"
                                          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors ${isMe ? "bg-amber-50 text-amber-700 font-medium" : "text-slate-600 hover:bg-violet-50"}`}>
                                          <Fav domain={s.domain} size={12} />
                                          <span className="truncate">{s.domain}</span>
                                          {isMe && <span className="ml-auto shrink-0 text-amber-400">★</span>}
                                        </a>
                                      );
                                    })}
                                  </div>}
                            </div>
                            {/* Gemini sources */}
                            <div className="bg-white rounded-xl border border-sky-100 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-500 mb-2 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                                Gemini {(r.geminiSources?.length ?? 0) > 0 && `· ${r.geminiSources!.length} fonti`}
                              </p>
                              {(r.geminiSources?.length ?? 0) === 0
                                ? <p className="text-xs text-slate-400 italic">{r.domainInGemini === null ? "Non verificato" : "Nessuna fonte"}</p>
                                : <div className="space-y-1 max-h-36 overflow-y-auto">
                                    {r.geminiSources!.map((url, j) => {
                                      const d = clientExtractDomain(url);
                                      const isMe = d.includes(domain.replace(/^www\.|^https?:\/\//, ""));
                                      return (
                                        <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                                          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors ${isMe ? "bg-amber-50 text-amber-700 font-medium" : "text-slate-600 hover:bg-sky-50"}`}>
                                          <Fav domain={d} size={12} />
                                          <span className="truncate">{d}</span>
                                          {isMe && <span className="ml-auto shrink-0 text-amber-400">★</span>}
                                        </a>
                                      );
                                    })}
                                  </div>}
                            </div>
                            {/* ChatGPT sources */}
                            <div className="bg-white rounded-xl border border-emerald-100 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                ChatGPT {(r.chatgptSources?.length ?? 0) > 0 && `· ${r.chatgptSources!.length} fonti`}
                              </p>
                              {(r.chatgptSources?.length ?? 0) === 0
                                ? <p className="text-xs text-slate-400 italic">{r.domainInChatgpt === null ? "Non verificato" : "Nessuna fonte"}</p>
                                : <div className="space-y-1 max-h-36 overflow-y-auto">
                                    {r.chatgptSources!.map((url, j) => {
                                      const d = clientExtractDomain(url);
                                      const isMe = d.includes(domain.replace(/^www\.|^https?:\/\//, ""));
                                      return (
                                        <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                                          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors ${isMe ? "bg-amber-50 text-amber-700 font-medium" : "text-slate-600 hover:bg-emerald-50"}`}>
                                          <Fav domain={d} size={12} />
                                          <span className="truncate">{d}</span>
                                          {isMe && <span className="ml-auto shrink-0 text-amber-400">★</span>}
                                        </a>
                                      );
                                    })}
                                  </div>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── sources tab ───────────────────────────────────────────────────── */}
      {activeTab === "sources" && (
        <SourcesPanel results={results} domain={domain} withAi={withAi} sourceRecap={sourceRecap} />
      )}

      {/* ── competitor tab ────────────────────────────────────────────────── */}
      {activeTab === "competitor" && (
        <div className="p-5">
          {competitorMap.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <Bot size={28} className="opacity-20" />
              <p className="text-sm">Nessun dato competitor — esegui analisi e poi Verifica AI</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5">Dominio</th>
                    <th className="text-center px-4 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-500" />Google AI</span></th>
                    <th className="text-center px-4 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-500" />Gemini</span></th>
                    <th className="text-center px-4 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />ChatGPT</span></th>
                    <th className="text-center px-4 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-500" />Perplexity</span></th>
                    <th className="text-center px-4 py-2.5">Totale</th>
                    <th className="text-center px-4 py-2.5">Keyword</th>
                  </tr>
                </thead>
                <tbody>
                  {competitorMap.map((c, i) => (
                    <React.Fragment key={c.domain}>
                      <tr className={`border-b border-slate-50 cursor-pointer transition-colors ${i % 2 === 0 ? "bg-white" : "bg-slate-50/40"} hover:bg-indigo-50/20`}
                        onClick={() => setExpandedCompetitor(expandedCompetitor === c.domain ? null : c.domain)}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-300 font-mono w-4">{i + 1}</span>
                            <Fav domain={c.domain} />
                            <span className="font-medium text-slate-800 truncate max-w-[180px]">{c.domain}</span>
                            {expandedCompetitor === c.domain ? <ChevronDown size={12} className="text-slate-400 shrink-0" /> : <ChevronRight size={12} className="text-slate-300 shrink-0" />}
                          </div>
                        </td>
                        {[c.googleAi, c.gemini, c.chatgpt, c.perplexity].map((v, ci) => (
                          <td key={ci} className="px-4 py-2.5 text-center">
                            {v > 0
                              ? <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">{v}</span>
                              : <span className="text-slate-200 text-xs">—</span>}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-xs font-bold text-white bg-slate-800 px-2 py-0.5 rounded-full">{c.total}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-xs text-slate-500">{c.keywords.length}</span>
                        </td>
                      </tr>
                      {expandedCompetitor === c.domain && (
                        <tr>
                          <td colSpan={7} className="px-5 py-3 bg-indigo-50/30 border-b border-indigo-100">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-2">Query dove appare:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {c.keywords.map((kw, j) => (
                                <span key={j} className="text-xs bg-white border border-indigo-100 text-slate-700 px-2 py-0.5 rounded-full">{kw}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── charts tab ────────────────────────────────────────────────────── */}
      {activeTab === "charts" && (
        <div className="p-6 space-y-8">
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-0.5">Trend visibilità AI nel tempo</h3>
            <p className="text-xs text-slate-400 mb-4">% keyword in cui il dominio appare: Google AI Overview, Gemini, ChatGPT</p>
            <GeoTrendChart runs={runs} />
          </section>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-0.5">Citation rate per piattaforma</h3>
              <p className="text-xs text-slate-400 mb-4">% keyword citate con link (scuro) o solo menzionate</p>
              <GeoPlatformBar results={results} />
            </section>
            <section>
              {hasAiPlatformData ? <>
                <h3 className="text-sm font-semibold text-slate-700 mb-0.5">Visibilità GEO — radar</h3>
                <p className="text-xs text-slate-400 mb-4">% keyword per canale</p>
                <GeoRadar results={results} />
              </> : <>
                <h3 className="text-sm font-semibold text-slate-700 mb-0.5">Presenza AI Overview</h3>
                <p className="text-xs text-slate-400 mb-4">Quante keyword attivano l&apos;AI Overview</p>
                <AiDonut results={results} />
              </>}
            </section>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-0.5">Distribuzione posizioni organiche</h3>
              <p className="text-xs text-slate-400 mb-4">Top 3 / 4–10 / non posizionato</p>
              <PositionChart results={results} />
            </section>
            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-0.5">Breakdown query con AI Overview</h3>
              <p className="text-xs text-slate-400 mb-4">AI + organico / solo organico / solo AI / assente</p>
              <AiPresenceBreakdown results={results} />
            </section>
          </div>
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-0.5">Top fonti AI Overview</h3>
            <p className="text-xs text-slate-400 mb-4">
              Domini più citati — <span className="text-amber-600 font-medium">giallo</span> tuo dominio · <span className="text-indigo-600 font-medium">viola</span> competitor
            </p>
            <TopSourcesChart results={results} trackedDomain={domain} />
          </section>
        </div>
      )}
    </div>
  );
}

// ── NewProjectModal ───────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onSave }: { onClose: () => void; onSave: (p: Project) => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [locationIdx, setLocationIdx] = useState(0);
  const [keywords, setKeywords] = useState("");
  const [brands, setBrands] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name || !domain) return;
    setSaving(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, domain,
        location: LOCATION_OPTIONS[locationIdx].gl,
        language: LOCATION_OPTIONS[locationIdx].hl,
        keywords: keywords.split("\n").map(k => k.trim()).filter(Boolean),
        brands: brands.split("\n").map(b => b.trim()).filter(Boolean),
      }),
    });
    const data = await res.json();
    setSaving(false);
    onSave(data.project);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Nuovo progetto</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XCircle size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          <Field label="Nome progetto">
            <input className={inputCls} placeholder="es. Atlante Energy SEO" value={name} onChange={e => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dominio">
              <input className={inputCls} placeholder="es. atlante.energy" value={domain} onChange={e => setDomain(e.target.value)} />
            </Field>
            <Field label="Paese">
              <select className={inputCls} value={locationIdx} onChange={e => setLocationIdx(Number(e.target.value))}>
                {LOCATION_OPTIONS.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Brand names" hint="— uno per riga (varianti del nome brand)">
            <textarea className={`${inputCls} font-mono resize-none`} rows={3}
              placeholder={"Nike\nNike IT\nnike.it"} value={brands} onChange={e => setBrands(e.target.value)} />
          </Field>
          <Field label="Keywords" hint="— una per riga, max 50">
            <textarea className={`${inputCls} font-mono resize-none`} rows={5}
              placeholder={"keyword 1\nkeyword 2\n..."} value={keywords} onChange={e => setKeywords(e.target.value)} />
          </Field>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800">Annulla</button>
          <button onClick={handleSave} disabled={!name || !domain || saving} className={btnPrimary}>
            {saving && <Loader2 size={13} className="animate-spin" />}Crea progetto
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SearchView ────────────────────────────────────────────────────────────────
function SearchView() {
  const [queriesRaw, setQueriesRaw] = useState("");
  const [locationIdx, setLocationIdx] = useState(0);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<SearchResult | null>(null);
  const [brandsRaw, setBrandsRaw] = useState("");
  const [aiResults, setAiResults] = useState(new Map<string, AiPlatformResult>());
  const [aiCheckLoading, setAiCheckLoading] = useState(false);
  const [aiCheckProgress, setAiCheckProgress] = useState(0);

  const queries = queriesRaw.split("\n").map(q => q.trim()).filter(Boolean).slice(0, 50);

  async function handleSearch() {
    if (!queries.length) return;
    setLoading(true); setError(""); setResults([]); setProgress(0);
    setExpandedRow(null); setShowStats(false); setSelectedDomain(null);
    setAiResults(new Map()); setAiCheckProgress(0);
    const allResults: SearchResult[] = [];
    for (let i = 0; i < queries.length; i++) {
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: queries[i], location: LOCATION_OPTIONS[locationIdx].gl, language: LOCATION_OPTIONS[locationIdx].hl, domain: domain.trim() }),
        });
        const data = await res.json();
        if (res.ok) allResults.push(data.result);
      } catch { /* skip */ }
      setProgress(Math.round(((i + 1) / queries.length) * 100));
    }
    setResults(allResults); setLoading(false);
  }

  async function handleAiCheck() {
    if (!results.length) return;
    setAiCheckLoading(true); setAiCheckProgress(0);
    const keywords = results.map(r => r.keyword);
    const brands = brandsRaw.split(",").map(b => b.trim()).filter(Boolean);
    const BATCH = 3;
    const newMap = new Map<string, AiPlatformResult>(aiResults);
    for (let i = 0; i < keywords.length; i += BATCH) {
      const batch = keywords.slice(i, i + BATCH);
      try {
        const res = await fetch("/api/ai-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywords: batch, domain: domain.trim(), brands }),
        });
        if (res.ok) {
          const data = await res.json();
          for (const r of data.results as AiPlatformResult[]) newMap.set(r.keyword, r);
          setAiResults(new Map(newMap));
        }
      } catch { /* skip */ }
      setAiCheckProgress(Math.min(100, Math.round(((i + BATCH) / keywords.length) * 100)));
    }
    setAiCheckLoading(false);
  }

  const domainStats = (() => {
    const map = new Map<string, { count: number; urls: { title: string; url: string; query: string }[] }>();
    for (const r of results) {
      if (!r.hasAiOverview) continue;
      const seen = new Set<string>();
      for (const s of r.aiSources) {
        if (!seen.has(s.domain)) seen.add(s.domain);
        const ex = map.get(s.domain);
        const entry = { title: s.title, url: s.url, query: r.keyword };
        if (ex) { ex.urls.push(entry); if (!ex.urls.find(u => u.query === r.keyword && seen.size === 1)) ex.count = new Set(ex.urls.map(u => u.query)).size; }
        else map.set(s.domain, { count: 1, urls: [entry] });
      }
    }
    return Array.from(map.entries())
      .map(([domain, v]) => ({ domain, queryCount: new Set(v.urls.map(u => u.query)).size, urls: v.urls }))
      .sort((a, b) => b.queryCount - a.queryCount);
  })();

  const totalQueries = results.length;
  const withAi = results.filter(r => r.hasAiOverview).length;
  const intentCounts = results.reduce((acc, r) => { acc[r.intent] = (acc[r.intent] || 0) + 1; return acc; }, {} as Record<string, number>);

  const selectedDomainData = selectedDomain ? domainStats.find(d => d.domain === selectedDomain) : null;
  const urlsByQuery = selectedDomainData
    ? selectedDomainData.urls.reduce((acc, u) => {
        if (!acc[u.query]) acc[u.query] = [];
        acc[u.query].push(u);
        return acc;
      }, {} as Record<string, { title: string; url: string }[]>)
    : {};

  return (
    <div className="flex h-full">
      {/* ── left input panel ──────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Ricerca</h2>
          <p className="text-xs text-slate-400 mt-0.5">Analizza query su Google: intento, AI Overview, fonti</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <Field label="Query / Prompt" hint="max 50, una per riga">
            <textarea
              className={`${inputCls} font-mono resize-none`} rows={8}
              placeholder={"cos'è il SEO\nlink building\nmigliore agenzia SEO\n..."}
              value={queriesRaw} onChange={e => setQueriesRaw(e.target.value)}
            />
            <p className="text-[10px] text-slate-400 mt-1">{queries.length}/50 query</p>
          </Field>
          <Field label="Dominio" hint="opzionale">
            <input className={inputCls} placeholder="es. nike.it" value={domain} onChange={e => setDomain(e.target.value)} />
          </Field>
          <Field label="Brand AI" hint="virgola separati">
            <input className={inputCls} placeholder="Nike, Nike IT" value={brandsRaw} onChange={e => setBrandsRaw(e.target.value)} />
          </Field>
          <Field label="Paese">
            <select className={inputCls} value={locationIdx} onChange={e => setLocationIdx(Number(e.target.value))}>
              {LOCATION_OPTIONS.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="p-4 border-t border-slate-100 space-y-2">
          <button onClick={handleSearch} disabled={loading || !queries.length} className={`${btnPrimary} w-full justify-center`}>
            {loading ? <><Loader2 size={14} className="animate-spin" />{progress}%</> : <><Search size={14} />Analizza</>}
          </button>
          {results.length > 0 && (
            <button onClick={handleAiCheck} disabled={aiCheckLoading || loading} className={`${btnSecondary} w-full justify-center`}>
              {aiCheckLoading ? <><Loader2 size={13} className="animate-spin" />{aiCheckProgress}%</> : <><Bot size={13} />Verifica AI (Gemini · ChatGPT)</>}
            </button>
          )}
          {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
        </div>
      </aside>

      {/* ── right results panel ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-slate-50">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <Search size={36} className="opacity-10" />
            <p className="text-sm">Inserisci le query e clicca Analizza</p>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* compact metric strip */}
            <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 flex items-center gap-5 flex-wrap">
              <Metric label="Query" value={totalQueries} />
              <div className="h-7 w-px bg-slate-100" />
              <Metric label="AI Overview" value={withAi} sub={`${totalQueries ? Math.round((withAi / totalQueries) * 100) : 0}%`} accent="text-violet-600" />
              <Metric label="Fonti AI uniche" value={domainStats.length} accent="text-indigo-600" />
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => { setShowStats(s => !s); setSelectedDomain(null); }}
                  className={`${btnSecondary} ${showStats ? "bg-indigo-50 border-indigo-200 text-indigo-700" : ""}`}>
                  <BarChart3 size={13} />Statistiche
                </button>
              </div>
            </div>

            {/* results table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="w-8 px-3 py-2.5"></th>
                      <th className="text-left px-3 py-2.5">Query</th>
                      <th className="text-center px-3 py-2.5">Intento</th>
                      <th className="text-center px-3 py-2.5">AI Overview</th>
                      <th className="text-center px-3 py-2.5">Fonti</th>
                      {domain.trim() && <>
                        <th className="text-center px-3 py-2.5">In AI</th>
                        <th className="text-center px-3 py-2.5">Organico</th>
                      </>}
                      {aiResults.size > 0 && <>
                        <th className="text-center px-3 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-500" />Gemini</span></th>
                        <th className="text-center px-3 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-500" />Perplexity</span></th>
                        <th className="text-center px-3 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />ChatGPT</span></th>
                      </>}
                      <th className="text-center px-3 py-2.5">Articolo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <React.Fragment key={i}>
                        <tr
                          className={`border-b border-slate-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-slate-50/40"} ${(r.hasAiOverview || aiResults.has(r.keyword)) ? "cursor-pointer hover:bg-indigo-50/30" : ""}`}
                          onClick={() => (r.hasAiOverview || aiResults.has(r.keyword)) && setExpandedRow(expandedRow === r.keyword ? null : r.keyword)}
                        >
                          <td className="px-3 py-2.5 text-slate-300">
                            {(r.hasAiOverview || aiResults.has(r.keyword)) ? (expandedRow === r.keyword ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{r.keyword}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${r.intentColor}`}>{r.intent}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge active={r.hasAiOverview} label={r.hasAiOverview ? "Sì" : "No"} />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {r.hasAiOverview
                              ? <span className="text-xs font-semibold text-violet-600">{r.aiSources.length}</span>
                              : <span className="text-slate-200 text-xs">—</span>}
                          </td>
                          {domain.trim() && (
                            <>
                              <td className="px-3 py-2.5 text-center">
                                {r.domainInAi === null ? <span className="text-slate-200 text-xs">—</span> : <Badge active={r.domainInAi} label={r.domainInAi ? "Sì" : "No"} />}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {r.domainInOrganic === null ? <span className="text-slate-200 text-xs">—</span>
                                  : r.domainInOrganic ? <span className="text-xs font-bold text-indigo-600">#{r.domainOrgaicPosition}</span>
                                  : <Badge active={false} label="No" />}
                              </td>
                            </>
                          )}
                          {aiResults.size > 0 && (() => {
                            const ai = aiResults.get(r.keyword);
                            return <>
                              <td className="px-3 py-2.5 text-center"><AiPresenceBadge cited={ai?.gemini ?? null} mention={ai?.geminiMention ?? null} platform="gemini" /></td>
                              <td className="px-3 py-2.5 text-center"><AiPresenceBadge cited={ai?.perplexity ?? null} mention={ai?.perplexityMention ?? null} platform="perplexity" /></td>
                              <td className="px-3 py-2.5 text-center"><AiPresenceBadge cited={ai?.chatgpt ?? null} mention={ai?.chatgptMention ?? null} platform="chatgpt" /></td>
                            </>;
                          })()}
                          <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setGeneratingFor(r)}
                              className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
                              <Wand2 size={10} />Genera
                            </button>
                          </td>
                        </tr>
                        {expandedRow === r.keyword && (r.aiSources.length > 0 || aiResults.has(r.keyword)) && (() => {
                          const ai = aiResults.get(r.keyword);
                          const cols = 6 + (domain.trim() ? 2 : 0) + (aiResults.size > 0 ? 3 : 0);
                          return (
                            <tr>
                              <td colSpan={cols} className="px-4 py-4 bg-slate-50/60 border-b border-slate-100">
                                <div className="space-y-3">
                                  {r.aiSources.length > 0 && (
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500 mb-2">
                                        Google AI Overview · {r.aiSources.length} fonti
                                      </p>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                                        {r.aiSources.map((s, j) => (
                                          <a key={j} href={s.url} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-100 bg-white hover:border-violet-200 text-xs transition-colors">
                                            <Fav domain={s.domain} size={12} />
                                            <div className="min-w-0">
                                              <p className="font-medium text-slate-700 truncate">{s.title.length > 30 ? s.title.slice(0, 30) + "…" : s.title}</p>
                                              <p className="text-slate-400 truncate">{s.domain}</p>
                                            </div>
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {ai && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      {([
                                        { label: "Gemini",     sources: ai.geminiSources,     border: "border-sky-100",     labelCls: "text-sky-500",     hover: "hover:bg-sky-50" },
                                        { label: "Perplexity", sources: ai.perplexitySources, border: "border-teal-100",    labelCls: "text-teal-500",    hover: "hover:bg-teal-50" },
                                        { label: "ChatGPT",    sources: ai.chatgptSources,    border: "border-emerald-100", labelCls: "text-emerald-500", hover: "hover:bg-emerald-50" },
                                      ] as const).map(({ label, sources, border, labelCls, hover }) => (
                                        <div key={label} className={`bg-white rounded-xl border ${border} p-3`}>
                                          <p className={`text-[10px] font-bold uppercase tracking-widest ${labelCls} mb-2`}>
                                            {label} {sources.length > 0 ? `· ${sources.length} fonti` : ""}
                                          </p>
                                          {sources.length === 0
                                            ? <p className="text-xs text-slate-400 italic">Nessuna fonte citata</p>
                                            : <div className="space-y-1">
                                                {sources.map((url, j) => {
                                                  const d = clientExtractDomain(url);
                                                  return (
                                                    <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                                                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-slate-600 ${hover} transition-colors`}>
                                                      <Fav domain={d} size={11} />
                                                      <span className="truncate">{d}</span>
                                                    </a>
                                                  );
                                                })}
                                              </div>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── statistics modal ─────────────────────────────────────────────────── */}
      {showStats && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => { setShowStats(false); setSelectedDomain(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h2 className="font-semibold text-slate-900">Statistiche ricerca</h2>
              <button onClick={() => { setShowStats(false); setSelectedDomain(null); }} className="text-slate-400 hover:text-slate-700">
                <XCircle size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5">
              {/* summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Query analizzate", value: totalQueries, accent: "text-slate-900" },
                  { label: "Con AI Overview", value: `${withAi} · ${totalQueries ? Math.round(withAi / totalQueries * 100) : 0}%`, accent: "text-violet-700" },
                  { label: "Domini unici AI", value: domainStats.length, accent: "text-indigo-700" },
                  { label: "Intento prevalente", value: Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—", accent: "text-slate-700" },
                ].map((m, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{m.label}</p>
                    <p className={`text-xl font-bold mt-1 ${m.accent}`}>{m.value}</p>
                  </div>
                ))}
              </div>
              {/* intent distribution */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Distribuzione intento</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(intentCounts).sort((a, b) => b[1] - a[1]).map(([intent, count]) => {
                    const r = results.find(r => r.intent === intent);
                    return (
                      <span key={intent} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${r?.intentColor ?? "bg-white text-slate-600 border-slate-200"}`}>
                        {intent} <span className="font-bold">{count}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              {/* top domains panel */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <Sparkles size={14} className="text-violet-500" />
                  <h3 className="text-sm font-semibold text-slate-900">Domini più citati in AI Overview</h3>
                  <span className="text-xs text-slate-400 ml-1">— clicca per vedere gli URL</span>
                </div>
                <div className="flex" style={{ minHeight: 280 }}>
                  <div className="w-64 shrink-0 border-r border-slate-100 divide-y divide-slate-50 overflow-y-auto max-h-[360px]">
                    {domainStats.length === 0 && <p className="px-4 py-6 text-sm text-slate-400 text-center">Nessuna fonte AI</p>}
                    {domainStats.map((d, i) => {
                      const pct = withAi ? Math.round((d.queryCount / withAi) * 100) : 0;
                      return (
                        <button key={i} onClick={() => setSelectedDomain(selectedDomain === d.domain ? null : d.domain)}
                          className={`w-full text-left px-4 py-3 flex items-center gap-2.5 transition-colors ${selectedDomain === d.domain ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                          <span className="text-[10px] text-slate-300 font-mono w-4 shrink-0">{i + 1}</span>
                          <Fav domain={d.domain} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-xs font-medium truncate ${selectedDomain === d.domain ? "text-indigo-700" : "text-slate-800"}`}>{d.domain}</span>
                              <span className="text-[10px] text-slate-400 shrink-0 ml-1">{pct}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1">
                              <div className="h-1 rounded-full bg-violet-400" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex-1 p-4 overflow-y-auto max-h-[360px]">
                    {!selectedDomain ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                        <Link size={22} className="opacity-20" />
                        <p className="text-sm">Seleziona un dominio</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Fav domain={selectedDomain} size={16} />
                          <h4 className="font-semibold text-slate-900 text-sm">{selectedDomain}</h4>
                          <span className="text-xs text-slate-400">{selectedDomainData?.queryCount} query</span>
                        </div>
                        {Object.entries(urlsByQuery).map(([query, urls]) => (
                          <div key={query} className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">{query}</p>
                            {urls.map((u, i) => (
                              <a key={i} href={u.url} target="_blank" rel="noopener noreferrer"
                                className="flex items-start gap-2 p-2.5 rounded-lg border border-slate-100 hover:border-indigo-200 bg-white transition-colors">
                                <Link size={11} className="text-indigo-400 mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-indigo-600 hover:underline truncate">{u.title}</p>
                                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{u.url}</p>
                                </div>
                              </a>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {generatingFor && <ArticleGenerator result={generatingFor} onClose={() => setGeneratingFor(null)} />}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [runResults, setRunResults] = useState<KeywordResult[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [editingKeywords, setEditingKeywords] = useState(false);
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [view, setView] = useState<"projects" | "project" | "run">("projects");
  const [mainTab, setMainTab] = useState<"projects" | "search">("search");
  const [prevRunResults, setPrevRunResults] = useState<KeywordResult[]>([]);
  const [aiCheckLoading, setAiCheckLoading] = useState(false);
  const [aiCheckProgress, setAiCheckProgress] = useState(0);
  const [currentRunId, setCurrentRunId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/projects").then(r => r.json()).then(d => setProjects(d.projects || []));
  }, []);

  const loadRuns = useCallback(async (projectId: number) => {
    const res = await fetch(`/api/projects/${projectId}/runs`);
    const data = await res.json();
    setRuns(data.runs || []);
  }, []);

  async function selectProject(p: Project) {
    setSelectedProject({ ...p, brands: p.brands || "[]" });
    setKeywordsRaw(JSON.parse(p.keywords).join("\n"));
    setSelectedRun(null); setRunResults([]);
    await loadRuns(p.id);
    setView("project");
  }

  async function selectRun(run: Run) {
    setSelectedRun(run); setCurrentRunId(run.id);
    const res = await fetch(`/api/projects/${run.project_id}/runs/${run.id}`);
    const data = await res.json();
    setRunResults(data.results || []);
    const currentIdx = runs.findIndex(r => r.id === run.id);
    const prevRun = runs[currentIdx + 1];
    if (prevRun) {
      const prevRes = await fetch(`/api/projects/${prevRun.project_id}/runs/${prevRun.id}`);
      const prevData = await prevRes.json();
      setPrevRunResults(prevData.results || []);
    } else { setPrevRunResults([]); }
    setView("run");
  }

  async function handleAnalyze() {
    if (!selectedProject) return;
    const keywords = keywordsRaw.split("\n").map(k => k.trim()).filter(Boolean);
    if (!keywords.length) return;
    await fetch(`/api/projects/${selectedProject.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...selectedProject, keywords }),
    });
    if (runs.length > 0) {
      try {
        const prevRes = await fetch(`/api/projects/${runs[0].project_id}/runs/${runs[0].id}`);
        setPrevRunResults((await prevRes.json()).results || []);
      } catch { setPrevRunResults([]); }
    } else { setPrevRunResults([]); }
    setError(""); setLoading(true); setProgress(0);
    const BATCH = 10;
    const allResults: KeywordResult[] = [];
    for (let i = 0; i < keywords.length; i += BATCH) {
      const batch = keywords.slice(i, i + BATCH);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywords: batch, domain: selectedProject.domain, location: selectedProject.location, language: selectedProject.language }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Errore API");
        allResults.push(...(await res.json()).results);
        setProgress(Math.min(100, Math.round(((i + BATCH) / keywords.length) * 100)));
      } catch (e) { setError(e instanceof Error ? e.message : "Errore sconosciuto"); break; }
    }
    const runSaveRes = await fetch(`/api/projects/${selectedProject.id}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: allResults, location: selectedProject.location, language: selectedProject.language }),
    });
    const savedRun = (await runSaveRes.json()).run ?? null;
    setRunResults(allResults);
    setCurrentRunId(savedRun?.id ?? null);
    await loadRuns(selectedProject.id);
    setSelectedRun(savedRun);
    setLoading(false); setView("run");
  }

  async function handleAiCheck() {
    if (!selectedProject || !runResults.length) return;
    setAiCheckLoading(true); setAiCheckProgress(0);
    const keywords = runResults.map(r => r.keyword);
    const BATCH = 3;
    const allAiResults: AiPlatformResult[] = [];
    for (let i = 0; i < keywords.length; i += BATCH) {
      const batch = keywords.slice(i, i + BATCH);
      try {
        const projectBrands: string[] = (() => { try { return JSON.parse(selectedProject.brands || "[]"); } catch { return []; } })();
        const res = await fetch("/api/ai-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywords: batch, domain: selectedProject.domain, brands: projectBrands }),
        });
        if (res.ok) allAiResults.push(...(await res.json()).results);
      } catch { /* skip batch */ }
      setAiCheckProgress(Math.min(100, Math.round(((i + BATCH) / keywords.length) * 100)));
    }
    setRunResults(prev => prev.map(r => {
      const ai = allAiResults.find(a => a.keyword === r.keyword);
      if (!ai) return r;
      return { ...r, domainInGemini: ai.gemini, domainInPerplexity: ai.perplexity, domainInChatgpt: ai.chatgpt, geminiMention: ai.geminiMention, perplexityMention: ai.perplexityMention, chatgptMention: ai.chatgptMention, geminiSources: ai.geminiSources, perplexitySources: ai.perplexitySources, chatgptSources: ai.chatgptSources };
    }));
    const runId = currentRunId ?? selectedRun?.id;
    if (runId) {
      await fetch(`/api/projects/${selectedProject.id}/runs/${runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiResults: allAiResults }),
      });
    }
    setAiCheckLoading(false);
  }

  async function deleteProject(id: number) {
    if (!confirm("Eliminare il progetto e tutto lo storico?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects(prev => prev.filter(p => p.id !== id));
    if (selectedProject?.id === id) { setSelectedProject(null); setView("projects"); }
  }

  const total = runResults.filter(r => r.status === "success").length;
  const withAi = runResults.filter(r => r.hasAiOverview).length;
  const withDomain = runResults.filter(r => r.domainInOrganic).length;
  const withDomainInAi = runResults.filter(r => r.domainInAiSources).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── app header ──────────────────────────────────────────────────────── */}
      <header className="h-12 bg-slate-900 flex items-center px-5 gap-4 shrink-0 border-b border-slate-800">
        {/* logo */}
        <button onClick={() => setMainTab("search")} className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded-md bg-indigo-500 flex items-center justify-center">
            <BarChart3 size={13} className="text-white" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight">AI Sight</span>
        </button>

        {/* main tabs */}
        <nav className="flex gap-0.5 bg-slate-800 rounded-lg p-0.5 ml-2">
          {([
            { key: "search", label: "Ricerca", icon: <Search size={12} /> },
            { key: "projects", label: "Progetti", icon: <FolderOpen size={12} /> },
          ] as const).map(t => (
            <button key={t.key}
              onClick={() => { setMainTab(t.key); if (t.key === "projects") setView("projects"); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mainTab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-white"
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </nav>

        {/* breadcrumb */}
        {mainTab === "projects" && selectedProject && (
          <div className="flex items-center gap-2 text-xs ml-2">
            <span className="text-slate-600">/</span>
            <button onClick={() => setView("project")} className="text-slate-400 hover:text-white transition-colors">{selectedProject.name}</button>
            {view === "run" && selectedRun && (
              <>
                <span className="text-slate-700">/</span>
                <span className="text-slate-500">{new Date(selectedRun.run_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" })}</span>
              </>
            )}
            {view === "run" && !selectedRun && loading && (
              <>
                <span className="text-slate-700">/</span>
                <span className="text-slate-500 flex items-center gap-1"><Loader2 size={10} className="animate-spin" />Analisi in corso</span>
              </>
            )}
          </div>
        )}
      </header>

      {/* ── search tab ──────────────────────────────────────────────────────── */}
      {mainTab === "search" && (
        <div className="flex-1 flex overflow-hidden">
          <SearchView />
        </div>
      )}

      {/* ── projects tab ────────────────────────────────────────────────────── */}
      {mainTab === "projects" && (
        <div className={`flex flex-1 overflow-hidden`}>

          {/* sidebar */}
          {view !== "projects" && selectedProject && (
            <aside className="w-56 bg-white border-r border-slate-200 flex flex-col shrink-0">
              <div className="p-4 border-b border-slate-100">
                <button onClick={() => setView("projects")}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 mb-3 transition-colors">
                  <ChevronLeft size={12} />Tutti i progetti
                </button>
                <p className="font-semibold text-slate-900 text-sm truncate">{selectedProject.name}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{selectedProject.domain}</p>
              </div>

              <div className="p-3 border-b border-slate-100">
                <button onClick={handleAnalyze} disabled={loading}
                  className={`${btnPrimary} w-full justify-center text-xs`}>
                  {loading ? <><Loader2 size={12} className="animate-spin" />{progress}%</> : <><Search size={12} />Nuova analisi</>}
                </button>
                {error && <p className="text-[11px] text-red-500 mt-2 flex items-center gap-1"><AlertCircle size={10} />{error}</p>}
              </div>

              <div className="flex-1 overflow-y-auto">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-4 pb-2">Storico</p>
                {runs.length === 0 && <p className="text-xs text-slate-400 px-4 pb-4">Nessuna analisi ancora</p>}
                {runs.map(run => (
                  <button key={run.id} onClick={() => selectRun(run)}
                    className={`w-full text-left px-4 py-2.5 transition-colors border-l-2 ${
                      selectedRun?.id === run.id ? "border-indigo-500 bg-indigo-50" : "border-transparent hover:bg-slate-50 hover:border-slate-300"
                    }`}>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      <Clock size={10} className="text-slate-400" />
                      {new Date(run.run_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                    <div className="flex gap-2 mt-0.5 text-[10px]">
                      <span className="text-slate-400">{run.total} kw</span>
                      <span className="text-violet-500">{run.with_ai} AI</span>
                      <span className="text-emerald-500">{run.with_domain} pos</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="border-t border-slate-100 p-3">
                <button onClick={() => setEditingKeywords(!editingKeywords)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium w-full">
                  <Pencil size={11} />Modifica keywords
                  {editingKeywords ? <ChevronDown size={11} className="ml-auto" /> : <ChevronRight size={11} className="ml-auto" />}
                </button>
                {editingKeywords && (
                  <textarea className="mt-2 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-indigo-400 resize-none bg-white"
                    rows={8} value={keywordsRaw} onChange={e => setKeywordsRaw(e.target.value)} />
                )}
              </div>
            </aside>
          )}

          {/* main content */}
          <main className="flex-1 overflow-auto bg-slate-50">

            {/* projects grid */}
            {view === "projects" && (
              <div className="max-w-5xl mx-auto px-6 py-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Progetti</h2>
                    <p className="text-sm text-slate-400 mt-0.5">Traccia la visibilità AI nel tempo per ogni dominio</p>
                  </div>
                  <button onClick={() => setShowNewProject(true)} className={btnPrimary}>
                    <Plus size={14} />Nuovo progetto
                  </button>
                </div>
                {projects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
                    <FolderOpen size={36} className="opacity-20" />
                    <p className="text-sm">Nessun progetto ancora</p>
                    <button onClick={() => setShowNewProject(true)} className="text-indigo-600 text-sm font-medium hover:underline">Crea il primo progetto →</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {projects.map(p => (
                      <div key={p.id}
                        className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer group"
                        onClick={() => selectProject(p)}>
                        <div className="flex items-start justify-between">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-slate-900 truncate">{p.name}</h3>
                            <p className="text-sm text-slate-400 mt-0.5 truncate">{p.domain}</p>
                          </div>
                          <button onClick={e => { e.stopPropagation(); deleteProject(p.id); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-400 p-1 rounded shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-3 text-xs text-slate-400">
                          <span>{JSON.parse(p.keywords).length} kw</span>
                          <span>·</span>
                          <span>{LOCATION_OPTIONS.find(l => l.gl === p.location)?.label || p.location}</span>
                          <span>·</span>
                          <span>{new Date(p.created_at).toLocaleDateString("it-IT")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* project home (no run selected) */}
            {view === "project" && selectedProject && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                <Search size={36} className="opacity-15" />
                <p className="text-sm font-medium text-slate-500">Pronto per l&apos;analisi</p>
                <p className="text-xs text-slate-400">Clicca &quot;Nuova analisi&quot; nella sidebar</p>
                {runs.length > 0 && <p className="text-xs text-slate-400">o seleziona un&apos;analisi precedente</p>}
              </div>
            )}

            {/* run results view */}
            {view === "run" && runResults.length > 0 && selectedProject && (
              <div className="p-6 space-y-5">
                {/* top metric bar */}
                <div className="bg-white rounded-xl border border-slate-200 px-6 py-4 flex items-center gap-6 flex-wrap">
                  <Metric label="Keywords" value={total} />
                  <div className="h-8 w-px bg-slate-100 shrink-0" />
                  <Metric label="AI Overview" value={withAi}
                    sub={`${total ? Math.round(withAi / total * 100) : 0}%`}
                    accent="text-violet-600" />
                  <Metric label="In organico" value={withDomain}
                    sub={`${total ? Math.round(withDomain / total * 100) : 0}% top 10`}
                    accent="text-indigo-600" />
                  <Metric label="Citato in AI" value={withDomainInAi}
                    sub="come fonte"
                    accent="text-amber-600" />
                  {prevRunResults.length > 0 && (
                    <>
                      <div className="h-8 w-px bg-slate-100 shrink-0" />
                      <div className="flex gap-4">
                        {[
                          { label: "Δ AI Overview", delta: withAi - prevRunResults.filter(r => r.hasAiOverview).length },
                          { label: "Δ Organico",    delta: withDomain - prevRunResults.filter(r => r.domainInOrganic).length },
                          { label: "Δ Citato AI",   delta: withDomainInAi - prevRunResults.filter(r => r.domainInAiSources).length },
                        ].map((d, i) => (
                          <div key={i}>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{d.label}</p>
                            <p className={`text-sm font-bold mt-1 ${d.delta > 0 ? "text-emerald-600" : d.delta < 0 ? "text-red-500" : "text-slate-400"}`}>
                              {d.delta > 0 ? `+${d.delta}` : d.delta === 0 ? "=" : d.delta}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <ResultsTable
                  results={runResults}
                  domain={selectedProject.domain}
                  withAi={withAi}
                  runs={runs}
                  prevResults={prevRunResults}
                  onAiCheck={handleAiCheck}
                  aiCheckLoading={aiCheckLoading}
                  aiCheckProgress={aiCheckProgress}
                />
              </div>
            )}
          </main>
        </div>
      )}

      {showNewProject && (
        <NewProjectModal onClose={() => setShowNewProject(false)}
          onSave={p => { setProjects(prev => [p, ...prev]); setShowNewProject(false); selectProject(p); }} />
      )}
    </div>
  );
}

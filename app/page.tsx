"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Bot, Search, CheckCircle2, XCircle, AlertCircle,
  Download, Loader2, ChevronDown, ChevronRight, ChevronLeft,
  Link, Plus, Trash2, FolderOpen, Clock, Pencil,
  Wand2, BarChart3, Sparkles, ArrowLeft, X, Settings,
} from "lucide-react";
import type { SearchResult } from "./api/search/route";

const ArticleGenerator = dynamic(() => import("./components/ArticleGenerator"), { ssr: false });
import type { KeywordResult } from "./api/analyze/route";
import type { AiPlatformResult } from "./api/ai-check/route";
import {
  TrendChart, PositionChart, AiDonut, TopSourcesChart,
  AiPresenceBreakdown, GeoTrendChart, GeoPlatformBar, GeoRadar,
} from "./components/Charts";

// ─────────────────────────────────────────────────────────────────────────────
const LOCATION_OPTIONS = [
  { label: "Italia", gl: "it", hl: "it" },
  { label: "USA", gl: "us", hl: "en" },
  { label: "UK", gl: "gb", hl: "en" },
  { label: "Francia", gl: "fr", hl: "fr" },
  { label: "Spagna", gl: "es", hl: "es" },
  { label: "Germania", gl: "de", hl: "de" },
];

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

// ─── helpers ──────────────────────────────────────────────────────────────────
function xd(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
function computeSourceRecap(results: KeywordResult[]) {
  const map = new Map<string, { domain: string; count: number; uniqueKeywords: Set<string> }>();
  for (const r of results) {
    if (!r.hasAiOverview) continue;
    const seen = new Set<string>();
    for (const s of r.aiSources) {
      const ex = map.get(s.domain);
      if (ex) { ex.count++; if (!seen.has(s.domain)) { ex.uniqueKeywords.add(r.keyword); seen.add(s.domain); } }
      else { map.set(s.domain, { domain: s.domain, count: 1, uniqueKeywords: new Set([r.keyword]) }); seen.add(s.domain); }
    }
  }
  return Array.from(map.values())
    .map(v => ({ domain: v.domain, count: v.count, keywords: Array.from(v.uniqueKeywords) }))
    .sort((a, b) => b.keywords.length - a.keywords.length);
}

// ─── tiny atoms ───────────────────────────────────────────────────────────────
function Fav({ d, s = 14 }: { d: string; s?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=32`} alt="" width={s} height={s}
      className="rounded-sm shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
  );
}

function Tag({ children, color = "slate" }: { children: React.ReactNode; color?: string }) {
  const map: Record<string, string> = {
    slate:   "bg-slate-100 text-slate-600 border-slate-200",
    violet:  "bg-violet-100 text-violet-700 border-violet-200",
    sky:     "bg-sky-100 text-sky-700 border-sky-200",
    teal:    "bg-teal-100 text-teal-700 border-teal-200",
    emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
    amber:   "bg-amber-100 text-amber-700 border-amber-200",
    red:     "bg-red-100 text-red-600 border-red-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${map[color] ?? map.slate}`}>
      {children}
    </span>
  );
}

function Num({ label, value, accent, sub }: { label: string; value: string | number; accent?: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`text-2xl font-black leading-none mt-1 ${accent ?? "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Sep() { return <div className="h-8 w-px bg-slate-200 shrink-0" />; }

// ─── badges ───────────────────────────────────────────────────────────────────
function GoogleAiBadge({ hasOverview, domainInAi, sourcesCount, onClick }: {
  hasOverview: boolean; domainInAi: boolean; sourcesCount: number; onClick?: () => void;
}) {
  if (!hasOverview) return <span className="text-[11px] text-slate-300">—</span>;
  if (domainInAi) return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100">
      <CheckCircle2 size={9} />Citato · {sourcesCount}
    </button>
  );
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100">
      <AlertCircle size={9} />Presente
    </button>
  );
}

function AiBadge({ cited, mention, color }: { cited: boolean | null | undefined; mention: boolean | null | undefined; color: string }) {
  if (cited === null || cited === undefined) return <span className="text-slate-200 text-xs">·</span>;
  if (cited) return <Tag color={color}><CheckCircle2 size={9} />Link</Tag>;
  if (mention) return <Tag color="amber">Menzione</Tag>;
  return <span className="text-[11px] text-slate-400">—</span>;
}

function CovDots({ r }: { r: KeywordResult }) {
  return (
    <div className="flex items-center gap-1 justify-center">
      {[
        { c: "bg-violet-500",  a: r.hasAiOverview ? r.domainInAiSources : null },
        { c: "bg-sky-500",     a: r.domainInGemini ?? null },
        { c: "bg-teal-500",    a: r.domainInPerplexity ?? null },
        { c: "bg-emerald-500", a: r.domainInChatgpt ?? null },
      ].map((d, i) => (
        <span key={i} className={`w-2 h-2 rounded-full ${
          d.a === true ? d.c : d.a === false ? "bg-slate-200" : "bg-slate-100 border border-dashed border-slate-300"
        }`} />
      ))}
    </div>
  );
}

// ─── SourcesPanel ─────────────────────────────────────────────────────────────
function SourcesPanel({ results, domain, withAi, sourceRecap }: {
  results: KeywordResult[]; domain: string; withAi: number;
  sourceRecap: { domain: string; count: number; keywords: string[] }[];
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<"d" | "k">("d");
  const clean = domain.replace(/^www\./, "").replace(/^https?:\/\//, "");
  const urlsByDomain = new Map<string, { url: string; title: string; keywords: string[] }[]>();
  for (const r of results) {
    for (const s of r.aiSources) {
      const ex = urlsByDomain.get(s.domain) || [];
      const e = ex.find(x => x.url === s.url);
      if (e) { if (!e.keywords.includes(r.keyword)) e.keywords.push(r.keyword); }
      else ex.push({ url: s.url, title: s.title, keywords: [r.keyword] });
      urlsByDomain.set(s.domain, ex);
    }
  }
  const kwAi = results.filter(r => r.hasAiOverview);
  if (!sourceRecap.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
      <Bot size={28} className="opacity-20" /><p className="text-sm">Nessuna fonte AI</p>
    </div>
  );
  return (
    <div className="flex h-full min-h-[480px]">
      <div className="w-68 shrink-0 border-r border-slate-100 flex flex-col" style={{ width: 260 }}>
        <div className="flex bg-slate-50 border-b border-slate-100 p-1.5 gap-1">
          {(["d", "k"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`flex-1 text-xs py-1 rounded font-medium transition-colors ${view === v ? "bg-white shadow-sm text-slate-900 border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
              {v === "d" ? "Domini" : "Keyword"}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
          {view === "d" && sourceRecap.map((s, i) => {
            const own = s.domain.includes(clean);
            const pct = withAi ? Math.min(100, Math.round(s.keywords.length / withAi * 100)) : 0;
            return (
              <button key={i} onClick={() => setSel(sel === s.domain ? null : s.domain)}
                className={`w-full text-left px-3 py-2.5 transition-colors ${sel === s.domain ? "bg-indigo-50" : own ? "bg-amber-50/50 hover:bg-amber-50" : "hover:bg-slate-50"}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-300 w-4 font-mono">{i + 1}</span>
                  <Fav d={s.domain} s={13} />
                  <span className={`text-xs font-medium truncate flex-1 ${own ? "text-amber-700" : sel === s.domain ? "text-indigo-700" : "text-slate-700"}`}>{s.domain}</span>
                  {own && <span className="text-[9px] bg-amber-200 text-amber-800 px-1 rounded shrink-0">★</span>}
                </div>
                <div className="flex items-center gap-2 mt-1.5 pl-6">
                  <div className="flex-1 bg-slate-100 rounded-full h-1"><div className={`h-1 rounded-full ${own ? "bg-amber-400" : "bg-violet-400"}`} style={{ width: `${pct}%` }} /></div>
                  <span className="text-[10px] text-slate-400">{pct}%</span>
                </div>
              </button>
            );
          })}
          {view === "k" && kwAi.map((r, i) => (
            <button key={i} onClick={() => setSel(sel === r.keyword ? null : r.keyword)}
              className={`w-full text-left px-3 py-2.5 transition-colors ${sel === r.keyword ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
              <p className={`text-xs font-medium truncate ${sel === r.keyword ? "text-indigo-700" : "text-slate-700"}`}>{r.keyword}</p>
              <div className="flex gap-2 mt-0.5">
                <span className="text-[10px] text-violet-500">{r.aiSources.length} fonti</span>
                {r.domainInAiSources && <span className="text-[10px] text-amber-500">★</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {!sel ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <Link size={22} className="opacity-20" /><p className="text-sm">Seleziona {view === "d" ? "un dominio" : "una keyword"}</p>
          </div>
        ) : view === "d" ? (() => {
          const urls = urlsByDomain.get(sel) || [];
          const own = sel.includes(clean);
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Fav d={sel} s={16} />
                <h3 className={`font-bold ${own ? "text-amber-700" : "text-slate-900"}`}>{sel}</h3>
                <span className="text-xs text-slate-400">{urls.length} URL · {sourceRecap.find(s => s.domain === sel)?.keywords.length} query</span>
                {own && <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">★ Tuo dominio</span>}
              </div>
              {urls.map((u, i) => (
                <div key={i} className="border border-slate-100 rounded-xl p-3 bg-white hover:border-indigo-200 transition-colors">
                  <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-indigo-600 hover:underline flex items-start gap-1.5 mb-1">
                    <Link size={11} className="mt-0.5 shrink-0 opacity-50" />{u.title}
                  </a>
                  <p className="text-[10px] text-slate-400 truncate mb-1.5">{u.url}</p>
                  <div className="flex flex-wrap gap-1">
                    {u.keywords.map((k, j) => <span key={j} className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100">{k}</span>)}
                  </div>
                </div>
              ))}
            </div>
          );
        })() : (() => {
          const r = kwAi.find(r => r.keyword === sel); if (!r) return null;
          return (
            <div className="space-y-3">
              <div><h3 className="font-bold text-slate-900">{r.keyword}</h3><p className="text-xs text-slate-400">{r.aiSources.length} fonti in AI Overview</p></div>
              {r.aiSources.map((s, i) => {
                const own = s.domain.includes(clean);
                return (
                  <div key={i} className={`border rounded-xl p-3 bg-white ${own ? "border-amber-200 bg-amber-50/40" : "border-slate-100 hover:border-indigo-200"}`}>
                    <div className="flex items-center gap-2 mb-1.5"><Fav d={s.domain} s={12} /><span className={`text-xs font-medium ${own ? "text-amber-700" : "text-slate-500"}`}>{s.domain}</span>{own && <span className="ml-auto text-[10px] bg-amber-200 text-amber-800 px-1 rounded">★</span>}</div>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-indigo-600 hover:underline flex items-start gap-1.5"><Link size={11} className="mt-0.5 shrink-0 opacity-50" />{s.title}</a>
                    <p className="text-[10px] text-slate-400 truncate mt-1">{s.url}</p>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── ResultsTable ─────────────────────────────────────────────────────────────
function ResultsTable({ results, domain, withAi, runs, prevResults, onAiCheck, aiCheckLoading, aiCheckProgress }: {
  results: KeywordResult[]; domain: string; withAi: number; runs: Run[];
  prevResults?: KeywordResult[]; onAiCheck?: () => void; aiCheckLoading?: boolean; aiCheckProgress?: number;
}) {
  const [exp, setExp] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<"r" | "s" | "c" | "g">("r");
  const [filter, setFilter] = useState<"all" | "ov" | "cited" | "opp">("all");
  const [expComp, setExpComp] = useState<string | null>(null);
  const src = computeSourceRecap(results);
  const hasAI = results.some(r => r.domainInGemini !== null && r.domainInGemini !== undefined);

  const compMap = React.useMemo(() => {
    const cd = domain.replace(/^www\./, "").replace(/^https?:\/\//, "");
    const own = (d: string) => d === cd || d.endsWith("." + cd) || d.includes(cd);
    const map = new Map<string, { g: number; gem: number; gpt: number; plex: number; kw: Set<string> }>();
    const bump = (d: string, p: "g" | "gem" | "gpt" | "plex", kw: string) => {
      if (!d || own(d)) return;
      const e = map.get(d) ?? { g: 0, gem: 0, gpt: 0, plex: 0, kw: new Set() };
      e[p]++; e.kw.add(kw); map.set(d, e);
    };
    for (const r of results) {
      for (const s of r.aiSources) bump(s.domain, "g", r.keyword);
      for (const u of r.geminiSources ?? []) bump(xd(u), "gem", r.keyword);
      for (const u of r.chatgptSources ?? []) bump(xd(u), "gpt", r.keyword);
      for (const u of r.perplexitySources ?? []) bump(xd(u), "plex", r.keyword);
    }
    return Array.from(map.entries())
      .map(([d, v]) => ({ domain: d, g: v.g, gem: v.gem, gpt: v.gpt, plex: v.plex, total: v.g + v.gem + v.gpt + v.plex, kw: Array.from(v.kw) }))
      .sort((a, b) => b.total - a.total);
  }, [results, domain]);

  const total = results.length;
  const ov = results.filter(r => r.hasAiOverview).length;
  const cgai = results.filter(r => r.domainInAiSources).length;
  const cgem = results.filter(r => r.domainInGemini === true).length;
  const cgpt = results.filter(r => r.domainInChatgpt === true).length;
  const opp = results.filter(r => r.hasAiOverview && !r.domainInAiSources && !r.domainInGemini && !r.domainInChatgpt).length;
  const chk = results.filter(r => r.domainInGemini !== null && r.domainInGemini !== undefined).length;
  const geo = chk > 0 ? Math.round(((cgai + cgem + cgpt) / (3 * total)) * 100) : null;

  const filtered = results.filter(r => {
    if (filter === "ov") return r.hasAiOverview;
    if (filter === "cited") return r.domainInAiSources || r.domainInGemini === true || r.domainInChatgpt === true;
    if (filter === "opp") return r.hasAiOverview && !r.domainInAiSources && r.domainInGemini !== true && r.domainInChatgpt !== true;
    return true;
  });

  function tog(i: number) { setExp(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; }); }

  function csv() {
    const h = ["Keyword","SERP","Google AI","Citato AI","Gemini","Perplexity","ChatGPT"].join(",");
    const rows = results.map(r => [
      `"${r.keyword}"`,
      r.domainPosition ? `#${r.domainPosition}` : "—",
      !r.hasAiOverview ? "Assente" : r.domainInAiSources ? "Citato" : "Presente",
      r.domainInAiSources ? "Sì" : "No",
      r.domainInGemini == null ? "—" : r.domainInGemini ? "Sì" : "No",
      r.domainInPerplexity == null ? "—" : r.domainInPerplexity ? "Sì" : "No",
      r.domainInChatgpt == null ? "—" : r.domainInChatgpt ? "Sì" : "No",
    ].join(","));
    const blob = new Blob([[h, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `geo-${domain}-${Date.now()}.csv`; a.click();
  }

  return (
    <div className="space-y-0 bg-white rounded-2xl border border-slate-200 overflow-hidden">

      {/* metric strip */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-5 flex-wrap bg-white">
        {geo !== null && (
          <><div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">GEO</p>
            <p className="text-3xl font-black text-indigo-600 leading-none">{geo}<span className="text-sm font-normal text-slate-400">/100</span></p>
          </div><Sep /></>
        )}
        <Num label="Keyword" value={total} />
        <Sep />
        <Num label="AI Overview" value={ov} accent="text-violet-600" sub={`${total ? Math.round(ov/total*100) : 0}%`} />
        <Num label="Citato Google" value={cgai} accent="text-violet-700" sub={`${total ? Math.round(cgai/total*100) : 0}%`} />
        {hasAI && <><Sep />
          <Num label="Gemini" value={cgem} accent="text-sky-600" sub={`${total ? Math.round(cgem/total*100) : 0}%`} />
          <Num label="ChatGPT" value={cgpt} accent="text-emerald-600" sub={`${total ? Math.round(cgpt/total*100) : 0}%`} />
        </>}
        <Sep />
        <Num label="Opportunità" value={opp} accent="text-amber-500" sub="AI senza citazione" />
      </div>

      {/* tabs + actions row */}
      <div className="flex items-center border-b border-slate-100 bg-white">
        <div className="flex flex-1">
          {[
            { k: "r", l: "Risultati",  n: total },
            { k: "s", l: "Fonti AI",   n: src.length },
            { k: "c", l: "Competitor", n: compMap.length },
            { k: "g", l: "Grafici",    n: null },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k as "r"|"s"|"c"|"g")}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.k ? "border-indigo-500 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}>
              {t.l}
              {t.n !== null && t.n > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === t.k ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>{t.n}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4">
          {tab === "r" && (
            <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
              {([
                { k: "all",  l: `Tutte (${total})` },
                { k: "ov",   l: `AI (${ov})` },
                { k: "cited",l: `Citate (${cgai})` },
                { k: "opp",  l: `Opp. (${opp})` },
              ] as const).map(f => (
                <button key={f.k} onClick={() => setFilter(f.k)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filter === f.k ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                  {f.l}
                </button>
              ))}
            </div>
          )}
          {onAiCheck && (
            <button onClick={onAiCheck} disabled={aiCheckLoading}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors">
              {aiCheckLoading ? <><Loader2 size={12} className="animate-spin" />{aiCheckProgress ?? 0}%</> : <><Bot size={12} />Verifica AI</>}
            </button>
          )}
          <button onClick={csv} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
            <Download size={12} />CSV
          </button>
        </div>
      </div>

      {/* results table */}
      {tab === "r" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                <th className="w-8 px-3 py-2.5" />
                <th className="text-left px-3 py-2.5">Keyword</th>
                <th className="text-center px-3 py-2.5 whitespace-nowrap">SERP</th>
                <th className="text-center px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />Google AI</span>
                </th>
                <th className="text-center px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />Gemini</span>
                </th>
                <th className="text-center px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" />Perplexity</span>
                </th>
                <th className="text-center px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />ChatGPT</span>
                </th>
                <th className="text-center px-3 py-2.5">Copertura</th>
                {prevResults && prevResults.length > 0 && <th className="text-center px-3 py-2.5">Δ</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={20} className="text-center py-10 text-sm text-slate-400">Nessun risultato per questo filtro</td></tr>
              )}
              {filtered.map((r, i) => {
                const prev = prevResults?.find(p => p.keyword === r.keyword);
                const aiCh = prev ? (r.hasAiOverview !== prev.hasAiOverview ? (r.hasAiOverview ? "+" : "-") : null) : null;
                const posDelta = (r.domainPosition != null && prev?.domainPosition != null) ? prev.domainPosition - r.domainPosition : null;
                const canExp = r.hasAiOverview || (r.geminiSources?.length ?? 0) > 0 || (r.chatgptSources?.length ?? 0) > 0;
                const isExp = exp.has(i);
                return (
                  <React.Fragment key={i}>
                    <tr className={`border-b border-slate-50 transition-colors ${canExp ? "cursor-pointer" : ""} ${isExp ? "bg-slate-50/60" : "hover:bg-slate-50/50"}`}
                      onClick={() => canExp && tog(i)}>
                      <td className="px-3 py-2.5 text-slate-300">{canExp ? (isExp ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[200px]"><span className="line-clamp-2 leading-snug">{r.keyword}</span></td>
                      <td className="px-3 py-2.5 text-center">
                        {r.domainPosition ? <span className="text-sm font-bold text-indigo-600">#{r.domainPosition}</span> : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <GoogleAiBadge hasOverview={r.hasAiOverview} domainInAi={r.domainInAiSources} sourcesCount={r.aiSources.length} onClick={r.hasAiOverview ? () => tog(i) : undefined} />
                      </td>
                      <td className="px-3 py-2.5 text-center"><AiBadge cited={r.domainInGemini} mention={r.geminiMention} color="sky" /></td>
                      <td className="px-3 py-2.5 text-center"><AiBadge cited={r.domainInPerplexity} mention={r.perplexityMention} color="teal" /></td>
                      <td className="px-3 py-2.5 text-center"><AiBadge cited={r.domainInChatgpt} mention={r.chatgptMention} color="emerald" /></td>
                      <td className="px-3 py-2.5 text-center"><CovDots r={r} /></td>
                      {prevResults && prevResults.length > 0 && (
                        <td className="px-3 py-2.5 text-center">
                          {!prev ? <span className="text-[10px] text-slate-300">nuovo</span>
                            : aiCh === "+" ? <span className="text-[10px] font-semibold text-emerald-600">▲AI</span>
                            : aiCh === "-" ? <span className="text-[10px] font-semibold text-red-500">▼AI</span>
                            : posDelta !== null && posDelta !== 0 ? <span className={`text-[10px] font-semibold ${posDelta > 0 ? "text-emerald-600" : "text-red-500"}`}>{posDelta > 0 ? `▲+${posDelta}` : `▼${posDelta}`}</span>
                            : <span className="text-slate-200">—</span>}
                        </td>
                      )}
                    </tr>
                    {isExp && (
                      <tr>
                        <td colSpan={8 + (prevResults && prevResults.length > 0 ? 1 : 0)} className="bg-slate-50/80 border-b border-slate-100 px-4 py-4">
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              { label: "Google AI Overview", sources: r.aiSources.map(s => ({ url: s.url, domain: s.domain })), border: "border-violet-100", color: "text-violet-500", dot: "bg-violet-400", empty: !r.hasAiOverview ? "AI Overview assente" : "Nessuna fonte" },
                              { label: "Gemini", sources: (r.geminiSources ?? []).map(u => ({ url: u, domain: xd(u) })), border: "border-sky-100", color: "text-sky-500", dot: "bg-sky-400", empty: r.domainInGemini === null ? "Non verificato" : "Nessuna fonte" },
                              { label: "ChatGPT", sources: (r.chatgptSources ?? []).map(u => ({ url: u, domain: xd(u) })), border: "border-emerald-100", color: "text-emerald-500", dot: "bg-emerald-400", empty: r.domainInChatgpt === null ? "Non verificato" : "Nessuna fonte" },
                            ].map(({ label, sources, border, color, dot, empty }) => {
                              const cd = domain.replace(/^www\.|^https?:\/\//, "");
                              return (
                                <div key={label} className={`bg-white rounded-xl border ${border} p-3`}>
                                  <p className={`text-[10px] font-bold uppercase tracking-widest ${color} mb-2.5 flex items-center gap-1.5`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{label}
                                    {sources.length > 0 && <span className="font-normal normal-case opacity-70">· {sources.length} fonti</span>}
                                  </p>
                                  {sources.length === 0
                                    ? <p className="text-xs text-slate-400 italic">{empty}</p>
                                    : <div className="space-y-1 max-h-32 overflow-y-auto">
                                        {sources.map((s, j) => {
                                          const own = s.domain.includes(cd);
                                          return (
                                            <a key={j} href={s.url} target="_blank" rel="noopener noreferrer"
                                              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors ${own ? "bg-amber-50 text-amber-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>
                                              <Fav d={s.domain} s={11} /><span className="truncate">{s.domain}</span>
                                              {own && <span className="ml-auto shrink-0 text-amber-400 text-[10px]">★</span>}
                                            </a>
                                          );
                                        })}
                                      </div>}
                                </div>
                              );
                            })}
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

      {tab === "s" && <SourcesPanel results={results} domain={domain} withAi={withAi} sourceRecap={src} />}

      {tab === "c" && (
        <div className="p-5">
          {!compMap.length ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
              <Bot size={28} className="opacity-20" /><p className="text-sm">Esegui Verifica AI per vedere i competitor</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Dominio</th>
                    <th className="text-center px-4 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400" />Google AI</span></th>
                    <th className="text-center px-4 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-400" />Gemini</span></th>
                    <th className="text-center px-4 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />ChatGPT</span></th>
                    <th className="text-center px-4 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-400" />Perplexity</span></th>
                    <th className="text-center px-4 py-2.5">Tot</th>
                    <th className="text-center px-4 py-2.5">KW</th>
                  </tr>
                </thead>
                <tbody>
                  {compMap.map((c, i) => (
                    <React.Fragment key={c.domain}>
                      <tr className={`border-b border-slate-50 cursor-pointer transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/30"} hover:bg-indigo-50/20`}
                        onClick={() => setExpComp(expComp === c.domain ? null : c.domain)}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-300 font-mono w-4">{i + 1}</span>
                            <Fav d={c.domain} s={13} />
                            <span className="text-sm font-medium text-slate-800 truncate max-w-[180px]">{c.domain}</span>
                            {expComp === c.domain ? <ChevronDown size={12} className="text-slate-400 shrink-0" /> : <ChevronRight size={12} className="text-slate-300 shrink-0" />}
                          </div>
                        </td>
                        {[c.g, c.gem, c.gpt, c.plex].map((v, ci) => (
                          <td key={ci} className="px-4 py-2.5 text-center">
                            {v > 0 ? <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">{v}</span> : <span className="text-slate-200 text-xs">—</span>}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-center"><span className="text-xs font-bold text-white bg-slate-800 px-2 py-0.5 rounded-full">{c.total}</span></td>
                        <td className="px-4 py-2.5 text-center"><span className="text-xs text-slate-500">{c.kw.length}</span></td>
                      </tr>
                      {expComp === c.domain && (
                        <tr><td colSpan={7} className="px-5 py-3 bg-indigo-50/20 border-b border-indigo-100">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-2">Query dove appare:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {c.kw.map((k, j) => <span key={j} className="text-xs bg-white border border-indigo-100 text-slate-700 px-2 py-0.5 rounded-full">{k}</span>)}
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "g" && (
        <div className="p-6 space-y-8">
          <div><h3 className="text-sm font-semibold text-slate-700 mb-1">Trend visibilità AI</h3><p className="text-xs text-slate-400 mb-4">% keyword citate nel tempo per piattaforma</p><GeoTrendChart runs={runs} /></div>
          <div className="grid grid-cols-2 gap-8">
            <div><h3 className="text-sm font-semibold text-slate-700 mb-1">Citation rate</h3><p className="text-xs text-slate-400 mb-4">% keyword citate con link vs sole menzioni</p><GeoPlatformBar results={results} /></div>
            <div>{hasAI ? <><h3 className="text-sm font-semibold text-slate-700 mb-1">Radar GEO</h3><p className="text-xs text-slate-400 mb-4">% per canale AI</p><GeoRadar results={results} /></> : <><h3 className="text-sm font-semibold text-slate-700 mb-1">Presenza AI Overview</h3><p className="text-xs text-slate-400 mb-4">Distribuzione keyword</p><AiDonut results={results} /></>}</div>
          </div>
          <div className="grid grid-cols-2 gap-8">
            <div><h3 className="text-sm font-semibold text-slate-700 mb-1">Posizioni organiche</h3><p className="text-xs text-slate-400 mb-4">Top 3 / 4–10 / non posizionato</p><PositionChart results={results} /></div>
            <div><h3 className="text-sm font-semibold text-slate-700 mb-1">Breakdown AI Overview</h3><p className="text-xs text-slate-400 mb-4">AI + organico / solo organico / solo AI / assente</p><AiPresenceBreakdown results={results} /></div>
          </div>
          <div><h3 className="text-sm font-semibold text-slate-700 mb-1">Top fonti AI Overview</h3><p className="text-xs text-slate-400 mb-4">Domini più citati — <span className="text-amber-600">giallo</span> tuo · <span className="text-indigo-600">viola</span> competitor</p><TopSourcesChart results={results} trackedDomain={domain} /></div>
        </div>
      )}
    </div>
  );
}

// ─── EditKeywordsModal ─────────────────────────────────────────────────────────
function EditKeywordsModal({ keywords, onClose, onSave }: { keywords: string; onClose: () => void; onSave: (k: string) => void }) {
  const [val, setVal] = useState(keywords);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">Modifica keywords</h2>
          <button onClick={onClose}><X size={16} className="text-slate-400 hover:text-slate-700" /></button>
        </div>
        <div className="p-5">
          <textarea className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:border-indigo-400 resize-none" rows={12} value={val} onChange={e => setVal(e.target.value)} />
          <p className="text-xs text-slate-400 mt-1">{val.split("\n").filter(Boolean).length} keyword</p>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm text-slate-500 px-4 py-2 hover:text-slate-800">Annulla</button>
          <button onClick={() => { onSave(val); onClose(); }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg px-4 py-2">Salva</button>
        </div>
      </div>
    </div>
  );
}

// ─── NewProjectModal ───────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onSave }: { onClose: () => void; onSave: (p: Project) => void }) {
  const [name, setName] = useState(""); const [domain, setDomain] = useState("");
  const [locIdx, setLocIdx] = useState(0); const [keywords, setKeywords] = useState("");
  const [brands, setBrands] = useState(""); const [saving, setSaving] = useState(false);

  const inp = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white";

  async function save() {
    if (!name || !domain) return;
    setSaving(true);
    const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, domain, location: LOCATION_OPTIONS[locIdx].gl, language: LOCATION_OPTIONS[locIdx].hl,
        keywords: keywords.split("\n").map(k => k.trim()).filter(Boolean),
        brands: brands.split("\n").map(b => b.trim()).filter(Boolean) }) });
    onSave((await res.json()).project); setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Nuovo progetto</h2>
          <button onClick={onClose}><X size={18} className="text-slate-400 hover:text-slate-700" /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Nome</label><input className={inp} placeholder="Progetto SEO" value={name} onChange={e => setName(e.target.value)} /></div>
            <div><label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Dominio</label><input className={inp} placeholder="atlante.energy" value={domain} onChange={e => setDomain(e.target.value)} /></div>
          </div>
          <div><label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Paese</label><select className={inp} value={locIdx} onChange={e => setLocIdx(Number(e.target.value))}>{LOCATION_OPTIONS.map((o, i) => <option key={i} value={i}>{o.label}</option>)}</select></div>
          <div><label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Brand names <span className="normal-case font-normal">(uno per riga)</span></label><textarea className={`${inp} font-mono resize-none`} rows={3} placeholder={"Nike\nNike IT"} value={brands} onChange={e => setBrands(e.target.value)} /></div>
          <div><label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Keywords <span className="normal-case font-normal">(una per riga, max 50)</span></label><textarea className={`${inp} font-mono resize-none`} rows={6} placeholder={"keyword 1\nkeyword 2"} value={keywords} onChange={e => setKeywords(e.target.value)} /></div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm text-slate-500 px-4 py-2 hover:text-slate-800">Annulla</button>
          <button onClick={save} disabled={!name || !domain || saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg px-5 py-2 flex items-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}Crea progetto
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── RunDropdown ───────────────────────────────────────────────────────────────
function RunDropdown({ runs, selected, onSelect }: { runs: Run[]; selected: Run | null; onSelect: (r: Run) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  if (!runs.length) return null;
  const idx = selected ? runs.findIndex(r => r.id === selected.id) : -1;
  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button onClick={() => idx > 0 && onSelect(runs[idx - 1])} disabled={idx <= 0} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"><ChevronLeft size={14} /></button>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors">
        <Clock size={12} className="text-slate-400" />
        {selected ? new Date(selected.run_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "Seleziona analisi"}
        <ChevronDown size={12} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <button onClick={() => idx < runs.length - 1 && onSelect(runs[idx + 1])} disabled={idx >= runs.length - 1} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"><ChevronRight size={14} /></button>
      {open && (
        <div className="absolute top-full left-8 mt-1 w-64 bg-white rounded-xl border border-slate-200 shadow-lg z-20 py-1.5 max-h-72 overflow-y-auto">
          {runs.map(run => (
            <button key={run.id} onClick={() => { onSelect(run); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors border-l-2 ${selected?.id === run.id ? "border-indigo-500 bg-indigo-50/50" : "border-transparent"}`}>
              <p className="text-sm font-medium text-slate-800">{new Date(run.run_at).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}</p>
              <p className="text-xs text-slate-400 mt-0.5">{run.total} kw · {run.with_ai} AI · {run.with_domain} pos</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SearchView ────────────────────────────────────────────────────────────────
function SearchView() {
  const [raw, setRaw] = useState("");
  const [locIdx, setLocIdx] = useState(0);
  const [domain, setDomain] = useState("");
  const [brandsRaw, setBrandsRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState("");
  const [expRow, setExpRow] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [selDomain, setSelDomain] = useState<string | null>(null);
  const [genFor, setGenFor] = useState<SearchResult | null>(null);
  const [aiMap, setAiMap] = useState(new Map<string, AiPlatformResult>());
  const [aiLoad, setAiLoad] = useState(false);
  const [aiProg, setAiProg] = useState(0);

  const queries = raw.split("\n").map(q => q.trim()).filter(Boolean).slice(0, 50);

  async function search() {
    if (!queries.length) return;
    setLoading(true); setError(""); setResults([]); setProgress(0);
    setExpRow(null); setShowStats(false); setSelDomain(null); setAiMap(new Map());
    const all: SearchResult[] = [];
    for (let i = 0; i < queries.length; i++) {
      try {
        const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: queries[i], location: LOCATION_OPTIONS[locIdx].gl, language: LOCATION_OPTIONS[locIdx].hl, domain: domain.trim() }) });
        const d = await res.json(); if (res.ok) all.push(d.result);
      } catch { /**/ }
      setProgress(Math.round(((i + 1) / queries.length) * 100));
    }
    setResults(all); setLoading(false);
  }

  async function aiCheck() {
    if (!results.length) return;
    setAiLoad(true); setAiProg(0);
    const kws = results.map(r => r.keyword);
    const brands = brandsRaw.split(",").map(b => b.trim()).filter(Boolean);
    const m = new Map<string, AiPlatformResult>(aiMap);
    for (let i = 0; i < kws.length; i += 3) {
      try {
        const res = await fetch("/api/ai-check", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywords: kws.slice(i, i + 3), domain: domain.trim(), brands }) });
        if (res.ok) { for (const r of (await res.json()).results as AiPlatformResult[]) m.set(r.keyword, r); setAiMap(new Map(m)); }
      } catch { /**/ }
      setAiProg(Math.min(100, Math.round(((i + 3) / kws.length) * 100)));
    }
    setAiLoad(false);
  }

  const domStats = (() => {
    const map = new Map<string, { queryCount: number; urls: { title: string; url: string; query: string }[] }>();
    for (const r of results) {
      if (!r.hasAiOverview) continue;
      for (const s of r.aiSources) {
        const ex = map.get(s.domain) || { queryCount: 0, urls: [] };
        ex.urls.push({ title: s.title, url: s.url, query: r.keyword });
        ex.queryCount = new Set(ex.urls.map(u => u.query)).size;
        map.set(s.domain, ex);
      }
    }
    return Array.from(map.entries()).map(([d, v]) => ({ domain: d, ...v })).sort((a, b) => b.queryCount - a.queryCount);
  })();

  const withAi = results.filter(r => r.hasAiOverview).length;
  const intentCounts = results.reduce((a, r) => { a[r.intent] = (a[r.intent] || 0) + 1; return a; }, {} as Record<string, number>);
  const selData = selDomain ? domStats.find(d => d.domain === selDomain) : null;
  const urlsByQuery = selData ? selData.urls.reduce((a, u) => { if (!a[u.query]) a[u.query] = []; a[u.query].push(u); return a; }, {} as Record<string, { title: string; url: string }[]>) : {};

  // ── empty state ──
  if (!results.length && !loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white px-4 py-16">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-2xl mb-4">
              <Search size={22} className="text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Analisi visibilità AI</h2>
            <p className="text-slate-500 mt-1.5">Inserisci le query per scoprire chi appare su Google AI, Gemini e ChatGPT</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <textarea
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none transition-all"
              rows={6} placeholder={"cos'è il SEO\nlink building Italia\nmigliore agenzia SEO\n..."}
              value={raw} onChange={e => setRaw(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) search(); }}
            />
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Dominio</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white"
                  placeholder="es. nike.it (opzionale)" value={domain} onChange={e => setDomain(e.target.value)} />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Brand (per Verifica AI)</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white"
                  placeholder="Nike, Nike IT, ..." value={brandsRaw} onChange={e => setBrandsRaw(e.target.value)} />
              </div>
              <div className="w-32">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Paese</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white"
                  value={locIdx} onChange={e => setLocIdx(Number(e.target.value))}>
                  {LOCATION_OPTIONS.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
                </select>
              </div>
              <button onClick={search} disabled={!queries.length}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold rounded-xl px-6 py-2 flex items-center gap-2 transition-colors shadow-sm">
                <Search size={14} />Analizza <span className="text-indigo-300 font-normal text-xs">{queries.length > 0 ? `${queries.length} query` : ""}</span>
              </button>
            </div>
            {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
          </div>
          <p className="text-center text-xs text-slate-400 mt-3">⌘+Invio per avviare · max 50 query</p>
        </div>
      </div>
    );
  }

  // ── loading ──
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white gap-4">
        <div className="w-48 bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm text-slate-500">Analisi in corso… {progress}%</p>
      </div>
    );
  }

  // ── results ──
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* compact top bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3 flex-wrap shrink-0">
        <button onClick={() => setResults([])} className="text-slate-400 hover:text-slate-700 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-slate-800 truncate">{queries.length > 1 ? `${results.length} query analizzate` : results[0]?.keyword}</span>
          {domain && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 shrink-0">{domain}</span>}
          <span className="text-xs text-slate-400 shrink-0">{LOCATION_OPTIONS[locIdx].label}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400">{withAi}/{results.length} con AI</span>
          <button onClick={aiCheck} disabled={aiLoad || loading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors">
            {aiLoad ? <><Loader2 size={12} className="animate-spin" />{aiProg}%</> : <><Bot size={12} />Verifica AI</>}
          </button>
          <button onClick={() => { setShowStats(s => !s); setSelDomain(null); }}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${showStats ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
            <BarChart3 size={12} />Stats
          </button>
          <button onClick={() => setRaw("")} className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1.5 rounded hover:bg-slate-50">
            Nuova ricerca
          </button>
        </div>
      </div>

      {/* results table */}
      <div className="flex-1 overflow-auto">
        <div className="bg-white mx-5 my-4 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  <th className="w-8 px-3 py-2.5" />
                  <th className="text-left px-3 py-2.5">Query</th>
                  <th className="text-center px-3 py-2.5">Intento</th>
                  <th className="text-center px-3 py-2.5">AI Overview</th>
                  <th className="text-center px-3 py-2.5">Fonti</th>
                  {domain && <><th className="text-center px-3 py-2.5">In AI</th><th className="text-center px-3 py-2.5">Organico</th></>}
                  {aiMap.size > 0 && <>
                    <th className="text-center px-3 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-400" />Gemini</span></th>
                    <th className="text-center px-3 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-400" />Perplexity</span></th>
                    <th className="text-center px-3 py-2.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />ChatGPT</span></th>
                  </>}
                  <th className="text-center px-3 py-2.5">Articolo</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <React.Fragment key={i}>
                    <tr className={`border-b border-slate-50 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/30"} ${(r.hasAiOverview || aiMap.has(r.keyword)) ? "cursor-pointer hover:bg-indigo-50/20" : ""}`}
                      onClick={() => (r.hasAiOverview || aiMap.has(r.keyword)) && setExpRow(expRow === r.keyword ? null : r.keyword)}>
                      <td className="px-3 py-2.5 text-slate-300">{(r.hasAiOverview || aiMap.has(r.keyword)) ? (expRow === r.keyword ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">{r.keyword}</td>
                      <td className="px-3 py-2.5 text-center"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${r.intentColor}`}>{r.intent}</span></td>
                      <td className="px-3 py-2.5 text-center"><Tag color={r.hasAiOverview ? "violet" : "slate"}>{r.hasAiOverview ? "Sì" : "No"}</Tag></td>
                      <td className="px-3 py-2.5 text-center">{r.hasAiOverview ? <span className="text-xs font-bold text-violet-600">{r.aiSources.length}</span> : <span className="text-slate-200 text-xs">—</span>}</td>
                      {domain && <>
                        <td className="px-3 py-2.5 text-center">{r.domainInAi === null ? <span className="text-slate-200">—</span> : <Tag color={r.domainInAi ? "emerald" : "slate"}>{r.domainInAi ? "Sì" : "No"}</Tag>}</td>
                        <td className="px-3 py-2.5 text-center">{r.domainInOrganic === null ? <span className="text-slate-200">—</span> : r.domainInOrganic ? <span className="text-sm font-bold text-indigo-600">#{r.domainOrgaicPosition}</span> : <Tag color="slate">No</Tag>}</td>
                      </>}
                      {aiMap.size > 0 && (() => { const ai = aiMap.get(r.keyword); return <>
                        <td className="px-3 py-2.5 text-center"><AiBadge cited={ai?.gemini ?? null} mention={ai?.geminiMention ?? null} color="sky" /></td>
                        <td className="px-3 py-2.5 text-center"><AiBadge cited={ai?.perplexity ?? null} mention={ai?.perplexityMention ?? null} color="teal" /></td>
                        <td className="px-3 py-2.5 text-center"><AiBadge cited={ai?.chatgpt ?? null} mention={ai?.chatgptMention ?? null} color="emerald" /></td>
                      </>; })()}
                      <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setGenFor(r)} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white">
                          <Wand2 size={10} />Genera
                        </button>
                      </td>
                    </tr>
                    {expRow === r.keyword && (r.aiSources.length > 0 || aiMap.has(r.keyword)) && (() => {
                      const ai = aiMap.get(r.keyword);
                      const cols = 6 + (domain ? 2 : 0) + (aiMap.size > 0 ? 3 : 0);
                      return (
                        <tr><td colSpan={cols} className="px-4 py-4 bg-slate-50/60 border-b border-slate-100">
                          <div className="space-y-3">
                            {r.aiSources.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500 mb-2">Google AI Overview · {r.aiSources.length} fonti</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                                  {r.aiSources.map((s, j) => (
                                    <a key={j} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-100 bg-white hover:border-violet-200 text-xs transition-colors">
                                      <Fav d={s.domain} s={12} />
                                      <div className="min-w-0"><p className="font-medium text-slate-700 truncate">{s.title.length > 28 ? s.title.slice(0, 28) + "…" : s.title}</p><p className="text-slate-400 truncate">{s.domain}</p></div>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                            {ai && (
                              <div className="grid grid-cols-3 gap-3">
                                {([
                                  { label: "Gemini",     sources: ai.geminiSources,     border: "border-sky-100",     lc: "text-sky-500",     dot: "bg-sky-400",     hov: "hover:bg-sky-50" },
                                  { label: "Perplexity", sources: ai.perplexitySources, border: "border-teal-100",    lc: "text-teal-500",    dot: "bg-teal-400",    hov: "hover:bg-teal-50" },
                                  { label: "ChatGPT",    sources: ai.chatgptSources,    border: "border-emerald-100", lc: "text-emerald-500", dot: "bg-emerald-400", hov: "hover:bg-emerald-50" },
                                ] as const).map(({ label, sources, border, lc, dot, hov }) => (
                                  <div key={label} className={`bg-white rounded-xl border ${border} p-3`}>
                                    <p className={`text-[10px] font-bold uppercase tracking-widest ${lc} mb-2 flex items-center gap-1.5`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{label}{sources.length > 0 ? ` · ${sources.length}` : ""}
                                    </p>
                                    {sources.length === 0
                                      ? <p className="text-xs text-slate-400 italic">Nessuna fonte</p>
                                      : <div className="space-y-1">{sources.map((url, j) => { const d = xd(url); return (<a key={j} href={url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-slate-600 ${hov} transition-colors`}><Fav d={d} s={11} /><span className="truncate">{d}</span></a>); })}</div>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td></tr>
                      );
                    })()}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* stats modal */}
      {showStats && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowStats(false); setSelDomain(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h2 className="font-semibold text-slate-900">Statistiche</h2>
              <button onClick={() => { setShowStats(false); setSelDomain(null); }}><X size={18} className="text-slate-400 hover:text-slate-700" /></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { l: "Query", v: results.length, c: "text-slate-900" },
                  { l: "Con AI Overview", v: `${withAi} · ${results.length ? Math.round(withAi/results.length*100) : 0}%`, c: "text-violet-700" },
                  { l: "Domini AI unici", v: domStats.length, c: "text-indigo-700" },
                  { l: "Intento top", v: Object.entries(intentCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? "—", c: "text-slate-700" },
                ].map((m, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{m.l}</p>
                    <p className={`text-xl font-black mt-1 ${m.c}`}>{m.v}</p>
                  </div>
                ))}
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Distribuzione intento</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(intentCounts).sort((a,b)=>b[1]-a[1]).map(([intent, count]) => {
                    const r = results.find(r => r.intent === intent);
                    return <span key={intent} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${r?.intentColor ?? "bg-white text-slate-600 border-slate-200"}`}>{intent} <b>{count}</b></span>;
                  })}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <Sparkles size={14} className="text-violet-500" />
                  <h3 className="text-sm font-semibold text-slate-900">Domini citati in AI Overview</h3>
                </div>
                <div className="flex" style={{ minHeight: 280 }}>
                  <div className="w-60 border-r border-slate-100 overflow-y-auto max-h-80 divide-y divide-slate-50">
                    {!domStats.length && <p className="px-4 py-6 text-sm text-slate-400 text-center">Nessuna fonte</p>}
                    {domStats.map((d, i) => {
                      const pct = withAi ? Math.round(d.queryCount / withAi * 100) : 0;
                      return (
                        <button key={i} onClick={() => setSelDomain(selDomain === d.domain ? null : d.domain)}
                          className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors ${selDomain === d.domain ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                          <span className="text-[10px] text-slate-300 font-mono w-4">{i+1}</span>
                          <Fav d={d.domain} s={13} />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between mb-0.5"><span className={`text-xs font-medium truncate ${selDomain === d.domain ? "text-indigo-700" : "text-slate-800"}`}>{d.domain}</span><span className="text-[10px] text-slate-400 ml-1 shrink-0">{pct}%</span></div>
                            <div className="w-full bg-slate-100 rounded-full h-1"><div className="h-1 rounded-full bg-violet-400" style={{ width: `${pct}%` }} /></div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex-1 p-4 overflow-y-auto max-h-80">
                    {!selDomain ? <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2"><Link size={20} className="opacity-20" /><p className="text-sm">Seleziona un dominio</p></div>
                      : <div className="space-y-4">
                          <div className="flex items-center gap-2"><Fav d={selDomain} s={15} /><h4 className="font-semibold text-slate-900 text-sm">{selDomain}</h4><span className="text-xs text-slate-400">{selData?.queryCount} query</span></div>
                          {Object.entries(urlsByQuery).map(([q, urls]) => (
                            <div key={q} className="space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">{q}</p>
                              {urls.map((u, i) => (
                                <a key={i} href={u.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2.5 rounded-lg border border-slate-100 hover:border-indigo-200 bg-white transition-colors">
                                  <Link size={11} className="text-indigo-400 mt-0.5 shrink-0" />
                                  <div className="min-w-0"><p className="text-xs font-medium text-indigo-600 hover:underline truncate">{u.title}</p><p className="text-[10px] text-slate-400 truncate mt-0.5">{u.url}</p></div>
                                </a>
                              ))}
                            </div>
                          ))}
                        </div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {genFor && <ArticleGenerator result={genFor} onClose={() => setGenFor(null)} />}
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selProject, setSelProject] = useState<Project | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selRun, setSelRun] = useState<Run | null>(null);
  const [runResults, setRunResults] = useState<KeywordResult[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [showEditKw, setShowEditKw] = useState(false);
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [view, setView] = useState<"list" | "project" | "run">("list");
  const [mainTab, setMainTab] = useState<"search" | "projects">("search");
  const [prevResults, setPrevResults] = useState<KeywordResult[]>([]);
  const [aiLoad, setAiLoad] = useState(false);
  const [aiProg, setAiProg] = useState(0);
  const [runId, setRunId] = useState<number | null>(null);

  useEffect(() => { fetch("/api/projects").then(r => r.json()).then(d => setProjects(d.projects || [])); }, []);

  const loadRuns = useCallback(async (pid: number) => {
    const d = await (await fetch(`/api/projects/${pid}/runs`)).json();
    setRuns(d.runs || []);
  }, []);

  async function openProject(p: Project) {
    setSelProject({ ...p, brands: p.brands || "[]" });
    setKeywordsRaw(JSON.parse(p.keywords).join("\n"));
    setSelRun(null); setRunResults([]);
    await loadRuns(p.id); setView("project");
  }

  async function openRun(run: Run) {
    setSelRun(run); setRunId(run.id);
    const d = await (await fetch(`/api/projects/${run.project_id}/runs/${run.id}`)).json();
    setRunResults(d.results || []);
    const idx = runs.findIndex(r => r.id === run.id);
    const prev = runs[idx + 1];
    if (prev) { const pd = await (await fetch(`/api/projects/${prev.project_id}/runs/${prev.id}`)).json(); setPrevResults(pd.results || []); }
    else setPrevResults([]);
    setView("run");
  }

  async function analyze() {
    if (!selProject) return;
    const kws = keywordsRaw.split("\n").map(k => k.trim()).filter(Boolean);
    if (!kws.length) return;
    await fetch(`/api/projects/${selProject.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...selProject, keywords: kws }) });
    if (runs.length) {
      try { const pd = await (await fetch(`/api/projects/${runs[0].project_id}/runs/${runs[0].id}`)).json(); setPrevResults(pd.results || []); } catch { setPrevResults([]); }
    } else setPrevResults([]);
    setError(""); setLoading(true); setProgress(0);
    const all: KeywordResult[] = [];
    for (let i = 0; i < kws.length; i += 10) {
      try {
        const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywords: kws.slice(i, i+10), domain: selProject.domain, location: selProject.location, language: selProject.language }) });
        if (!res.ok) throw new Error((await res.json()).error || "Errore");
        all.push(...(await res.json()).results);
        setProgress(Math.min(100, Math.round(((i + 10) / kws.length) * 100)));
      } catch (e) { setError(e instanceof Error ? e.message : "Errore"); break; }
    }
    const saved = await (await fetch(`/api/projects/${selProject.id}/runs`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: all, location: selProject.location, language: selProject.language }) })).json();
    setRunResults(all); setRunId(saved.run?.id ?? null);
    await loadRuns(selProject.id); setSelRun(saved.run ?? null);
    setLoading(false); setView("run");
  }

  async function aiCheck() {
    if (!selProject || !runResults.length) return;
    setAiLoad(true); setAiProg(0);
    const kws = runResults.map(r => r.keyword);
    const brands: string[] = (() => { try { return JSON.parse(selProject.brands || "[]"); } catch { return []; } })();
    const all: AiPlatformResult[] = [];
    for (let i = 0; i < kws.length; i += 3) {
      try {
        const res = await fetch("/api/ai-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords: kws.slice(i, i+3), domain: selProject.domain, brands }) });
        if (res.ok) all.push(...(await res.json()).results);
      } catch { /**/ }
      setAiProg(Math.min(100, Math.round(((i + 3) / kws.length) * 100)));
    }
    setRunResults(prev => prev.map(r => { const ai = all.find(a => a.keyword === r.keyword); if (!ai) return r; return { ...r, domainInGemini: ai.gemini, domainInPerplexity: ai.perplexity, domainInChatgpt: ai.chatgpt, geminiMention: ai.geminiMention, perplexityMention: ai.perplexityMention, chatgptMention: ai.chatgptMention, geminiSources: ai.geminiSources, perplexitySources: ai.perplexitySources, chatgptSources: ai.chatgptSources }; }));
    const rid = runId ?? selRun?.id;
    if (rid) await fetch(`/api/projects/${selProject.id}/runs/${rid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aiResults: all }) });
    setAiLoad(false);
  }

  async function deleteProject(id: number) {
    if (!confirm("Eliminare il progetto?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects(p => p.filter(x => x.id !== id));
    if (selProject?.id === id) { setSelProject(null); setView("list"); }
  }

  const total = runResults.filter(r => r.status === "success").length;
  const withAi = runResults.filter(r => r.hasAiOverview).length;
  const withDomain = runResults.filter(r => r.domainInOrganic).length;
  const withDomainInAi = runResults.filter(r => r.domainInAiSources).length;

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">

      {/* ── header ──────────────────────────────────────────────────────────── */}
      <header className="h-11 bg-slate-900 flex items-center px-4 gap-3 shrink-0 border-b border-slate-800">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-5 h-5 rounded bg-indigo-500 flex items-center justify-center shrink-0">
            <BarChart3 size={11} className="text-white" />
          </div>
          <span className="text-sm font-bold text-white">AI Sight</span>
        </div>
        <div className="w-px h-5 bg-slate-700 mx-1" />
        <nav className="flex">
          {([
            { k: "search",   l: "Ricerca",  i: <Search size={12} /> },
            { k: "projects", l: "Progetti", i: <FolderOpen size={12} /> },
          ] as const).map(t => (
            <button key={t.k} onClick={() => { setMainTab(t.k); if (t.k === "projects" && view === "list") {} }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${mainTab === t.k ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>
              {t.i}{t.l}
            </button>
          ))}
        </nav>
        {mainTab === "projects" && selProject && (
          <div className="flex items-center gap-1.5 text-xs ml-1">
            <span className="text-slate-600">/</span>
            <button onClick={() => setView("list")} className="text-slate-400 hover:text-white transition-colors">{selProject.name}</button>
            {(view === "run" || view === "project") && (
              <><span className="text-slate-700">/</span>
              <span className="text-slate-500">{selProject.domain}</span></>
            )}
          </div>
        )}
      </header>

      {/* ── content ─────────────────────────────────────────────────────────── */}
      {mainTab === "search" && (
        <div className="flex-1 flex overflow-hidden"><SearchView /></div>
      )}

      {mainTab === "projects" && (
        <div className="flex-1 overflow-auto">

          {/* projects list */}
          {view === "list" && (
            <div className="max-w-5xl mx-auto px-6 py-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Progetti</h2>
                  <p className="text-sm text-slate-400 mt-0.5">Monitora la visibilità AI per ogni dominio</p>
                </div>
                <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors">
                  <Plus size={14} />Nuovo progetto
                </button>
              </div>
              {!projects.length ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
                  <FolderOpen size={36} className="opacity-15" />
                  <p className="text-sm">Nessun progetto</p>
                  <button onClick={() => setShowNew(true)} className="text-indigo-600 text-sm font-medium hover:underline">Crea il primo →</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projects.map(p => (
                    <div key={p.id} onClick={() => openProject(p)}
                      className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer group">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900 truncate">{p.name}</h3>
                          <p className="text-sm text-slate-400 truncate mt-0.5">{p.domain}</p>
                        </div>
                        <button onClick={e => { e.stopPropagation(); deleteProject(p.id); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-400 p-1 rounded ml-2 shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex gap-3 text-xs text-slate-400">
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

          {/* project / run view */}
          {(view === "project" || view === "run") && selProject && (
            <div className="flex flex-col h-full">
              {/* project top bar */}
              <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 flex-wrap shrink-0">
                <button onClick={() => setView("list")} className="text-slate-400 hover:text-slate-700 transition-colors"><ArrowLeft size={16} /></button>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900">{selProject.name}</h2>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{selProject.domain}</span>
                  <span className="text-xs text-slate-400">{LOCATION_OPTIONS.find(l => l.gl === selProject.location)?.label}</span>
                </div>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {/* run selector */}
                  <RunDropdown runs={runs} selected={selRun} onSelect={openRun} />
                  <div className="w-px h-5 bg-slate-200" />
                  <button onClick={() => setShowEditKw(true)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
                    <Settings size={12} />Keywords
                  </button>
                  <button onClick={analyze} disabled={loading}
                    className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors">
                    {loading ? <><Loader2 size={13} className="animate-spin" />{progress}%</> : <><Search size={13} />Nuova analisi</>}
                  </button>
                </div>
                {error && <p className="w-full text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
              </div>

              {/* content */}
              <div className="flex-1 overflow-auto p-6">
                {view === "project" && !loading && (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
                    <Search size={32} className="opacity-15" />
                    <p className="text-sm font-medium text-slate-500">Avvia una nuova analisi</p>
                    <p className="text-xs text-slate-400">{runs.length > 0 ? `o seleziona un'analisi precedente (${runs.length} disponibili)` : "Nessuna analisi ancora"}</p>
                  </div>
                )}
                {loading && (
                  <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <div className="w-56 bg-slate-100 rounded-full h-1.5"><div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
                    <p className="text-sm text-slate-500">Analisi in corso… {progress}%</p>
                  </div>
                )}
                {view === "run" && runResults.length > 0 && !loading && (
                  <div className="space-y-5">
                    {/* comparison strip */}
                    {prevResults.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3 flex items-center gap-5 flex-wrap text-sm">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">VS analisi precedente</span>
                        {[
                          { l: "AI Overview", d: withAi - prevResults.filter(r => r.hasAiOverview).length },
                          { l: "Organico", d: withDomain - prevResults.filter(r => r.domainInOrganic).length },
                          { l: "Citato AI", d: withDomainInAi - prevResults.filter(r => r.domainInAiSources).length },
                        ].map((x, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500">{x.l}</span>
                            <span className={`text-sm font-bold ${x.d > 0 ? "text-emerald-600" : x.d < 0 ? "text-red-500" : "text-slate-400"}`}>
                              {x.d > 0 ? `+${x.d}` : x.d === 0 ? "=" : x.d}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <ResultsTable
                      results={runResults} domain={selProject.domain}
                      withAi={withAi} runs={runs} prevResults={prevResults}
                      onAiCheck={aiCheck} aiCheckLoading={aiLoad} aiCheckProgress={aiProg}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* modals */}
      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onSave={p => { setProjects(prev => [p, ...prev]); setShowNew(false); openProject(p); }} />}
      {showEditKw && <EditKeywordsModal keywords={keywordsRaw} onClose={() => setShowEditKw(false)} onSave={k => setKeywordsRaw(k)} />}
    </div>
  );
}

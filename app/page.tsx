"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  BarChart3, Bot, Globe, Search, CheckCircle2, XCircle,
  AlertCircle, Download, Loader2, ChevronDown, ChevronRight,
  Link, Plus, Trash2, FolderOpen, Clock, ChevronLeft, Pencil,
  Sparkles, Wand2,
} from "lucide-react";
import type { SearchResult } from "./api/search/route";

const ArticleGenerator = dynamic(() => import("./components/ArticleGenerator"), { ssr: false });
import type { KeywordResult, AiSource } from "./api/analyze/route";
import type { AiPlatformResult } from "./api/ai-check/route";
import { TrendChart, PositionChart, AiDonut, TopSourcesChart, AiPresenceBreakdown, GeoTrendChart, GeoPlatformBar, GeoRadar } from "./components/Charts";

const LOCATION_OPTIONS = [
  { label: "Italia", gl: "it", hl: "it" },
  { label: "USA", gl: "us", hl: "en" },
  { label: "UK", gl: "gb", hl: "en" },
  { label: "Francia", gl: "fr", hl: "fr" },
  { label: "Spagna", gl: "es", hl: "es" },
  { label: "Germania", gl: "de", hl: "de" },
];

interface Project {
  id: number;
  name: string;
  domain: string;
  location: string;
  language: string;
  keywords: string;
  brands: string;
  created_at: string;
}

interface Run {
  id: number;
  project_id: number;
  run_at: string;
  location: string;
  language: string;
  total: number;
  with_ai: number;
  with_domain: number;
  with_domain_in_ai: number;
}

function StatCard({ icon, label, value, sub, gradient, delta }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; gradient: string; delta?: number;
}) {
  return (
    <div className={`rounded-2xl p-5 flex items-center gap-4 shadow-sm ${gradient}`}>
      <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide opacity-75 text-white">{label}</p>
        <div className="flex items-end gap-2">
          <p className="text-2xl font-bold text-white truncate max-w-[120px]" title={String(value)}>{value}</p>
          {delta !== undefined && delta !== 0 && (
            <span className={`text-xs font-semibold mb-0.5 px-1.5 py-0.5 rounded-full ${delta > 0 ? "bg-white/20 text-white" : "bg-black/20 text-white/80"}`}>
              {delta > 0 ? `▲ +${delta}` : `▼ ${delta}`}
            </span>
          )}
        </div>
        {sub && <p className="text-xs text-white/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Badge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${active ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" : "bg-gray-100 text-gray-400"}`}>
      {active ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {label}
    </span>
  );
}

// Helper client-side
function clientExtractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

// 3-state badge per Google AI Overview
function GoogleAiBadge({ hasOverview, domainInAi, sourcesCount, onClick }: {
  hasOverview: boolean; domainInAi: boolean; sourcesCount: number; onClick?: () => void;
}) {
  if (!hasOverview) return <span className="text-xs text-gray-300">Assente</span>;
  if (domainInAi) return (
    <button onClick={onClick} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-200 transition-colors">
      <CheckCircle2 size={10} /> Citato · {sourcesCount} fonti
    </button>
  );
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-200 transition-colors">
      <AlertCircle size={10} /> Presente · non citato
    </button>
  );
}

// Copertura score — pallini per ogni piattaforma
function AiCoverageScore({ r }: { r: KeywordResult }) {
  // cited=true → pieno, mention=true → semitrasparente, false → grigio, null → tratteggiato
  const platforms = [
    { label: "Google AI (citato con link)", cited: r.hasAiOverview ? r.domainInAiSources : null, mention: false, color: "bg-violet-500", mentionColor: "bg-violet-200", na: !r.hasAiOverview },
    { label: "Gemini", cited: r.domainInGemini ?? null, mention: r.geminiMention ?? null, color: "bg-sky-500", mentionColor: "bg-sky-200", na: false },
    { label: "Perplexity", cited: r.domainInPerplexity ?? null, mention: r.perplexityMention ?? null, color: "bg-teal-500", mentionColor: "bg-teal-200", na: false },
    { label: "ChatGPT", cited: r.domainInChatgpt ?? null, mention: r.chatgptMention ?? null, color: "bg-emerald-500", mentionColor: "bg-emerald-200", na: false },
  ];
  const withLink = platforms.filter(p => p.cited === true).length;
  const withMention = platforms.filter(p => p.cited === false && p.mention === true).length;
  const checked = platforms.filter(p => p.cited !== null && !p.na).length;
  return (
    <div className="flex items-center gap-1.5 justify-center">
      {platforms.map((p, i) => (
        <div key={i} title={p.label}
          className={`w-2.5 h-2.5 rounded-full transition-all ${
            p.na ? "bg-gray-100 border border-dashed border-gray-200" :
            p.cited === true ? p.color :
            p.mention === true ? p.mentionColor :
            p.cited === false ? "bg-gray-200" :
            "bg-gray-100 border border-gray-200"
          }`} />
      ))}
      {checked > 0 && (
        <span className="text-xs text-gray-400 ml-0.5">
          {withLink > 0 && <span className="text-emerald-600 font-medium">{withLink}↗</span>}
          {withMention > 0 && <span className="text-amber-500 font-medium ml-0.5">{withMention}💬</span>}
          {withLink === 0 && withMention === 0 && "0"}
          <span className="text-gray-300">/{checked}</span>
        </span>
      )}
    </div>
  );
}

// 3-state: Con link / Solo menzione / Non citato / — (non verificato)
function AiPresenceBadge({ cited, mention, platform }: {
  cited: boolean | null | undefined;
  mention: boolean | null | undefined;
  platform: "gemini" | "perplexity" | "chatgpt";
}) {
  if (cited === null || cited === undefined) return <span className="text-gray-300 text-xs">—</span>;
  const platformColors = {
    gemini: { link: "bg-sky-100 text-sky-700 ring-1 ring-sky-200", mention: "bg-sky-50 text-sky-500 ring-1 ring-sky-100", absent: "bg-gray-100 text-gray-400" },
    perplexity: { link: "bg-teal-100 text-teal-700 ring-1 ring-teal-200", mention: "bg-teal-50 text-teal-500 ring-1 ring-teal-100", absent: "bg-gray-100 text-gray-400" },
    chatgpt: { link: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200", mention: "bg-emerald-50 text-emerald-500 ring-1 ring-emerald-100", absent: "bg-gray-100 text-gray-400" },
  };
  const c = platformColors[platform];
  if (cited) return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.link}`}>
      <CheckCircle2 size={10} /> Con link
    </span>
  );
  if (mention) return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.mention}`}>
      <AlertCircle size={10} /> Menzione
    </span>
  );
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.absent}`}>
      <XCircle size={10} /> Non citato
    </span>
  );
}

// Legacy — kept for SearchView
function AiBadge({ value, platform }: { value: boolean | null | undefined; platform: "gemini" | "perplexity" | "chatgpt" }) {
  return <AiPresenceBadge cited={value} mention={undefined} platform={platform} />;
}

function SourcesRow({ sources, trackedDomain, colSpan = 7 }: { sources: AiSource[]; trackedDomain: string; colSpan?: number }) {
  if (!sources.length) return (
    <tr><td colSpan={colSpan} className="px-6 py-3 bg-gray-50 text-xs text-gray-400 italic">Nessuna fonte disponibile.</td></tr>
  );
  const clean = trackedDomain.replace(/^www\./, "").replace(/^https?:\/\//, "");
  return (
    <tr>
      <td colSpan={7} className="px-4 py-4 bg-indigo-50/40 border-b border-indigo-100">
        <p className="text-xs font-semibold text-indigo-600 mb-3 uppercase tracking-wide flex items-center gap-1.5">
          <Bot size={12} /> Fonti Google AI Overview — {sources.length} risultati
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {sources.map((s, i) => {
            const isTracked = s.domain.includes(clean);
            return (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs transition-all hover:shadow-sm ${isTracked ? "bg-amber-50 border-amber-200 hover:bg-amber-100" : "bg-white border-gray-200 hover:border-indigo-200"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`} alt="" width={14} height={14} className="rounded-sm mt-0.5 shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <div className="min-w-0">
                  <p className={`font-medium leading-tight truncate ${isTracked ? "text-amber-800" : "text-gray-700"}`}>
                    {s.title.length > 45 ? s.title.slice(0, 45) + "…" : s.title}
                  </p>
                  <p className={`mt-0.5 truncate ${isTracked ? "text-amber-500" : "text-gray-400"}`}>{s.domain}</p>
                  {isTracked && <span className="inline-block mt-1 text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">★ tuo dominio</span>}
                </div>
              </a>
            );
          })}
        </div>
      </td>
    </tr>
  );
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

// ─── New Project Modal ────────────────────────────────────────────────────────
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
        <h2 className="font-bold text-gray-900 text-lg">Nuovo progetto</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Nome progetto</label>
            <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" placeholder="es. Atlante Energy SEO" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Dominio</label>
            <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" placeholder="es. atlante.energy" value={domain} onChange={e => setDomain(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Paese</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" value={locationIdx} onChange={e => setLocationIdx(Number(e.target.value))}>
              {LOCATION_OPTIONS.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
              Brand names <span className="normal-case font-normal text-gray-400">— per check menzione AI (uno per riga)</span>
            </label>
            <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 font-mono resize-none" rows={3}
              placeholder={"Piscine Interrate\nPiscineInterrate\natlante.energy"} value={brands} onChange={e => setBrands(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Aggiungi varianti del nome (con/senza .it, acronimi, ecc.)</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Keywords (una per riga)</label>
            <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 font-mono resize-none" rows={5} placeholder="keyword 1&#10;keyword 2&#10;..." value={keywords} onChange={e => setKeywords(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annulla</button>
          <button onClick={handleSave} disabled={!name || !domain || saving} className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl px-5 py-2 flex items-center gap-2 shadow-sm shadow-indigo-200">
            {saving && <Loader2 size={13} className="animate-spin" />} Crea progetto
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sources Panel ───────────────────────────────────────────────────────────
function Favicon({ domain }: { domain: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt=""
      width={16}
      height={16}
      className="rounded-sm shrink-0"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

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

  // Build full URL list per domain
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

  // Per-keyword view data
  const keywordsWithAi = results.filter(r => r.hasAiOverview);

  if (sourceRecap.length === 0) return (
    <div className="px-6 py-12 text-center text-gray-400 text-sm">Nessuna fonte AI rilevata.</div>
  );

  return (
    <div className="flex h-full min-h-[500px]">
      {/* Left panel */}
      <div className="w-72 shrink-0 border-r border-gray-100 flex flex-col">
        {/* View switcher */}
        <div className="p-3 border-b border-gray-100 flex gap-1">
          <button onClick={() => setView("domains")}
            className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${view === "domains" ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-800"}`}>
            Per dominio
          </button>
          <button onClick={() => setView("bykeyword")}
            className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${view === "bykeyword" ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-800"}`}>
            Per keyword
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {view === "domains" && sourceRecap.map((s, i) => {
            const isTracked = s.domain.includes(clean);
            const pct = withAi ? Math.min(100, Math.round((s.keywords.length / withAi) * 100)) : 0;
            return (
              <button key={i} onClick={() => setSelected(s.domain === selected ? null : s.domain)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${selected === s.domain ? "bg-indigo-50" : isTracked ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-gray-50"}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-gray-400 font-mono w-5 shrink-0">{i + 1}</span>
                  <Favicon domain={s.domain} />
                  <span className={`text-sm font-medium truncate ${isTracked ? "text-amber-700" : selected === s.domain ? "text-indigo-700" : "text-gray-800"}`}>{s.domain}</span>
                  {isTracked && <span className="shrink-0 text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full ml-auto">★</span>}
                </div>
                <div className="flex items-center gap-2 pl-7">
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${isTracked ? "bg-amber-400" : "bg-violet-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">{pct}% · {s.keywords.length} query</span>
                </div>
              </button>
            );
          })}

          {view === "bykeyword" && keywordsWithAi.map((r, i) => (
            <button key={i} onClick={() => setSelected(r.keyword === selected ? null : r.keyword)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${selected === r.keyword ? "bg-indigo-50" : "hover:bg-gray-50"}`}>
              <div className={`text-sm font-medium truncate ${selected === r.keyword ? "text-indigo-700" : "text-gray-800"}`}>{r.keyword}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-violet-500">{r.aiSources.length} fonti</span>
                {r.domainInAiSources && <span className="text-xs text-amber-600">★ tuo dominio citato</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto p-5">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2">
            <Link size={28} className="opacity-20" />
            <p>Seleziona un {view === "domains" ? "dominio" : "keyword"} per vedere i dettagli</p>
          </div>
        ) : view === "domains" ? (
          /* Domain detail */
          (() => {
            const urls = urlsByDomain.get(selected) || [];
            const isTracked = selected.includes(clean);
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Favicon domain={selected} />
                  <div>
                    <h3 className={`font-bold text-lg ${isTracked ? "text-amber-700" : "text-gray-900"}`}>{selected}</h3>
                    <p className="text-xs text-gray-400">{urls.length} URL citati in {sourceRecap.find(s => s.domain === selected)?.keywords.length} query</p>
                  </div>
                  {isTracked && <span className="ml-auto text-sm bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-medium">★ Tuo dominio</span>}
                </div>
                <div className="space-y-2">
                  {urls.map((u, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl p-3 hover:border-indigo-200 transition-colors">
                      <a href={u.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-medium text-indigo-600 hover:underline flex items-start gap-1.5 mb-1.5">
                        <Link size={12} className="mt-0.5 shrink-0" />
                        {u.title}
                      </a>
                      <p className="text-xs text-gray-400 truncate mb-2">{u.url}</p>
                      <div className="flex flex-wrap gap-1">
                        {u.keywords.map((kw, j) => (
                          <span key={j} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{kw}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()
        ) : (
          /* Keyword detail */
          (() => {
            const r = keywordsWithAi.find(r => r.keyword === selected);
            if (!r) return null;
            return (
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-lg text-gray-900">{r.keyword}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{r.aiSources.length} fonti citate nell&apos;AI Overview</p>
                </div>
                <div className="space-y-2">
                  {r.aiSources.map((s, i) => {
                    const isTracked = s.domain.includes(clean);
                    return (
                      <div key={i} className={`border rounded-xl p-3 transition-colors ${isTracked ? "border-amber-200 bg-amber-50" : "border-gray-100 hover:border-indigo-200"}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Favicon domain={s.domain} />
                          <span className={`text-xs font-medium ${isTracked ? "text-amber-700" : "text-gray-500"}`}>{s.domain}</span>
                          {isTracked && <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full ml-auto">★ tuo dominio</span>}
                        </div>
                        <a href={s.url} target="_blank" rel="noopener noreferrer"
                          className="text-sm font-medium text-indigo-600 hover:underline flex items-start gap-1.5">
                          <Link size={12} className="mt-0.5 shrink-0" />
                          {s.title}
                        </a>
                        <p className="text-xs text-gray-400 truncate mt-1">{s.url}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}

// ─── Results Table ────────────────────────────────────────────────────────────
function ResultsTable({ results, domain, withAi, runs, prevResults, onAiCheck, aiCheckLoading, aiCheckProgress }: {
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
  const [activeTab, setActiveTab] = useState<"results" | "sources" | "charts" | "competitor">("results");
  const [filter, setFilter] = useState<"all" | "overview" | "cited" | "opportunity">("all");
  const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(null);
  const sourceRecap = computeSourceRecap(results);
  const hasAiPlatformData = results.some(r => r.domainInGemini !== null && r.domainInGemini !== undefined);

  // Competitor map: aggregate all AI source domains except own, per platform
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

  // Stats
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

  // Filtered results
  const filteredResults = results.filter(r => {
    if (filter === "overview") return r.hasAiOverview;
    if (filter === "cited") return r.domainInAiSources || r.domainInGemini === true || r.domainInChatgpt === true;
    if (filter === "opportunity") return r.hasAiOverview && !r.domainInAiSources && r.domainInGemini !== true && r.domainInChatgpt !== true;
    return true;
  });

  function toggleRow(i: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function exportCSV() {
    const header = ["Keyword", "Posizione SERP", "Google AI Overview", "Citato in Google AI", "Fonti Google AI", "Gemini", "Perplexity", "ChatGPT", "Stato"].join(",");
    const rows = results.map(r => {
      const googleAi = !r.hasAiOverview ? "Assente" : r.domainInAiSources ? "Citato" : "Presente";
      return [
        `"${r.keyword}"`,
        r.domainPosition ? `#${r.domainPosition}` : "Non presente",
        googleAi,
        r.domainInAiSources ? "Sì" : "No",
        `"${r.aiSources.map(s => s.domain).join(" | ")}"`,
        r.domainInGemini == null ? "—" : r.domainInGemini ? "Sì" : "No",
        r.domainInPerplexity == null ? "—" : r.domainInPerplexity ? "Sì" : "No",
        r.domainInChatgpt == null ? "—" : r.domainInChatgpt ? "Sì" : "No",
        r.status,
      ].join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `serp-${domain}-${Date.now()}.csv`; a.click();
  }

  return (
    <div className="space-y-4">
      {/* GEO Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {geoScore !== null && (
          <div className="col-span-2 md:col-span-1 lg:col-span-1 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-4 text-white shadow-lg shadow-indigo-200">
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">GEO Score</p>
            <p className="text-4xl font-black mt-1">{geoScore}</p>
            <p className="text-xs opacity-70 mt-0.5">su 100</p>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">AI Overview</p>
          <p className="text-2xl font-bold text-violet-600 mt-1">{withOverview}</p>
          <p className="text-xs text-gray-400 mt-0.5">{total ? Math.round((withOverview/total)*100) : 0}% keyword</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Citato Google AI</p>
          <p className="text-2xl font-bold text-violet-700 mt-1">{citedGoogleAi}</p>
          <p className="text-xs text-gray-400 mt-0.5">{total ? Math.round((citedGoogleAi/total)*100) : 0}% keyword</p>
        </div>
        {hasAiPlatformData && <>
          <div className="bg-white rounded-2xl border border-sky-100 shadow-sm p-4">
            <p className="text-xs text-sky-500 font-semibold uppercase tracking-wider">Citato Gemini</p>
            <p className="text-2xl font-bold text-sky-600 mt-1">{citedGemini}</p>
            <p className="text-xs text-gray-400 mt-0.5">{checkedCount ? Math.round((citedGemini/total)*100) : 0}% keyword</p>
          </div>
          <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-4">
            <p className="text-xs text-emerald-500 font-semibold uppercase tracking-wider">Citato ChatGPT</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{citedChatgpt}</p>
            <p className="text-xs text-gray-400 mt-0.5">{checkedCount ? Math.round((citedChatgpt/total)*100) : 0}% keyword</p>
          </div>
        </>}
        <div className="bg-amber-50 rounded-2xl border border-amber-100 shadow-sm p-4">
          <p className="text-xs text-amber-500 font-semibold uppercase tracking-wider">Opportunità</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{opportunities}</p>
          <p className="text-xs text-gray-400 mt-0.5">AI Overview senza citazione</p>
        </div>
      </div>

    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex gap-1">
          {(["results", "sources", "competitor", "charts"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-800"}`}>
              {tab === "results" ? "Risultati"
                : tab === "sources" ? <>Fonti AI {sourceRecap.length > 0 && <span className="ml-1 bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full text-xs">{sourceRecap.length}</span>}</>
                : tab === "competitor" ? <>Competitor {competitorMap.length > 0 && <span className="ml-1 bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-xs">{competitorMap.length}</span>}</>
                : "📊 Grafici"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter chips */}
          {activeTab === "results" && (
            <div className="flex gap-1 border border-gray-100 rounded-xl p-1 bg-gray-50">
              {([
                { key: "all", label: `Tutte (${total})` },
                { key: "overview", label: `AI Overview (${withOverview})` },
                { key: "cited", label: `Citate (${citedGoogleAi + citedGemini + citedChatgpt > 0 ? Math.max(citedGoogleAi, citedGemini, citedChatgpt) : citedGoogleAi})` },
                { key: "opportunity", label: `Opportunità (${opportunities})` },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filter === f.key ? "bg-white shadow-sm text-indigo-700 border border-indigo-100" : "text-gray-500 hover:text-gray-700"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {onAiCheck && (
            <button
              onClick={onAiCheck}
              disabled={aiCheckLoading}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50 transition-colors"
            >
              {aiCheckLoading
                ? <><Loader2 size={13} className="animate-spin" /> {aiCheckProgress ?? 0}%</>
                : <><Bot size={13} /> Verifica AI</>}
            </button>
          )}
          <button onClick={exportCSV} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
            <Download size={14} /> Esporta CSV
          </button>
        </div>
      </div>

      {activeTab === "results" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <tr>
                <th className="w-8 px-4 py-3 bg-gray-50"></th>
                <th className="text-left px-4 py-3 bg-gray-50">Keyword</th>
                {/* SERP */}
                <th className="text-center px-4 py-3 bg-indigo-50 text-indigo-500 border-l border-indigo-100">
                  <span className="flex items-center justify-center gap-1"><Search size={10} /> SERP</span>
                </th>
                {/* Google AI */}
                <th className="text-center px-4 py-3 bg-violet-50 text-violet-500 border-l border-violet-100" colSpan={1}>
                  <span className="flex items-center justify-center gap-1"><Bot size={10} /> Google AI Overview</span>
                </th>
                {/* AI Platforms */}
                <th className="text-center px-4 py-3 bg-sky-50 text-sky-600 border-l border-sky-100">
                  <span className="flex items-center justify-center gap-1">✦ Gemini</span>
                </th>
                <th className="text-center px-4 py-3 bg-teal-50 text-teal-600">
                  <span className="flex items-center justify-center gap-1">✦ Perplexity</span>
                </th>
                <th className="text-center px-4 py-3 bg-emerald-50 text-emerald-600">
                  <span className="flex items-center justify-center gap-1">✦ ChatGPT</span>
                </th>
                {/* Score */}
                <th className="text-center px-4 py-3 bg-gray-50 border-l border-gray-100">Copertura</th>
                {prevResults && prevResults.length > 0 && <th className="text-center px-4 py-3 bg-gray-50">VS Prec.</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredResults.length === 0 && (
                <tr><td colSpan={20} className="text-center py-12 text-sm text-gray-400">Nessuna keyword corrisponde al filtro selezionato.</td></tr>
              )}
              {filteredResults.map((r, i) => {
                const prev = prevResults?.find(p => p.keyword === r.keyword);
                const aiChanged = prev ? (r.hasAiOverview !== prev.hasAiOverview ? (r.hasAiOverview ? "gained" : "lost") : null) : null;
                const posNow = r.domainPosition ?? null;
                const posPrev = prev?.domainPosition ?? null;
                const posDelta = (posNow !== null && posPrev !== null) ? posPrev - posNow : null; // positive = improved
                const hasDiff = aiChanged !== null || posDelta !== null;
                const canExpand = r.hasAiOverview || (r.geminiSources?.length ?? 0) > 0 || (r.chatgptSources?.length ?? 0) > 0;
                return (
                  <React.Fragment key={i}>
                    <tr className={`hover:bg-gray-50/80 transition-colors border-b border-gray-50 ${canExpand ? "cursor-pointer" : ""}`} onClick={() => canExpand && toggleRow(i)}>
                      <td className="px-4 py-3.5 text-gray-400">{canExpand ? (expandedRows.has(i) ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}</td>
                      <td className="px-4 py-3.5 font-medium text-gray-800 max-w-[220px]">
                        <span className="line-clamp-2 leading-snug">{r.keyword}</span>
                      </td>
                      {/* SERP */}
                      <td className="px-4 py-3.5 text-center border-l border-indigo-50">
                        {r.domainPosition
                          ? <span className="inline-flex items-center gap-1 font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full text-sm">#{r.domainPosition}</span>
                          : <span className="text-xs text-gray-300 bg-gray-50 px-2 py-0.5 rounded-full">Non presente</span>}
                      </td>
                      {/* Google AI Overview — 3 stati */}
                      <td className="px-4 py-3.5 text-center border-l border-violet-50">
                        <GoogleAiBadge
                          hasOverview={r.hasAiOverview}
                          domainInAi={r.domainInAiSources}
                          sourcesCount={r.aiSources.length}
                          onClick={r.hasAiOverview ? () => toggleRow(i) : undefined}
                        />
                      </td>
                      {/* AI Platforms */}
                      <td className="px-4 py-3.5 text-center border-l border-sky-50"><AiPresenceBadge cited={r.domainInGemini} mention={r.geminiMention} platform="gemini" /></td>
                      <td className="px-4 py-3.5 text-center"><AiPresenceBadge cited={r.domainInPerplexity} mention={r.perplexityMention} platform="perplexity" /></td>
                      <td className="px-4 py-3.5 text-center"><AiPresenceBadge cited={r.domainInChatgpt} mention={r.chatgptMention} platform="chatgpt" /></td>
                      {/* Copertura */}
                      <td className="px-4 py-3.5 text-center border-l border-gray-100"><AiCoverageScore r={r} /></td>
                      {prevResults && prevResults.length > 0 && (
                        <td className="px-4 py-3 text-center">
                          {!prev ? (
                            <span className="text-xs text-gray-300 italic">nuovo</span>
                          ) : !hasDiff ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              {aiChanged === "gained" && (
                                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">▲ AI</span>
                              )}
                              {aiChanged === "lost" && (
                                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">▼ AI</span>
                              )}
                              {posDelta !== null && posDelta !== 0 && (
                                <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${posDelta > 0 ? "text-emerald-600 bg-emerald-50" : "text-red-500 bg-red-50"}`}>
                                  {posDelta > 0 ? `▲ +${posDelta}` : `▼ ${posDelta}`} pos
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                    {expandedRows.has(i) && (
                      <tr>
                        <td colSpan={8 + (prevResults && prevResults.length > 0 ? 1 : 0)} className="px-4 py-4 bg-slate-50/60 border-b border-slate-100">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Google AI Overview */}
                            <div>
                              <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <Bot size={11} /> Google AI Overview {r.aiSources.length > 0 && <span className="text-violet-400 font-normal normal-case">· {r.aiSources.length} fonti</span>}
                              </p>
                              {r.aiSources.length === 0
                                ? <p className="text-xs text-gray-400 italic">{r.hasAiOverview ? "Nessuna fonte estratta" : "AI Overview assente"}</p>
                                : <div className="space-y-1 max-h-36 overflow-y-auto">
                                  {r.aiSources.map((s, j) => {
                                    const isMe = s.domain.includes(domain.replace(/^www\.|^https?:\/\//, ""));
                                    return (
                                      <a key={j} href={s.url} target="_blank" rel="noopener noreferrer"
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors ${isMe ? "bg-amber-50 text-amber-700 font-medium" : "bg-white text-gray-600 hover:bg-violet-50"}`}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=16`} alt="" width={12} height={12} className="rounded-sm shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                        <span className="truncate">{s.domain}</span>
                                        {isMe && <span className="shrink-0 ml-auto text-amber-500">★</span>}
                                      </a>
                                    );
                                  })}
                                </div>}
                            </div>
                            {/* Gemini */}
                            <div>
                              <p className="text-xs font-semibold text-sky-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                ✦ Gemini {(r.geminiSources?.length ?? 0) > 0 && <span className="text-sky-400 font-normal normal-case">· {r.geminiSources!.length} fonti</span>}
                              </p>
                              {(r.geminiSources?.length ?? 0) === 0
                                ? <p className="text-xs text-gray-400 italic">{r.domainInGemini === null ? "Non ancora verificato" : "Nessuna fonte"}</p>
                                : <div className="space-y-1 max-h-36 overflow-y-auto">
                                  {r.geminiSources!.map((url, j) => {
                                    const d = clientExtractDomain(url);
                                    const isMe = d.includes(domain.replace(/^www\.|^https?:\/\//, ""));
                                    return (
                                      <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors ${isMe ? "bg-amber-50 text-amber-700 font-medium" : "bg-white text-gray-600 hover:bg-sky-50"}`}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=16`} alt="" width={12} height={12} className="rounded-sm shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                        <span className="truncate">{d}</span>
                                        {isMe && <span className="shrink-0 ml-auto text-amber-500">★</span>}
                                      </a>
                                    );
                                  })}
                                </div>}
                            </div>
                            {/* ChatGPT */}
                            <div>
                              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                ✦ ChatGPT {(r.chatgptSources?.length ?? 0) > 0 && <span className="text-emerald-400 font-normal normal-case">· {r.chatgptSources!.length} fonti</span>}
                              </p>
                              {(r.chatgptSources?.length ?? 0) === 0
                                ? <p className="text-xs text-gray-400 italic">{r.domainInChatgpt === null ? "Non ancora verificato" : "Nessuna fonte"}</p>
                                : <div className="space-y-1 max-h-36 overflow-y-auto">
                                  {r.chatgptSources!.map((url, j) => {
                                    const d = clientExtractDomain(url);
                                    const isMe = d.includes(domain.replace(/^www\.|^https?:\/\//, ""));
                                    return (
                                      <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors ${isMe ? "bg-amber-50 text-amber-700 font-medium" : "bg-white text-gray-600 hover:bg-emerald-50"}`}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=16`} alt="" width={12} height={12} className="rounded-sm shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                        <span className="truncate">{d}</span>
                                        {isMe && <span className="shrink-0 ml-auto text-amber-500">★</span>}
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

      {activeTab === "sources" && (
        <SourcesPanel results={results} domain={domain} withAi={withAi} sourceRecap={sourceRecap} />
      )}

      {activeTab === "competitor" && (
        <div className="p-6">
          {competitorMap.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
              <Bot size={32} className="opacity-20" />
              <p className="text-sm">Nessun dato competitor. Esegui prima un&apos;analisi e poi Verifica AI.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm text-gray-500">{competitorMap.length} domini citati nelle fonti AI al posto tuo — ordinati per frequenza totale</p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-r from-slate-50 to-gray-50 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Dominio</th>
                      <th className="text-center px-4 py-3 font-semibold text-violet-600">Google AI</th>
                      <th className="text-center px-4 py-3 font-semibold text-sky-600">Gemini</th>
                      <th className="text-center px-4 py-3 font-semibold text-emerald-600">ChatGPT</th>
                      <th className="text-center px-4 py-3 font-semibold text-teal-600">Perplexity</th>
                      <th className="text-center px-4 py-3 font-semibold">Totale</th>
                      <th className="text-center px-4 py-3 font-semibold">Keyword</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitorMap.map((c, i) => (
                      <React.Fragment key={c.domain}>
                        <tr
                          className={`border-b border-gray-50 cursor-pointer transition-colors ${i % 2 === 0 ? "bg-white" : "bg-slate-50/40"} hover:bg-indigo-50/30`}
                          onClick={() => setExpandedCompetitor(expandedCompetitor === c.domain ? null : c.domain)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-300 w-5 shrink-0 font-mono">{i + 1}</span>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`https://www.google.com/s2/favicons?domain=${c.domain}&sz=32`} alt="" width={16} height={16} className="rounded-sm shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              <span className="font-medium text-gray-800 truncate max-w-[200px]">{c.domain}</span>
                              {expandedCompetitor === c.domain ? <ChevronDown size={13} className="text-gray-400 shrink-0" /> : <ChevronRight size={13} className="text-gray-300 shrink-0" />}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {c.googleAi > 0 ? <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-xs font-bold">{c.googleAi}</span> : <span className="text-gray-200">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {c.gemini > 0 ? <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-sky-100 text-sky-700 text-xs font-bold">{c.gemini}</span> : <span className="text-gray-200">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {c.chatgpt > 0 ? <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">{c.chatgpt}</span> : <span className="text-gray-200">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {c.perplexity > 0 ? <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-teal-100 text-teal-700 text-xs font-bold">{c.perplexity}</span> : <span className="text-gray-200">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-gray-900 text-white text-xs font-bold min-w-[2rem]">{c.total}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs text-gray-500">{c.keywords.length} kw</span>
                          </td>
                        </tr>
                        {expandedCompetitor === c.domain && (
                          <tr>
                            <td colSpan={7} className="px-6 py-3 bg-indigo-50/30 border-b border-indigo-100">
                              <p className="text-xs font-semibold text-indigo-600 mb-2 uppercase tracking-wide">Query dove appare questo dominio:</p>
                              <div className="flex flex-wrap gap-2">
                                {c.keywords.map((kw, j) => (
                                  <span key={j} className="inline-flex px-2.5 py-1 bg-white border border-indigo-100 rounded-full text-xs text-gray-700">{kw}</span>
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
            </div>
          )}
        </div>
      )}

      {activeTab === "charts" && (
        <div className="p-6 space-y-8">
          {/* GEO Trend storico — primary chart */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Trend visibilità AI nel tempo</h3>
            <p className="text-xs text-gray-400 mb-4">% keyword in cui il dominio appare: Google AI Overview, Gemini, ChatGPT, Perplexity</p>
            <GeoTrendChart runs={runs} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* GEO Platform bar */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Citation rate per piattaforma</h3>
              <p className="text-xs text-gray-400 mb-4">% keyword citate con link (scuro) o solo menzionate (giallo)</p>
              <GeoPlatformBar results={results} />
            </div>

            {/* GEO Radar or AiDonut */}
            <div>
              {hasAiPlatformData
                ? <>
                    <h3 className="text-sm font-semibold text-gray-700 mb-1">Visibilità GEO — radar</h3>
                    <p className="text-xs text-gray-400 mb-4">% keyword in cui il dominio appare per canale</p>
                    <GeoRadar results={results} />
                  </>
                : <>
                    <h3 className="text-sm font-semibold text-gray-700 mb-1">Presenza AI Overview</h3>
                    <p className="text-xs text-gray-400 mb-4">Quante keyword attivano l&apos;AI Overview di Google</p>
                    <AiDonut results={results} />
                  </>
              }
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Distribuzione posizioni */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Distribuzione posizioni organiche</h3>
              <p className="text-xs text-gray-400 mb-4">Top 3 / 4–10 / non posizionato</p>
              <PositionChart results={results} />
            </div>

            {/* Presenza dominio nelle query con AI */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Breakdown su query con AI Overview</h3>
              <p className="text-xs text-gray-400 mb-4">In AI + organico / solo organico / solo AI / assente</p>
              <AiPresenceBreakdown results={results} />
            </div>
          </div>

          {/* Top fonti AI competitor */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Top fonti citate in AI Overview</h3>
            <p className="text-xs text-gray-400 mb-4">Domini più citati come fonti — <span className="text-amber-600 font-medium">giallo</span> = tuo dominio, <span className="text-indigo-600 font-medium">viola</span> = competitor</p>
            <TopSourcesChart results={results} trackedDomain={domain} />
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

// ─── Search View ─────────────────────────────────────────────────────────────
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
    setLoading(true);
    setError("");
    setResults([]);
    setProgress(0);
    setExpandedRow(null);
    setShowStats(false);
    setSelectedDomain(null);
    setAiResults(new Map());
    setAiCheckProgress(0);

    const allResults: SearchResult[] = [];
    for (let i = 0; i < queries.length; i++) {
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: queries[i],
            location: LOCATION_OPTIONS[locationIdx].gl,
            language: LOCATION_OPTIONS[locationIdx].hl,
            domain: domain.trim(),
          }),
        });
        const data = await res.json();
        if (res.ok) allResults.push(data.result);
      } catch { /* skip */ }
      setProgress(Math.round(((i + 1) / queries.length) * 100));
    }

    setResults(allResults);
    setLoading(false);
  }

  async function handleAiCheck() {
    if (!results.length) return;
    setAiCheckLoading(true);
    setAiCheckProgress(0);
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
          for (const r of data.results as AiPlatformResult[]) {
            newMap.set(r.keyword, r);
          }
          setAiResults(new Map(newMap));
        }
      } catch { /* skip */ }
      setAiCheckProgress(Math.min(100, Math.round(((i + BATCH) / keywords.length) * 100)));
    }
    setAiCheckLoading(false);
  }

  // Aggregate: top domains with their URLs per query
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
    // recompute count = unique queries
    return Array.from(map.entries())
      .map(([domain, v]) => ({
        domain,
        queryCount: new Set(v.urls.map(u => u.query)).size,
        urls: v.urls,
      }))
      .sort((a, b) => b.queryCount - a.queryCount);
  })();

  const totalQueries = results.length;
  const withAi = results.filter(r => r.hasAiOverview).length;
  const intentCounts = results.reduce((acc, r) => { acc[r.intent] = (acc[r.intent] || 0) + 1; return acc; }, {} as Record<string, number>);

  // URLs for selected domain grouped by query
  const selectedDomainData = selectedDomain ? domainStats.find(d => d.domain === selectedDomain) : null;
  const urlsByQuery = selectedDomainData
    ? selectedDomainData.urls.reduce((acc, u) => {
        if (!acc[u.query]) acc[u.query] = [];
        acc[u.query].push(u);
        return acc;
      }, {} as Record<string, { title: string; url: string }[]>)
    : {};

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Ricerca</h2>
        <p className="text-sm text-gray-500 mt-1">Analizza query su Google: intento, AI Overview e fonti citate.</p>
      </div>

      {/* Input */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm shadow-indigo-50 p-6">
        <div className="flex gap-4 items-start">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Query / Prompt <span className="text-gray-300 font-normal normal-case">— una per riga, max 50</span></label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 font-mono resize-none transition-all"
              rows={5}
              placeholder={"cos'è il SEO\ncome fare link building\nmigliore agenzia SEO Italia\n..."}
              value={queriesRaw}
              onChange={e => setQueriesRaw(e.target.value)}
            />
            <p className="text-xs text-gray-400">{queries.length}/50 query</p>
          </div>
          <div className="flex flex-col gap-2.5 pt-6 min-w-[160px]">
            <input
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              placeholder="Dominio (opzionale)"
              value={domain}
              onChange={e => setDomain(e.target.value)}
            />
            <input
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              placeholder="Brand AI (es: Nike, Nike IT)"
              title="Nomi brand per rilevare menzioni nei risultati AI, separati da virgola"
              value={brandsRaw}
              onChange={e => setBrandsRaw(e.target.value)}
            />
            <select
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white transition-all"
              value={locationIdx}
              onChange={e => setLocationIdx(Number(e.target.value))}
            >
              {LOCATION_OPTIONS.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
            </select>
            <button
              onClick={handleSearch}
              disabled={loading || !queries.length}
              className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl px-5 py-2.5 flex items-center justify-center gap-2 shadow-md shadow-indigo-200 transition-all"
            >
              {loading ? <><Loader2 size={14} className="animate-spin" />{progress}%</> : <><Search size={14} />Analizza</>}
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-red-500 mt-3 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
      </div>

      {results.length > 0 && (
        <>
          {/* Results table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Risultati <span className="text-gray-400 font-normal">— {totalQueries} query</span></h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAiCheck}
                  disabled={aiCheckLoading || loading}
                  className="flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-xl border border-sky-200 text-sky-600 hover:border-sky-400 hover:bg-sky-50 disabled:opacity-50 transition-all"
                >
                  {aiCheckLoading ? <><Loader2 size={13} className="animate-spin" />{aiCheckProgress}%</> : <><Bot size={13} />Verifica AI</>}
                </button>
                <button
                  onClick={() => { setShowStats(s => !s); setSelectedDomain(null); }}
                  className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-xl transition-all ${showStats ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200" : "border border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"}`}
                >
                  <BarChart3 size={14} /> Statistiche
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-r from-slate-50 to-gray-50 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="w-8 px-4 py-3.5"></th>
                    <th className="text-left px-4 py-3.5 font-semibold">Query</th>
                    <th className="text-center px-4 py-3.5 font-semibold">Intento</th>
                    <th className="text-center px-4 py-3.5 font-semibold">AI Overview</th>
                    <th className="text-center px-4 py-3.5 font-semibold">Fonti AI</th>
                    {domain.trim() && <><th className="text-center px-4 py-3.5 font-semibold">Dominio in AI</th><th className="text-center px-4 py-3.5 font-semibold">Dominio in Organico</th></>}
                    {aiResults.size > 0 && <>
                      <th className="text-center px-4 py-3.5 font-semibold border-l border-sky-100 text-sky-600">Gemini</th>
                      <th className="text-center px-4 py-3.5 font-semibold text-teal-600">Perplexity</th>
                      <th className="text-center px-4 py-3.5 font-semibold text-emerald-600">ChatGPT</th>
                    </>}
                    <th className="text-center px-4 py-3.5 font-semibold">Articolo</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <React.Fragment key={i}>
                      <tr
                        className={`border-b border-gray-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"} ${(r.hasAiOverview || aiResults.has(r.keyword)) ? "cursor-pointer hover:bg-indigo-50/40" : ""}`}
                        onClick={() => (r.hasAiOverview || aiResults.has(r.keyword)) && setExpandedRow(expandedRow === r.keyword ? null : r.keyword)}
                      >
                        <td className="px-4 py-3 text-gray-400 text-xs">{(r.hasAiOverview || aiResults.has(r.keyword)) ? (expandedRow === r.keyword ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{r.keyword}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${r.intentColor}`}>{r.intent}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge active={r.hasAiOverview} label={r.hasAiOverview ? "Sì" : "No"} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.hasAiOverview
                            ? <span className="font-medium text-violet-600">{r.aiSources.length} fonti</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        {domain.trim() && (
                          <>
                            <td className="px-4 py-3 text-center">
                              {r.domainInAi === null ? <span className="text-gray-300">—</span> : <Badge active={r.domainInAi} label={r.domainInAi ? "Sì" : "No"} />}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {r.domainInOrganic === null ? <span className="text-gray-300">—</span> :
                                r.domainInOrganic
                                  ? <span className="font-semibold text-emerald-600">#{r.domainOrgaicPosition}</span>
                                  : <Badge active={false} label="No" />}
                            </td>
                          </>
                        )}
                        {aiResults.size > 0 && (() => {
                          const ai = aiResults.get(r.keyword);
                          return <>
                            <td className="px-4 py-3 text-center border-l border-sky-50">
                              <AiPresenceBadge cited={ai?.gemini ?? null} mention={ai?.geminiMention ?? null} platform="gemini" />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <AiPresenceBadge cited={ai?.perplexity ?? null} mention={ai?.perplexityMention ?? null} platform="perplexity" />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <AiPresenceBadge cited={ai?.chatgpt ?? null} mention={ai?.chatgptMention ?? null} platform="chatgpt" />
                            </td>
                          </>;
                        })()}
                        <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setGeneratingFor(r)}
                            className="inline-flex items-center gap-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm shadow-indigo-200 transition-all"
                          >
                            <Wand2 size={11} /> Genera
                          </button>
                        </td>
                      </tr>
                      {expandedRow === r.keyword && (r.aiSources.length > 0 || aiResults.has(r.keyword)) && (() => {
                        const ai = aiResults.get(r.keyword);
                        const totalCols = 6 + (domain.trim() ? 2 : 0) + (aiResults.size > 0 ? 3 : 0);
                        return (
                          <tr>
                            <td colSpan={totalCols} className="px-6 py-4 bg-indigo-50/30 border-b border-indigo-100">
                              <div className="space-y-4">
                                {r.aiSources.length > 0 && (
                                  <div>
                                    <p className="text-xs font-semibold text-indigo-600 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                                      <Bot size={12} /> Google AI Overview — {r.aiSources.length} fonti
                                    </p>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                      {r.aiSources.map((s, j) => (
                                        <a key={j} href={s.url} target="_blank" rel="noopener noreferrer"
                                          className="flex items-start gap-2 p-2.5 rounded-xl border border-gray-200 bg-white hover:border-indigo-200 text-xs transition-all">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`} alt="" width={14} height={14} className="rounded-sm mt-0.5 shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                          <div className="min-w-0">
                                            <p className="font-medium text-gray-700 leading-tight truncate">{s.title}</p>
                                            <p className="text-gray-400 mt-0.5 truncate">{s.domain}</p>
                                          </div>
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {ai && (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Gemini */}
                                    <div>
                                      <p className="text-xs font-semibold text-sky-600 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                                        <Bot size={12} /> Gemini {ai.geminiSources.length > 0 ? `— ${ai.geminiSources.length} fonti` : ""}
                                      </p>
                                      {ai.geminiSources.length === 0
                                        ? <p className="text-xs text-gray-400 italic">Nessuna fonte citata</p>
                                        : <div className="space-y-1.5">
                                          {ai.geminiSources.map((url, j) => {
                                            const d = clientExtractDomain(url);
                                            return (
                                              <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white hover:border-sky-200 text-xs transition-all">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=32`} alt="" width={12} height={12} className="rounded-sm shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                                <span className="truncate text-gray-600">{d}</span>
                                              </a>
                                            );
                                          })}
                                        </div>
                                      }
                                    </div>
                                    {/* Perplexity */}
                                    <div>
                                      <p className="text-xs font-semibold text-teal-600 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                                        <Bot size={12} /> Perplexity {ai.perplexitySources.length > 0 ? `— ${ai.perplexitySources.length} fonti` : ""}
                                      </p>
                                      {ai.perplexitySources.length === 0
                                        ? <p className="text-xs text-gray-400 italic">Nessuna fonte citata</p>
                                        : <div className="space-y-1.5">
                                          {ai.perplexitySources.map((url, j) => {
                                            const d = clientExtractDomain(url);
                                            return (
                                              <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white hover:border-teal-200 text-xs transition-all">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=32`} alt="" width={12} height={12} className="rounded-sm shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                                <span className="truncate text-gray-600">{d}</span>
                                              </a>
                                            );
                                          })}
                                        </div>
                                      }
                                    </div>
                                    {/* ChatGPT */}
                                    <div>
                                      <p className="text-xs font-semibold text-emerald-600 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                                        <Bot size={12} /> ChatGPT {ai.chatgptSources.length > 0 ? `— ${ai.chatgptSources.length} fonti` : ""}
                                      </p>
                                      {ai.chatgptSources.length === 0
                                        ? <p className="text-xs text-gray-400 italic">Nessuna fonte citata</p>
                                        : <div className="space-y-1.5">
                                          {ai.chatgptSources.map((url, j) => {
                                            const d = clientExtractDomain(url);
                                            return (
                                              <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white hover:border-emerald-200 text-xs transition-all">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=32`} alt="" width={12} height={12} className="rounded-sm shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                                <span className="truncate text-gray-600">{d}</span>
                                              </a>
                                            );
                                          })}
                                        </div>
                                      }
                                    </div>
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

        </>
      )}

      {/* Statistics modal */}
      {showStats && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setShowStats(false); setSelectedDomain(null); }}>
          <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-gray-900">Statistiche</h2>
              <button onClick={() => { setShowStats(false); setSelectedDomain(null); }} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100">
                <XCircle size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={<Search size={18} className="text-white" />} label="Query analizzate" value={totalQueries} gradient="bg-gradient-to-br from-indigo-500 to-indigo-700" />
                <StatCard icon={<Bot size={18} className="text-white" />} label="Con AI Overview" value={`${withAi} (${totalQueries ? Math.round(withAi / totalQueries * 100) : 0}%)`} gradient="bg-gradient-to-br from-violet-500 to-violet-700" />
                <StatCard icon={<Sparkles size={18} className="text-white" />} label="Domini unici in AI" value={domainStats.length} gradient="bg-gradient-to-br from-amber-400 to-orange-500" />
                <StatCard icon={<Globe size={18} className="text-white" />} label="Intento prevalente" value={Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" />
              </div>

              {/* Intento breakdown */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Distribuzione intento</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(intentCounts).sort((a, b) => b[1] - a[1]).map(([intent, count]) => {
                    const r = results.find(r => r.intent === intent);
                    return (
                      <span key={intent} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${r?.intentColor ?? "bg-gray-100 text-gray-600"}`}>
                        {intent} <span className="font-bold">{count}</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Top domains + detail panel */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <Sparkles size={15} className="text-violet-500" />
                  <h3 className="text-sm font-semibold text-gray-900">Domini più citati in AI Overview</h3>
                  <span className="text-xs text-gray-400 ml-1">— clicca per vedere gli URL</span>
                </div>
                <div className="flex" style={{ minHeight: 320 }}>
                  {/* Domain list */}
                  <div className="w-72 shrink-0 border-r border-gray-100 divide-y divide-gray-50 overflow-y-auto max-h-[400px]">
                    {domainStats.length === 0 && <p className="px-5 py-6 text-sm text-gray-400 text-center">Nessuna fonte AI.</p>}
                    {domainStats.map((d, i) => {
                      const pct = withAi ? Math.round((d.queryCount / withAi) * 100) : 0;
                      return (
                        <button key={i} onClick={() => setSelectedDomain(selectedDomain === d.domain ? null : d.domain)}
                          className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${selectedDomain === d.domain ? "bg-indigo-50" : "hover:bg-gray-50"}`}>
                          <span className="text-xs text-gray-400 font-mono w-5 shrink-0">{i + 1}</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`https://www.google.com/s2/favicons?domain=${d.domain}&sz=32`} alt="" width={16} height={16} className="rounded-sm shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-sm font-medium truncate ${selectedDomain === d.domain ? "text-indigo-700" : "text-gray-800"}`}>{d.domain}</span>
                              <span className="text-xs text-gray-400 shrink-0 ml-1">{d.queryCount} · {pct}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full bg-violet-400" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <ChevronRight size={13} className={`shrink-0 text-gray-300 ${selectedDomain === d.domain ? "text-indigo-400" : ""}`} />
                        </button>
                      );
                    })}
                  </div>

                  {/* URL detail */}
                  <div className="flex-1 p-5 overflow-y-auto max-h-[400px]">
                    {!selectedDomain ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2">
                        <Link size={28} className="opacity-20" />
                        <p>Seleziona un dominio per vedere gli URL</p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`https://www.google.com/s2/favicons?domain=${selectedDomain}&sz=32`} alt="" width={18} height={18} className="rounded-sm" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          <h4 className="font-bold text-gray-900">{selectedDomain}</h4>
                          <span className="text-xs text-gray-400 ml-1">{selectedDomainData?.queryCount} query</span>
                        </div>
                        {Object.entries(urlsByQuery).map(([query, urls]) => (
                          <div key={query} className="space-y-1.5">
                            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">{query}</p>
                            {urls.map((u, i) => (
                              <a key={i} href={u.url} target="_blank" rel="noopener noreferrer"
                                className="flex items-start gap-2 p-2.5 rounded-xl border border-gray-100 hover:border-indigo-200 bg-white transition-colors">
                                <Link size={12} className="text-indigo-400 mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-indigo-600 hover:underline truncate">{u.title}</p>
                                  <p className="text-xs text-gray-400 truncate mt-0.5">{u.url}</p>
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

      {generatingFor && (
        <ArticleGenerator
          result={generatingFor}
          onClose={() => setGeneratingFor(null)}
        />
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
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
    setSelectedRun(null);
    setRunResults([]);
    await loadRuns(p.id);
    setView("project");
  }

  async function selectRun(run: Run) {
    setSelectedRun(run);
    setCurrentRunId(run.id);
    const res = await fetch(`/api/projects/${run.project_id}/runs/${run.id}`);
    const data = await res.json();
    setRunResults(data.results || []);

    // Load previous run for comparison
    const currentIdx = runs.findIndex(r => r.id === run.id);
    const prevRun = runs[currentIdx + 1];
    if (prevRun) {
      const prevRes = await fetch(`/api/projects/${prevRun.project_id}/runs/${prevRun.id}`);
      const prevData = await prevRes.json();
      setPrevRunResults(prevData.results || []);
    } else {
      setPrevRunResults([]);
    }

    setView("run");
  }

  async function handleAnalyze() {
    if (!selectedProject) return;
    const keywords = keywordsRaw.split("\n").map(k => k.trim()).filter(Boolean);
    if (!keywords.length) return;

    // Save updated keywords to project
    await fetch(`/api/projects/${selectedProject.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...selectedProject, keywords }),
    });

    // Capture previous run results for comparison
    if (runs.length > 0) {
      const lastRun = runs[0];
      try {
        const prevRes = await fetch(`/api/projects/${lastRun.project_id}/runs/${lastRun.id}`);
        const prevData = await prevRes.json();
        setPrevRunResults(prevData.results || []);
      } catch {
        setPrevRunResults([]);
      }
    } else {
      setPrevRunResults([]);
    }

    setError("");
    setLoading(true);
    setProgress(0);

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
        const data = await res.json();
        allResults.push(...data.results);
        setProgress(Math.min(100, Math.round(((i + BATCH) / keywords.length) * 100)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore sconosciuto");
        break;
      }
    }

    // Save run to DB
    const runSaveRes = await fetch(`/api/projects/${selectedProject.id}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: allResults, location: selectedProject.location, language: selectedProject.language }),
    });
    const runSaveData = await runSaveRes.json();
    const savedRun = runSaveData.run ?? null;

    setRunResults(allResults);
    setCurrentRunId(savedRun?.id ?? null);
    await loadRuns(selectedProject.id);
    setSelectedRun(savedRun);
    setLoading(false);
    setView("run");
  }

  async function handleAiCheck() {
    if (!selectedProject || !runResults.length) return;
    setAiCheckLoading(true);
    setAiCheckProgress(0);

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
        if (res.ok) {
          const data = await res.json();
          allAiResults.push(...data.results);
        }
      } catch { /* skip batch */ }
      setAiCheckProgress(Math.min(100, Math.round(((i + BATCH) / keywords.length) * 100)));
    }

    setRunResults(prev => prev.map(r => {
      const ai = allAiResults.find(a => a.keyword === r.keyword);
      if (!ai) return r;
      return {
        ...r,
        domainInGemini: ai.gemini,
        domainInPerplexity: ai.perplexity,
        domainInChatgpt: ai.chatgpt,
        geminiMention: ai.geminiMention,
        perplexityMention: ai.perplexityMention,
        chatgptMention: ai.chatgptMention,
        geminiSources: ai.geminiSources,
        perplexitySources: ai.perplexitySources,
        chatgptSources: ai.chatgptSources,
      };
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
  const aiPct = total ? Math.round((withAi / total) * 100) : 0;
  const domainPct = total ? Math.round((withDomain / total) * 100) : 0;
  const withDomainInGemini = runResults.filter(r => r.domainInGemini === true).length;
  const withDomainInPerplexity = runResults.filter(r => r.domainInPerplexity === true).length;
  const withDomainInChatgpt = runResults.filter(r => r.domainInChatgpt === true).length;
  const hasCheckedAi = runResults.some(r => r.domainInGemini !== null && r.domainInGemini !== undefined);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 px-6 py-3.5 flex items-center gap-3 shadow-lg shadow-indigo-500/20">
        <button onClick={() => { setMainTab("search"); }} className="flex items-center gap-2.5">
          <div className="bg-white/15 backdrop-blur-sm p-2 rounded-xl border border-white/20">
            <BarChart3 size={20} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight">AI Sight</h1>
        </button>

        {/* Main tabs */}
        <div className="flex gap-1 ml-4 bg-white/10 backdrop-blur-sm rounded-xl p-1 border border-white/10">
          <button
            onClick={() => setMainTab("search")}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${mainTab === "search" ? "bg-white text-indigo-700 shadow-sm" : "text-white/80 hover:text-white hover:bg-white/10"}`}
          >
            <Search size={13} className="inline mr-1.5" />Ricerca
          </button>
          <button
            onClick={() => { setMainTab("projects"); setView("projects"); }}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${mainTab === "projects" ? "bg-white text-indigo-700 shadow-sm" : "text-white/80 hover:text-white hover:bg-white/10"}`}
          >
            <FolderOpen size={13} className="inline mr-1.5" />Progetti
          </button>
        </div>

        {mainTab === "projects" && selectedProject && (
          <>
            <ChevronRight size={16} className="text-white/40" />
            <button onClick={() => setView("project")} className="text-sm text-white/80 hover:text-white font-medium">{selectedProject.name}</button>
          </>
        )}
        {mainTab === "projects" && view === "run" && selectedRun && (
          <>
            <ChevronRight size={16} className="text-white/40" />
            <span className="text-sm text-white/60">{new Date(selectedRun.run_at).toLocaleString("it-IT")}</span>
          </>
        )}
        {mainTab === "projects" && view === "run" && !selectedRun && loading && (
          <>
            <ChevronRight size={16} className="text-white/40" />
            <span className="text-sm text-white/60">Nuova analisi</span>
          </>
        )}
      </header>

      {mainTab === "search" && (
        <div className="flex-1 overflow-auto">
          <SearchView />
        </div>
      )}

      <div className={`flex flex-1 ${mainTab === "search" ? "hidden" : ""}`}>
        {/* Sidebar */}
        {view !== "projects" && selectedProject && (
          <aside className="w-64 bg-white border-r border-gray-100 flex flex-col shrink-0 shadow-sm">
            <div className="p-4 border-b border-gray-100">
              <button onClick={() => setView("projects")} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 mb-3">
                <ChevronLeft size={13} /> Tutti i progetti
              </button>
              <div className="font-semibold text-gray-900 text-sm">{selectedProject.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{selectedProject.domain}</div>
            </div>

            {/* Analyze button */}
            <div className="p-3 border-b border-gray-100">
              <button onClick={handleAnalyze} disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl px-3 py-2 flex items-center justify-center gap-2 shadow-sm shadow-indigo-200">
                {loading ? <><Loader2 size={13} className="animate-spin" />{progress}%</> : <><Search size={13} /> Nuova analisi</>}
              </button>
              {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            </div>

            {/* Runs history */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 mb-2">Storico analisi</p>
              {runs.length === 0 && <p className="text-xs text-gray-400 px-2">Nessuna analisi ancora.</p>}
              {runs.map(run => (
                <button key={run.id} onClick={() => selectRun(run)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${selectedRun?.id === run.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-gray-50 text-gray-700"}`}>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <Clock size={11} className="text-gray-400" />
                    {new Date(run.run_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                  </div>
                  <div className="flex gap-2 mt-1 text-xs text-gray-400">
                    <span>{run.total} kw</span>
                    <span className="text-violet-500">{run.with_ai} AI</span>
                    <span className="text-emerald-500">{run.with_domain} pos</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Keywords editor */}
            <div className="border-t border-gray-100 p-3">
              <button onClick={() => setEditingKeywords(!editingKeywords)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 font-medium w-full">
                <Pencil size={11} /> Modifica keywords
                {editingKeywords ? <ChevronDown size={11} className="ml-auto" /> : <ChevronRight size={11} className="ml-auto" />}
              </button>
              {editingKeywords && (
                <textarea className="mt-2 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-indigo-400 resize-none" rows={8}
                  value={keywordsRaw} onChange={e => setKeywordsRaw(e.target.value)} />
              )}
            </div>
          </aside>
        )}

        <main className="flex-1 overflow-auto">
          {/* Projects list */}
          {view === "projects" && (
            <div className="max-w-4xl mx-auto px-4 py-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Progetti</h2>
                <button onClick={() => setShowNewProject(true)} className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-sm font-semibold rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm shadow-indigo-200">
                  <Plus size={15} /> Nuovo progetto
                </button>
              </div>
              {projects.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                  <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nessun progetto ancora.</p>
                  <button onClick={() => setShowNewProject(true)} className="mt-3 text-indigo-600 text-sm font-medium hover:underline">Crea il primo progetto →</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projects.map(p => (
                    <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-indigo-200 transition-colors cursor-pointer group" onClick={() => selectProject(p)}>
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900">{p.name}</h3>
                          <p className="text-sm text-gray-400 mt-0.5">{p.domain}</p>
                        </div>
                        <button onClick={e => { e.stopPropagation(); deleteProject(p.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-1">
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                        <span>{JSON.parse(p.keywords).length} keywords</span>
                        <span>·</span>
                        <span>{LOCATION_OPTIONS.find(l => l.gl === p.location)?.label || p.location}</span>
                        <span>·</span>
                        <span>Creato {new Date(p.created_at).toLocaleDateString("it-IT")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Project view (no run selected) */}
          {view === "project" && selectedProject && (
            <div className="max-w-4xl mx-auto px-4 py-8">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
                <Search size={40} className="mx-auto mb-3 text-indigo-200" />
                <h3 className="font-semibold text-gray-700 mb-1">Pronto per l&apos;analisi</h3>
                <p className="text-sm text-gray-400">Clicca &quot;Nuova analisi&quot; nella sidebar per avviare.</p>
                {runs.length > 0 && (
                  <p className="text-sm text-gray-400 mt-2">Oppure seleziona un&apos;analisi precedente dalla sidebar.</p>
                )}
              </div>
            </div>
          )}

          {/* Run view */}
          {view === "run" && runResults.length > 0 && selectedProject && (
            <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={<Search size={18} className="text-white" />} label="Keywords analizzate" value={total} gradient="bg-gradient-to-br from-indigo-500 to-indigo-700"
                  delta={prevRunResults.length ? total - prevRunResults.filter(r => r.status === "success").length : undefined} />
                <StatCard icon={<Bot size={18} className="text-white" />} label="Con AI Overview" value={`${withAi} (${aiPct}%)`} sub="delle keyword" gradient="bg-gradient-to-br from-violet-500 to-violet-700"
                  delta={prevRunResults.length ? withAi - prevRunResults.filter(r => r.hasAiOverview).length : undefined} />
                <StatCard icon={<Globe size={18} className="text-white" />} label="Dominio in organico" value={`${withDomain} (${domainPct}%)`} sub="top 10" gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
                  delta={prevRunResults.length ? withDomain - prevRunResults.filter(r => r.domainInOrganic).length : undefined} />
                <StatCard icon={<CheckCircle2 size={18} className="text-white" />} label="Dominio in AI" value={withDomainInAi} sub="citato come fonte" gradient="bg-gradient-to-br from-amber-400 to-orange-500"
                  delta={prevRunResults.length ? withDomainInAi - prevRunResults.filter(r => r.domainInAiSources).length : undefined} />
              </div>
              {hasCheckedAi && (
                <div className="grid grid-cols-3 gap-4">
                  <StatCard icon={<Sparkles size={18} className="text-white" />} label="Dominio in Gemini" value={`${withDomainInGemini}/${total}`} sub={`${total ? Math.round(withDomainInGemini / total * 100) : 0}% delle keyword`} gradient="bg-gradient-to-br from-sky-500 to-sky-700" />
                  <StatCard icon={<Globe size={18} className="text-white" />} label="Dominio in Perplexity" value={`${withDomainInPerplexity}/${total}`} sub={`${total ? Math.round(withDomainInPerplexity / total * 100) : 0}% delle keyword`} gradient="bg-gradient-to-br from-teal-500 to-teal-700" />
                  <StatCard icon={<Bot size={18} className="text-white" />} label="Dominio in ChatGPT" value={`${withDomainInChatgpt}/${total}`} sub={`${total ? Math.round(withDomainInChatgpt / total * 100) : 0}% delle keyword`} gradient="bg-gradient-to-br from-emerald-500 to-emerald-700" />
                </div>
              )}
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

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onSave={p => {
            setProjects(prev => [p, ...prev]);
            setShowNewProject(false);
            selectProject(p);
          }}
        />
      )}
    </div>
  );
}

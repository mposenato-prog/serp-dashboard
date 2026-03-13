"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart3, Bot, Globe, Search, CheckCircle2, XCircle,
  AlertCircle, Download, Loader2, ChevronDown, ChevronRight,
  Link, Plus, Trash2, FolderOpen, Clock, ChevronLeft, Pencil,
  Sparkles,
} from "lucide-react";
import type { SearchResult } from "./api/search/route";
import type { KeywordResult, AiSource } from "./api/analyze/route";
import { TrendChart, PositionChart, AiDonut, TopSourcesChart, AiPresenceBreakdown } from "./components/Charts";

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

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function Badge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
      {active ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {label}
    </span>
  );
}

function SourcesRow({ sources, trackedDomain }: { sources: AiSource[]; trackedDomain: string }) {
  if (!sources.length) return (
    <tr><td colSpan={7} className="px-6 py-3 bg-gray-50 text-xs text-gray-400 italic">Nessuna fonte disponibile.</td></tr>
  );
  const clean = trackedDomain.replace(/^www\./, "").replace(/^https?:\/\//, "");
  return (
    <tr>
      <td colSpan={7} className="px-4 py-4 bg-indigo-50/40 border-b border-indigo-100">
        <p className="text-xs font-semibold text-indigo-600 mb-3 uppercase tracking-wide flex items-center gap-1.5">
          <Bot size={12} /> Fonti AI Overview — {sources.length} risultati
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
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Keywords (una per riga)</label>
            <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 font-mono resize-none" rows={5} placeholder="keyword 1&#10;keyword 2&#10;..." value={keywords} onChange={e => setKeywords(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annulla</button>
          <button onClick={handleSave} disabled={!name || !domain || saving} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-5 py-2 flex items-center gap-2">
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
function ResultsTable({ results, domain, withAi, runs }: { results: KeywordResult[]; domain: string; withAi: number; runs: Run[] }) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<"results" | "sources" | "charts">("results");
  const sourceRecap = computeSourceRecap(results);

  function toggleRow(i: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function exportCSV() {
    const header = ["Keyword", "AI Overview", "Dominio in Organico", "Posizione", "Dominio in AI", "Fonti AI", "Stato"].join(",");
    const rows = results.map(r => [
      `"${r.keyword}"`, r.hasAiOverview ? "Sì" : "No", r.domainInOrganic ? "Sì" : "No",
      r.domainPosition ?? "-", r.domainInAiSources ? "Sì" : "No",
      `"${r.aiSources.map(s => s.domain).join(" | ")}"`, r.status,
    ].join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `serp-${domain}-${Date.now()}.csv`; a.click();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex gap-1">
          {(["results", "sources", "charts"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-800"}`}>
              {tab === "results" ? "Risultati" : tab === "sources" ? <>Fonti AI {sourceRecap.length > 0 && <span className="ml-1 bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full text-xs">{sourceRecap.length}</span>}</> : "📊 Grafici"}
            </button>
          ))}
        </div>
        <button onClick={exportCSV} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
          <Download size={14} /> Esporta CSV
        </button>
      </div>

      {activeTab === "results" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="w-8 px-4 py-3"></th>
                <th className="text-left px-4 py-3">Keyword</th>
                <th className="text-center px-4 py-3">AI Overview</th>
                <th className="text-center px-4 py-3">In organico</th>
                <th className="text-center px-4 py-3">Posizione</th>
                <th className="text-center px-4 py-3">In AI</th>
                <th className="text-center px-4 py-3">Fonti AI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {results.map((r, i) => (
                <React.Fragment key={i}>
                  <tr className={`hover:bg-gray-50 transition-colors ${r.hasAiOverview ? "cursor-pointer" : ""}`} onClick={() => r.hasAiOverview && toggleRow(i)}>
                    <td className="px-4 py-3 text-gray-400">{r.hasAiOverview ? (expandedRows.has(i) ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.keyword}</td>
                    <td className="px-4 py-3 text-center"><Badge active={r.hasAiOverview} label={r.hasAiOverview ? "Sì" : "No"} /></td>
                    <td className="px-4 py-3 text-center"><Badge active={r.domainInOrganic} label={r.domainInOrganic ? "Sì" : "No"} /></td>
                    <td className="px-4 py-3 text-center">{r.domainPosition ? <span className="font-semibold text-indigo-600">#{r.domainPosition}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-center"><Badge active={r.domainInAiSources} label={r.domainInAiSources ? "Sì" : "No"} /></td>
                    <td className="px-4 py-3 text-center">{r.hasAiOverview ? <span className="font-medium text-violet-600">{r.aiSources.length} fonti</span> : <span className="text-gray-300">—</span>}</td>
                  </tr>
                  {expandedRows.has(i) && <SourcesRow sources={r.aiSources} trackedDomain={domain} />}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "sources" && (
        <SourcesPanel results={results} domain={domain} withAi={withAi} sourceRecap={sourceRecap} />
      )}

      {activeTab === "charts" && (
        <div className="p-6 space-y-8">
          {/* Trend storico */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Trend nel tempo</h3>
            <p className="text-xs text-gray-400 mb-4">Evoluzione % AI Overview e visibilità dominio run per run</p>
            <TrendChart runs={runs} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Distribuzione posizioni */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Distribuzione posizioni</h3>
              <p className="text-xs text-gray-400 mb-4">Quante keyword sono in top 3, 4–10 o non posizionate</p>
              <PositionChart results={results} />
            </div>

            {/* AI Overview donut */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Presenza AI Overview</h3>
              <p className="text-xs text-gray-400 mb-4">Quante keyword attivano l&apos;AI Overview di Google</p>
              <AiDonut results={results} />
            </div>
          </div>

          {/* Presenza dominio nelle query con AI */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Breakdown dominio nelle query con AI Overview</h3>
            <p className="text-xs text-gray-400 mb-4">Come appare il tuo dominio nelle keyword che attivano l&apos;AI Overview</p>
            <AiPresenceBreakdown results={results} />
          </div>

          {/* Top fonti AI */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Top fonti citate in AI Overview</h3>
            <p className="text-xs text-gray-400 mb-4">I domini più citati come fonti — <span className="text-amber-600 font-medium">giallo</span> = tuo dominio</p>
            <TopSourcesChart results={results} trackedDomain={domain} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Search View ─────────────────────────────────────────────────────────────
function SearchView() {
  const [query, setQuery] = useState("");
  const [locationIdx, setLocationIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: query.trim(),
          location: LOCATION_OPTIONS[locationIdx].gl,
          language: LOCATION_OPTIONS[locationIdx].hl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore API");
      setResult(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Ricerca rapida</h2>

      {/* Search bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex gap-3">
          <input
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
            placeholder="Inserisci una query..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
          />
          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
            value={locationIdx}
            onChange={e => setLocationIdx(Number(e.target.value))}
          >
            {LOCATION_OPTIONS.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
          </select>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-5 py-2 flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Cerca
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Intent + AI Overview */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Intento</p>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${result.intentColor}`}>
                {result.intent}
              </span>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">AI Overview</p>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${result.hasAiOverview ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-500"}`}>
                <Bot size={14} />
                {result.hasAiOverview ? "Presente" : "Assente"}
              </span>
            </div>
          </div>

          {/* AI Sources */}
          {result.hasAiOverview && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <Sparkles size={15} className="text-violet-500" />
                <h3 className="text-sm font-semibold text-gray-900">Fonti AI</h3>
                <span className="ml-auto text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{result.aiSources.length} fonti</span>
              </div>
              {result.aiSources.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-400">Nessuna fonte disponibile.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {result.aiSources.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`} alt="" width={16} height={16} className="rounded-sm mt-0.5 shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-indigo-600 hover:underline truncate">{s.title}</p>
                        <p className="text-xs text-gray-400 truncate">{s.domain}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
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
  const [mainTab, setMainTab] = useState<"projects" | "search">("projects");

  useEffect(() => {
    fetch("/api/projects").then(r => r.json()).then(d => setProjects(d.projects || []));
  }, []);

  const loadRuns = useCallback(async (projectId: number) => {
    const res = await fetch(`/api/projects/${projectId}/runs`);
    const data = await res.json();
    setRuns(data.runs || []);
  }, []);

  async function selectProject(p: Project) {
    setSelectedProject(p);
    setKeywordsRaw(JSON.parse(p.keywords).join("\n"));
    setSelectedRun(null);
    setRunResults([]);
    await loadRuns(p.id);
    setView("project");
  }

  async function selectRun(run: Run) {
    setSelectedRun(run);
    const res = await fetch(`/api/projects/${run.project_id}/runs/${run.id}`);
    const data = await res.json();
    setRunResults(data.results || []);
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
    await fetch(`/api/projects/${selectedProject.id}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: allResults, location: selectedProject.location, language: selectedProject.language }),
    });

    setRunResults(allResults);
    await loadRuns(selectedProject.id);
    setLoading(false);
    setView("run");
    setSelectedRun(null);
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        <button onClick={() => { setMainTab("projects"); setView("projects"); }} className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-xl"><BarChart3 size={20} className="text-white" /></div>
          <h1 className="text-lg font-bold text-gray-900">SERP Dashboard</h1>
        </button>

        {/* Main tabs */}
        <div className="flex gap-1 ml-4 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => { setMainTab("projects"); setView("projects"); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mainTab === "projects" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            <FolderOpen size={13} className="inline mr-1.5" />Progetti
          </button>
          <button
            onClick={() => setMainTab("search")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mainTab === "search" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            <Search size={13} className="inline mr-1.5" />Ricerca
          </button>
        </div>

        {mainTab === "projects" && selectedProject && (
          <>
            <ChevronRight size={16} className="text-gray-300" />
            <button onClick={() => setView("project")} className="text-sm text-gray-600 hover:text-gray-900 font-medium">{selectedProject.name}</button>
          </>
        )}
        {mainTab === "projects" && view === "run" && selectedRun && (
          <>
            <ChevronRight size={16} className="text-gray-300" />
            <span className="text-sm text-gray-500">{new Date(selectedRun.run_at).toLocaleString("it-IT")}</span>
          </>
        )}
        {mainTab === "projects" && view === "run" && !selectedRun && loading && (
          <>
            <ChevronRight size={16} className="text-gray-300" />
            <span className="text-sm text-gray-500">Nuova analisi</span>
          </>
        )}
        <span className="ml-auto text-xs text-gray-400">powered by SerpApi</span>
      </header>

      {mainTab === "search" && (
        <div className="flex-1 overflow-auto">
          <SearchView />
        </div>
      )}

      <div className={`flex flex-1 ${mainTab === "search" ? "hidden" : ""}`}>
        {/* Sidebar */}
        {view !== "projects" && selectedProject && (
          <aside className="w-64 bg-white border-r border-gray-100 flex flex-col shrink-0">
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
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-3 py-2 flex items-center justify-center gap-2">
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
                <h2 className="text-xl font-bold text-gray-900">Progetti</h2>
                <button onClick={() => setShowNewProject(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl px-4 py-2 flex items-center gap-2">
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
                <StatCard icon={<Search size={18} className="text-indigo-600" />} label="Keywords analizzate" value={total} color="bg-indigo-50" />
                <StatCard icon={<Bot size={18} className="text-violet-600" />} label="Con AI Overview" value={`${withAi} (${aiPct}%)`} sub="delle keyword" color="bg-violet-50" />
                <StatCard icon={<Globe size={18} className="text-emerald-600" />} label="Dominio in organico" value={`${withDomain} (${domainPct}%)`} sub="top 10" color="bg-emerald-50" />
                <StatCard icon={<CheckCircle2 size={18} className="text-amber-600" />} label="Dominio in AI" value={withDomainInAi} sub="citato come fonte" color="bg-amber-50" />
              </div>
              <ResultsTable results={runResults} domain={selectedProject.domain} withAi={withAi} runs={runs} />
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

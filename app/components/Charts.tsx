"use client";

import React from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, RadarChart,
  Radar, PolarGrid, PolarAngleAxis,
} from "recharts";
import type { KeywordResult } from "@/app/api/analyze/route";

interface Run {
  id: number;
  run_at: string;
  total: number;
  with_ai: number;
  with_domain: number;
  with_domain_in_ai: number;
  with_gemini?: number;
  with_perplexity?: number;
  with_chatgpt?: number;
  with_gemini_mention?: number;
  with_chatgpt_mention?: number;
  ai_checked?: number;
}

// ── Trend line chart ──────────────────────────────────────────────────────────
export function TrendChart({ runs }: { runs: Run[] }) {
  const data = [...runs].reverse().map((r) => ({
    date: new Date(r.run_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }),
    "AI Overview %": r.total ? Math.round((r.with_ai / r.total) * 100) : 0,
    "Dominio in organico %": r.total ? Math.round((r.with_domain / r.total) * 100) : 0,
    "Dominio in AI %": r.total ? Math.round((r.with_domain_in_ai / r.total) * 100) : 0,
  }));

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        Servono almeno 2 analisi per visualizzare il trend.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis unit="%" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} domain={[0, 100]} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
          formatter={(v) => `${v}%`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="AI Overview %" stroke="#7c3aed" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
        <Line type="monotone" dataKey="Dominio in organico %" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
        <Line type="monotone" dataKey="Dominio in AI %" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Position distribution bar chart ──────────────────────────────────────────
export function PositionChart({ results }: { results: KeywordResult[] }) {
  const buckets = { "Top 3": 0, "4–10": 0, "Non posizionato": 0 };
  for (const r of results) {
    if (!r.domainPosition) buckets["Non posizionato"]++;
    else if (r.domainPosition <= 3) buckets["Top 3"]++;
    else buckets["4–10"]++;
  }
  const data = [
    { name: "Top 3", value: buckets["Top 3"], fill: "#10b981" },
    { name: "4–10", value: buckets["4–10"], fill: "#6366f1" },
    { name: "Non posiz.", value: buckets["Non posizionato"], fill: "#e5e7eb" },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
        <Bar dataKey="value" name="Keyword" radius={[8, 8, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── AI Overview donut ─────────────────────────────────────────────────────────
export function AiDonut({ results }: { results: KeywordResult[] }) {
  const withAi = results.filter(r => r.hasAiOverview).length;
  const noAi = results.length - withAi;
  const data = [
    { name: "Con AI Overview", value: withAi, fill: "#7c3aed" },
    { name: "Senza AI Overview", value: noAi, fill: "#e5e7eb" },
  ];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
          paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name ?? ""} ${Math.round(((percent as number) ?? 0) * 100)}%`}
          labelLine={false} fontSize={11}>
          {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Top AI sources horizontal bar ─────────────────────────────────────────────
export function TopSourcesChart({ results, trackedDomain }: { results: KeywordResult[]; trackedDomain: string }) {
  const map = new Map<string, number>();
  for (const r of results) {
    for (const s of r.aiSources) {
      map.set(s.domain, (map.get(s.domain) || 0) + 1);
    }
  }
  const clean = trackedDomain.replace(/^www\./, "").replace(/^https?:\/\//, "");
  const data = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({
      domain: domain.length > 28 ? domain.slice(0, 28) + "…" : domain,
      Citazioni: count,
      fill: domain.includes(clean) ? "#f59e0b" : "#6366f1",
    }));

  if (!data.length) return (
    <div className="flex items-center justify-center h-48 text-sm text-gray-400">
      Nessuna fonte AI rilevata.
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="domain" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} width={160} />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
        <Bar dataKey="Citazioni" radius={[0, 8, 8, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── AI presence breakdown stacked bar ────────────────────────────────────────
export function AiPresenceBreakdown({ results }: { results: KeywordResult[] }) {
  const withAi = results.filter(r => r.hasAiOverview);
  const domainInAiAndOrganic = withAi.filter(r => r.domainInAiSources && r.domainInOrganic).length;
  const domainOnlyOrganic = withAi.filter(r => !r.domainInAiSources && r.domainInOrganic).length;
  const domainOnlyAi = withAi.filter(r => r.domainInAiSources && !r.domainInOrganic).length;
  const domainAbsent = withAi.filter(r => !r.domainInAiSources && !r.domainInOrganic).length;

  const data = [
    { name: "In AI + Organico", value: domainInAiAndOrganic, fill: "#10b981" },
    { name: "Solo Organico", value: domainOnlyOrganic, fill: "#6366f1" },
    { name: "Solo AI", value: domainOnlyAi, fill: "#f59e0b" },
    { name: "Assente", value: domainAbsent, fill: "#e5e7eb" },
  ].filter(d => d.value > 0);

  if (!withAi.length) return (
    <div className="flex items-center justify-center h-48 text-sm text-gray-400">
      Nessuna keyword con AI Overview.
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="45%" outerRadius={85} paddingAngle={3}
          dataKey="value" fontSize={11}>
          {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── GEO Trend: AI platforms over time ────────────────────────────────────────
export function GeoTrendChart({ runs }: { runs: Run[] }) {
  const data = [...runs].reverse().map((r) => {
    const base = r.total || 1;
    const checked = r.ai_checked || 0;
    const denom = checked || base;
    return {
      date: new Date(r.run_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }),
      "AI Overview %": Math.round((r.with_ai / base) * 100),
      "Gemini %": checked ? Math.round(((r.with_gemini || 0) / denom) * 100) : null,
      "ChatGPT %": checked ? Math.round(((r.with_chatgpt || 0) / denom) * 100) : null,
      "Perplexity %": checked ? Math.round(((r.with_perplexity || 0) / denom) * 100) : null,
    };
  });

  const hasAiData = data.some(d => d["Gemini %"] !== null);

  if (data.length < 2) return (
    <div className="flex items-center justify-center h-48 text-sm text-gray-400">
      Servono almeno 2 analisi per il trend.
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis unit="%" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} domain={[0, 100]} />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} formatter={(v) => v !== null ? `${v}%` : "—"} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="AI Overview %" stroke="#7c3aed" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
        {hasAiData && <>
          <Line type="monotone" dataKey="Gemini %" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false} />
          <Line type="monotone" dataKey="ChatGPT %" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false} />
          <Line type="monotone" dataKey="Perplexity %" stroke="#14b8a6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false} />
        </>}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── GEO Platform bar (single run snapshot) ───────────────────────────────────
export function GeoPlatformBar({ results }: { results: KeywordResult[] }) {
  const total = results.length || 1;
  const withOverview = results.filter(r => r.hasAiOverview).length;
  const geminiCited   = results.filter(r => r.domainInGemini === true).length;
  const geminiMention = results.filter(r => r.domainInGemini !== true && r.geminiMention === true).length;
  const chatgptCited   = results.filter(r => r.domainInChatgpt === true).length;
  const chatgptMention = results.filter(r => r.domainInChatgpt !== true && r.chatgptMention === true).length;
  const plxCited = results.filter(r => r.domainInPerplexity === true).length;

  const hasAiCheck = results.some(r => r.domainInGemini !== undefined && r.domainInGemini !== null);

  const data = [
    { name: "Google AI Overview", citato: Math.round((withOverview / total) * 100), fill: "#7c3aed" },
    ...(hasAiCheck ? [
      { name: "Gemini", citato: Math.round((geminiCited / total) * 100), menzione: Math.round((geminiMention / total) * 100), fill: "#0ea5e9" },
      { name: "Perplexity", citato: Math.round((plxCited / total) * 100), fill: "#14b8a6" },
      { name: "ChatGPT", citato: Math.round((chatgptCited / total) * 100), menzione: Math.round((chatgptMention / total) * 100), fill: "#10b981" },
    ] : []),
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
        <YAxis unit="%" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} domain={[0, 100]} />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} formatter={(v) => `${v}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="citato" name="Citato (con link)" stackId="a" radius={[0, 0, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Bar>
        <Bar dataKey="menzione" name="Solo menzione" stackId="a" radius={[6, 6, 0, 0]} fill="#fde68a" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── GEO Spider / Radar ────────────────────────────────────────────────────────
export function GeoRadar({ results }: { results: KeywordResult[] }) {
  const total = results.length || 1;
  const hasAiCheck = results.some(r => r.domainInGemini !== undefined && r.domainInGemini !== null);
  if (!hasAiCheck) return null;

  const pct = (n: number) => Math.round((n / total) * 100);
  const data = [
    { subject: "Google AI", A: pct(results.filter(r => r.domainInAiSources).length) },
    { subject: "Gemini", A: pct(results.filter(r => r.domainInGemini === true).length) },
    { subject: "ChatGPT", A: pct(results.filter(r => r.domainInChatgpt === true).length) },
    { subject: "Perplexity", A: pct(results.filter(r => r.domainInPerplexity === true).length) },
    { subject: "Organico", A: pct(results.filter(r => r.domainInOrganic).length) },
  ];

  return (
    <ResponsiveContainer width="100%" height={240}>
      <RadarChart cx="50%" cy="50%" outerRadius={90} data={data}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#6b7280" }} />
        <Radar name="Visibilità %" dataKey="A" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} formatter={(v) => `${v}%`} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type TopicRow = {
  slug: string; name: string; origin: string; mentions: number; prev: number; deltaPct: number | null;
  painPct: number | null; negativePct: number | null; unresolvedPct: number | null; avgSentiment: number | null;
  series: number[]; keywords: number;
};

type Key = "name" | "mentions" | "deltaPct" | "painPct" | "negativePct" | "unresolvedPct";

function Spark({ v }: { v: number[] }) {
  const w = 88, h = 24, max = Math.max(1, ...v);
  const pts = v.map((x, i) => `${(i / Math.max(1, v.length - 1)) * (w - 4) + 2},${h - 3 - (x / max) * (h - 6)}`).join(" ");
  return <svg width={w} height={h} aria-hidden><polyline points={pts} fill="none" stroke="var(--color-cobalt)" strokeWidth="1.5" /></svg>;
}

function Change({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[13px] font-medium text-rise">new</span>;
  if (pct === 0) return <span className="text-[13px] text-muted">0%</span>;
  return <span className={`whitespace-nowrap text-[13px] font-medium ${pct > 0 ? "text-rise" : "text-ease"}`}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

function Meter({ pct, tone }: { pct: number | null; tone: "rise" | "amber" | "cobalt" }) {
  if (pct === null) return <span className="text-muted">—</span>;
  const color = { rise: "var(--color-rise)", amber: "#c58a1b", cobalt: "var(--color-cobalt)" }[tone];
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 rounded-full bg-paper"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
      <span className="w-9 text-[13px]">{pct}%</span>
    </div>
  );
}

export function TopicsTable({ rows, week, compact }: { rows: TopicRow[]; week: string; compact?: boolean }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "mentions", dir: -1 });
  const sorted = useMemo(() => {
    const val = (r: TopicRow) => (sort.key === "name" ? r.name : (r[sort.key] ?? -Infinity));
    return [...rows].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [rows, sort]);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.mentions, r.prev)));
  const th = (key: Key, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
        {label}<span className="text-[10px]">{sort.key === key ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
  return (
    <div className="overflow-x-auto">
      <table className="tbl w-full min-w-[820px] text-[14px]">
        <thead>
          <tr>
            {th("name", "Topic")}
            {th("mentions", "Posts this week")}
            {th("deltaPct", "Change")}
            <th>8 weeks</th>
            {!compact && th("painPct", "Pain points")}
            {th("negativePct", "Negative")}
            {th("unresolvedPct", "Unresolved")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.slug}>
              <td className="max-w-[260px]">
                <Link href={`/topic/${r.slug}?week=${week}`} className="font-medium hover:text-cobalt hover:underline">{r.name}</Link>
                {r.origin === "ai" && <span className="ml-2 rounded-full bg-amber-soft px-1.5 py-0.5 text-[11px] font-medium text-amber">AI-added</span>}
                {!compact && <div className="text-[12px] text-muted">{r.keywords} keywords</div>}
              </td>
              <td>
                <div className="flex items-center gap-3">
                  <span className="num w-10 text-right text-[16px] font-bold">{r.mentions}</span>
                  <div className="relative h-2 w-28 rounded-full bg-paper" title={`${r.mentions} this week, ${r.prev} last week`}>
                    <div className="absolute inset-y-0 left-0 rounded-full bg-cobalt/80" style={{ width: `${(r.mentions / max) * 100}%` }} />
                    <div className="absolute -inset-y-1 w-[2px] bg-ink" style={{ left: `${(r.prev / max) * 100}%` }} />
                  </div>
                </div>
              </td>
              <td><Change pct={r.deltaPct} /><div className="text-[12px] text-muted">from {r.prev}</div></td>
              <td><Spark v={r.series} /></td>
              {!compact && <td><Meter pct={r.painPct} tone="cobalt" /></td>}
              <td><Meter pct={r.negativePct} tone="rise" /></td>
              <td><Meter pct={r.unresolvedPct} tone="amber" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

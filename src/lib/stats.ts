import type { TopicWeekStat } from "./types";

export type TopicSummary = {
  slug: string;
  mentions: number;
  prev: number;
  deltaPct: number | null;
  negativePct: number | null;
  unresolvedPct: number | null;
  painPct: number | null;
  avgSentiment: number | null;
  engagement: number;
  series: { week: string; mentions: number; sentiment: number | null }[];
};

export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function delta(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null; // null = "new"
  return Math.round(((cur - prev) / prev) * 100);
}

export function summarize(rows: TopicWeekStat[], slugs: string[], weeks: string[], week: string, prevWeek: string): TopicSummary[] {
  const key = (s: string, w: string) => `${s}|${w}`;
  const map = new Map(rows.map((r) => [key(r.topic_slug, r.week_start), r]));
  return slugs.map((slug) => {
    const c = map.get(key(slug, week));
    const p = map.get(key(slug, prevWeek));
    const mentions = Number(c?.mentions ?? 0);
    const prev = Number(p?.mentions ?? 0);
    const analyzed = Number(c?.analyzed ?? 0);
    return {
      slug,
      mentions,
      prev,
      deltaPct: delta(mentions, prev),
      negativePct: pct(Number(c?.negative ?? 0), analyzed),
      unresolvedPct: pct(Number(c?.unresolved ?? 0), analyzed),
      painPct: pct(Number(c?.pain ?? 0), analyzed),
      avgSentiment: c?.avg_sentiment == null ? null : Number(c.avg_sentiment),
      engagement: Number(c?.engagement ?? 0),
      series: weeks.map((w) => {
        const r = map.get(key(slug, w));
        return { week: w, mentions: Number(r?.mentions ?? 0), sentiment: r?.avg_sentiment == null ? null : Number(r.avg_sentiment) };
      }),
    };
  });
}

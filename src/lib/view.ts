import { weekOptions, type Overview } from "./data";
import { weekLabel, currentWeek } from "./week";
import type { TopicRow } from "@/components/TopicsTable";

export function weekLabels() {
  return Object.fromEntries(weekOptions().map((w) => [w, weekLabel(w) + (w === currentWeek() ? " (so far)" : "")]));
}

export function topicRows(o: Pick<Overview, "summaries" | "topics">): TopicRow[] {
  return o.summaries.map((s) => {
    const t = o.topics.find((x) => x.slug === s.slug)!;
    return {
      slug: s.slug, name: t.name, origin: t.origin, mentions: s.mentions, prev: s.prev, deltaPct: s.deltaPct,
      painPct: s.painPct, negativePct: s.negativePct, unresolvedPct: s.unresolvedPct, avgSentiment: s.avgSentiment,
      series: s.series.map((x) => x.mentions), keywords: t.keywords.length,
    };
  });
}

/** A brief computed from counts, for weeks the Gemini brief hasn't covered. */
export function fallbackBrief(o: Overview, names: Record<string, string>) {
  const rising = [...o.summaries].filter((s) => s.mentions >= 3).sort((a, b) => (b.deltaPct ?? 999) - (a.deltaPct ?? 999))[0];
  const falling = [...o.summaries].filter((s) => s.prev >= 3 && (s.deltaPct ?? 0) < 0).sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0))[0];
  const top = o.summaries[0];
  const bullets: string[] = [];
  if (top) bullets.push(`${names[top.slug]} was the busiest topic with ${top.mentions} posts (${top.prev} last week).`);
  if (rising && rising.slug !== top?.slug) bullets.push(`${names[rising.slug]} grew to ${rising.mentions} posts from ${rising.prev}.`);
  if (falling) bullets.push(`${names[falling.slug]} cooled to ${falling.mentions} posts from ${falling.prev}.`);
  if (o.totals.unresolvedPct !== null) bullets.push(`${o.totals.unresolvedPct}% of analysed posts describe a problem that is still unresolved.`);
  return {
    headline: top ? `${o.totals.total} developer posts touched our problem space; ${names[top.slug].toLowerCase()} led with ${top.mentions}.` : "No posts collected for this week yet.",
    bullets,
  };
}

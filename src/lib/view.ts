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

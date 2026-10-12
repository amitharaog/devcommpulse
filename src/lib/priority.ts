import type { PainTheme } from "./types";

/**
 * Ranks this week's pain themes by how much they matter to Sumit's product (code review automation
 * for mid-size engineering teams). Relevance comes from Gemini in the weekly brief; demand comes
 * from the numbers, so the order stays explainable.
 */
export type Relevance = "high" | "medium" | "low";
export type Tier = "High" | "Medium" | "Low";
export type ThemeRating = { theme: string; relevance: Relevance; why: string };

export type Priority = {
  score: number; // 0–100
  tier: Tier;
  relevance: Relevance;
  why: string;
  changePct: number | null;
  unresolvedPct: number;
};

// Used until the weekly brief has rated a theme: how close each seeded topic sits to the product.
const TOPIC_RELEVANCE: Record<string, Relevance> = {
  "automated-review-quality": "high",
  "review-bottlenecks": "high",
  "static-analysis-linters": "high",
  "review-culture": "medium",
  "security-in-prs": "medium",
  "ci-cd-friction": "medium",
  "merge-workflow": "low",
};
const WEIGHT: Record<Relevance, number> = { high: 1, medium: 0.62, low: 0.3 };

export function isRelevance(v: unknown): v is Relevance {
  return v === "high" || v === "medium" || v === "low";
}

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

export function prioritize<T extends PainTheme>(themes: T[], ratings: ThemeRating[] = []): (T & { priority: Priority })[] {
  const rated = new Map(ratings.map((r) => [r.theme.toLowerCase(), r]));
  const maxMentions = Math.max(1, ...themes.map((t) => t.mentions));
  return themes
    .map((t) => {
      const r = rated.get(t.theme.toLowerCase());
      const relevance = r?.relevance ?? TOPIC_RELEVANCE[t.topic_slug ?? ""] ?? "medium";
      const changePct = t.prev_mentions ? Math.round(((t.mentions - t.prev_mentions) / t.prev_mentions) * 100) : null;
      const unresolvedShare = t.mentions ? t.unresolved / t.mentions : 0;
      const growth = changePct === null ? (t.mentions >= 3 ? 1 : 0.5) : clamp((changePct / 100 + 1) / 2);
      const negativity = t.avg_sentiment === null ? 0.5 : clamp(-t.avg_sentiment);
      // Demand: volume first, then how stuck people are, whether it's growing, and how upset they are.
      const demand = 0.4 * (t.mentions / maxMentions) + 0.25 * unresolvedShare + 0.2 * growth + 0.15 * negativity + (t.underserved ? 0.1 : 0);
      const score = Math.round(100 * WEIGHT[relevance] * (0.35 + 0.65 * clamp(demand)));
      const tier: Tier = score >= 65 ? "High" : score >= 40 ? "Medium" : "Low";
      return { ...t, priority: { score, tier, relevance, why: r?.why || t.summary || "", changePct, unresolvedPct: Math.round(unresolvedShare * 100) } };
    })
    .sort((a, b) => b.priority.score - a.priority.score || b.mentions - a.mentions);
}

/** Ratings saved by the weekly brief in digests.stats.priorities, if any. */
export function ratingsFrom(stats: Record<string, unknown> | null | undefined): ThemeRating[] {
  const raw = (stats as { priorities?: unknown } | null)?.priorities;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => (r && typeof r.theme === "string" && isRelevance(r.relevance) ? [{ theme: r.theme, relevance: r.relevance, why: String(r.why ?? "") }] : []));
}

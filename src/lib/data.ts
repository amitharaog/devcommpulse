import "server-only";
import { db, fetchAll } from "./supabase";
import { getTopics } from "./config";
import { addWeeks, currentWeek, isWeek, lastCompleteWeek } from "./week";
import { summarize, delta, pct, type TopicSummary } from "./stats";
import type { Digest, PainTheme, PostRow, Topic, TopicWeekStat } from "./types";

export type WeekTotals = { total: number; analyzed: number; negative: number; pain: number; unresolved: number };

async function totals(week: string): Promise<WeekTotals> {
  const { data } = await db().rpc("week_totals", { p_week: week });
  const r = (data as WeekTotals[] | null)?.[0];
  return {
    total: Number(r?.total ?? 0), analyzed: Number(r?.analyzed ?? 0), negative: Number(r?.negative ?? 0),
    pain: Number(r?.pain ?? 0), unresolved: Number(r?.unresolved ?? 0),
  };
}

export async function resolveWeek(param?: string | null): Promise<string> {
  if (isWeek(param)) return param;
  const { data } = await db().from("digests").select("week_start").order("week_start", { ascending: false }).limit(1);
  return data?.[0]?.week_start ?? lastCompleteWeek();
}

export function weekOptions(): string[] {
  const cur = currentWeek();
  return Array.from({ length: 9 }, (_, i) => addWeeks(cur, -i));
}

export async function getOverview(weekParam?: string | null) {
  const week = await resolveWeek(weekParam);
  const prevWeek = addWeeks(week, -1);
  const since = addWeeks(week, -7);
  const weeks = Array.from({ length: 8 }, (_, i) => addWeeks(since, i));

  const [topics, statRes, cur, prev, digestRes, themeRes, srcRes, runRes, pendingRes, changesRes] = await Promise.all([
    getTopics(),
    db().rpc("topic_weekly_stats", { p_since: since }),
    totals(week),
    totals(prevWeek),
    db().from("digests").select("*").eq("week_start", week).maybeSingle(),
    db().from("pain_themes").select("*").eq("week_start", week).order("mentions", { ascending: false }),
    db().rpc("source_weekly_stats", { p_since: prevWeek }),
    db().from("runs").select("stage, started_at, finished_at, ok, error").order("started_at", { ascending: false }).limit(1),
    db().from("posts").select("id", { count: "exact", head: true }).eq("analyzed", false),
    db().from("keyword_changes").select("*").gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString()).order("created_at", { ascending: false }).limit(10),
  ]);

  const active = topics.filter((t) => t.active);
  const summaries = summarize((statRes.data ?? []) as TopicWeekStat[], active.map((t) => t.slug), weeks, week, prevWeek)
    .sort((a, b) => b.mentions - a.mentions);
  const src = ((srcRes.data ?? []) as { week_start: string; source: string; mentions: number; pain: number }[]);
  const sourceNames = [...new Set(src.map((s) => s.source))];
  const sources = sourceNames.map((s) => ({
    source: s,
    mentions: Number(src.find((x) => x.source === s && x.week_start === week)?.mentions ?? 0),
    prev: Number(src.find((x) => x.source === s && x.week_start === prevWeek)?.mentions ?? 0),
    pain: Number(src.find((x) => x.source === s && x.week_start === week)?.pain ?? 0),
  })).sort((a, b) => b.mentions - a.mentions);

  return {
    week, prevWeek, weeks, isCurrent: week === currentWeek(),
    topics: active,
    summaries,
    totals: {
      ...cur,
      prev: prev.total,
      deltaPct: delta(cur.total, prev.total),
      negativePct: pct(cur.negative, cur.analyzed),
      unresolvedPct: pct(cur.unresolved, cur.analyzed),
      painPct: pct(cur.pain, cur.analyzed),
      prevNegativePct: pct(prev.negative, prev.analyzed),
    },
    digest: (digestRes.data ?? null) as Digest | null,
    themes: (themeRes.data ?? []) as PainTheme[],
    sources,
    lastRun: runRes.data?.[0] ?? null,
    pending: pendingRes.count ?? 0,
    changes: (changesRes.data ?? []) as { topic_slug: string; keyword: string; action: string; reason: string; created_at: string }[],
  };
}

export type Overview = Awaited<ReturnType<typeof getOverview>>;

const LIGHT = "id, source, url, title, score, comments, posted_at, week_start, topic_slugs, matched_keywords, answered, analyzed, relevant, sentiment, sentiment_label, is_pain, pain_point, unresolved, severity";

export async function getTopicDetail(slug: string, weekParam?: string | null, kw?: string | null) {
  const topics = await getTopics();
  const topic = topics.find((t) => t.slug === slug) as Topic | undefined;
  if (!topic) return null;
  const week = await resolveWeek(weekParam);
  const prevWeek = addWeeks(week, -1);
  const since = addWeeks(week, -7);
  const weeks = Array.from({ length: 8 }, (_, i) => addWeeks(since, i));
  const keyword = kw && topic.keywords.map((k) => k.toLowerCase()).includes(kw.toLowerCase()) ? kw.toLowerCase() : null;

  const all = await fetchAll<Omit<PostRow, "body">>((from, to) =>
    db().from("posts").select(LIGHT)
      .contains("topic_slugs", [slug])
      .gte("week_start", since).lte("week_start", week)
      .or("relevant.is.null,relevant.eq.true")
      .order("posted_at", { ascending: false })
      .range(from, to));
  const posts = keyword ? all.filter((p) => p.matched_keywords.includes(keyword)) : all;

  const series = weeks.map((w) => {
    const ps = posts.filter((p) => p.week_start === w);
    const an = ps.filter((p) => p.analyzed);
    const s = an.map((p) => p.sentiment).filter((x): x is number => x != null);
    return {
      week: w,
      mentions: ps.length,
      negativePct: pct(an.filter((p) => (p.sentiment ?? 0) < -0.2).length, an.length),
      unresolved: an.filter((p) => p.unresolved).length,
      sentiment: s.length ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 100) / 100 : null,
    };
  });
  const cur = posts.filter((p) => p.week_start === week);
  const prev = posts.filter((p) => p.week_start === prevWeek);
  const curAn = cur.filter((p) => p.analyzed);

  const kwCount = (list: typeof all, k: string) => list.filter((p) => p.matched_keywords.includes(k)).length;
  const allCur = all.filter((p) => p.week_start === week);
  const allPrev = all.filter((p) => p.week_start === prevWeek);
  const keywords = topic.keywords.map((k) => k.toLowerCase())
    .map((k) => ({ keyword: k, mentions: kwCount(allCur, k), prev: kwCount(allPrev, k) }))
    .sort((a, b) => b.mentions - a.mentions || b.prev - a.prev);

  const bySource = new Map<string, number>();
  for (const p of cur) bySource.set(p.source, (bySource.get(p.source) ?? 0) + 1);

  const painCounts = new Map<string, number>();
  for (const p of curAn) if (p.pain_point) painCounts.set(p.pain_point, (painCounts.get(p.pain_point) ?? 0) + 1);

  const [{ data: themes }, { data: cached }] = await Promise.all([
    db().from("pain_themes").select("*").eq("week_start", week).eq("topic_slug", slug).order("mentions", { ascending: false }),
    db().from("deep_dives").select("content, created_at").eq("topic_slug", slug).eq("week_start", week).eq("keyword", keyword ?? "").maybeSingle(),
  ]);

  const eng = (p: { score: number; comments: number }) => p.score + p.comments;
  return {
    topic, topics, week, prevWeek, weeks, keyword,
    stats: {
      mentions: cur.length,
      prev: prev.length,
      deltaPct: delta(cur.length, prev.length),
      negativePct: pct(curAn.filter((p) => (p.sentiment ?? 0) < -0.2).length, curAn.length),
      unresolvedPct: pct(curAn.filter((p) => p.unresolved).length, curAn.length),
      painPct: pct(curAn.filter((p) => p.is_pain).length, curAn.length),
      analyzed: curAn.length,
    },
    series,
    keywords,
    sources: [...bySource.entries()].map(([source, mentions]) => ({ source, mentions })).sort((a, b) => b.mentions - a.mentions),
    themes: (themes ?? []) as PainTheme[],
    topPainPoints: [...painCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([text, n]) => ({ text, n })),
    posts: [...cur].sort((a, b) => Number(!!b.is_pain) - Number(!!a.is_pain) || eng(b) - eng(a)).slice(0, 60),
    deepDive: cached?.content ?? null,
  };
}

export type TopicDetail = NonNullable<Awaited<ReturnType<typeof getTopicDetail>>>;
export type { TopicSummary };

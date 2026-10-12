import "server-only";
import { db, fetchAll } from "./supabase";
import { getTopics } from "./config";
import { addWeeks, currentWeek, isWeek, lastCompleteWeek } from "./week";
import { summarize, delta, pct, type TopicSummary } from "./stats";
import { sourceLabel } from "./labels";
import { callsFrom, computedHeadline, computedWatch, coverageNote, evidenceFor, headlineOk, ratingsFrom, signalHeld, themeStatsFrom, thresholds, weeksTrackedIn, type Call, type Evidence, type Thresholds } from "./decide";
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

  const [topics, statRes, cur, prev, digestRes, srcRes, runRes] = await Promise.all([
    getTopics(),
    db().rpc("topic_weekly_stats", { p_since: since }),
    totals(week),
    totals(prevWeek),
    db().from("digests").select("*").eq("week_start", week).maybeSingle(),
    db().rpc("source_weekly_stats", { p_since: prevWeek }),
    db().from("runs").select("stage, started_at, finished_at, ok, error").order("started_at", { ascending: false }).limit(1),
  ]);

  const weekTotals = await Promise.all(weeks.map((w) => (w === week ? Promise.resolve(cur) : w === prevWeek ? Promise.resolve(prev) : totals(w))));
  const kpiSeries = weeks.map((w, i) => ({ week: w, ...weekTotals[i] }));
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

  const digest = (digestRes.data ?? null) as Digest | null;
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
    digest,
    sources,
    kpiSeries,
    lastRun: runRes.data?.[0] ?? null,
  };
}

export type Overview = Awaited<ReturnType<typeof getOverview>>;

/**
 * Everything the calls for one week rest on: that week's pain themes and the 8-week window around them, the
 * stored brief (fit ratings, exact blocking/thread counts, Gemini's validated calls) and the totals that set
 * the evidence thresholds. Shared by the Overview memo and the Pain points page so they always agree.
 */
async function weekEvidence(week: string) {
  const prevWeek = addWeeks(week, -1);
  const since = addWeeks(week, -7);
  const weeks = Array.from({ length: 8 }, (_, i) => addWeeks(since, i));
  const [cur, prev, digestRes, prevDigestRes, themeRes] = await Promise.all([
    totals(week),
    totals(prevWeek),
    db().from("digests").select("*").eq("week_start", week).maybeSingle(),
    db().from("digests").select("stats").eq("week_start", prevWeek).maybeSingle(),
    db().from("pain_themes").select("*").gte("week_start", since).lte("week_start", week),
  ]);
  const all = (themeRes.data ?? []) as PainTheme[];
  const themes = all.filter((t) => t.week_start === week);
  const digest = (digestRes.data ?? null) as Digest | null;
  // Judge stored calls by the thresholds they were made with; analysis that finishes later must not silently re-grade them.
  const saved = (digest?.stats as { thresholds?: { pain_total?: number; min_strong?: number; min_moderate?: number } } | undefined)?.thresholds;
  const th: Thresholds = saved && Number.isFinite(saved.min_strong) && Number.isFinite(saved.min_moderate)
    ? { painTotal: Number(saved.pain_total) || cur.pain, minStrong: Number(saved.min_strong), minModerate: Number(saved.min_moderate) }
    : thresholds(cur.pain);
  const history = all.filter((t) => t.week_start !== week);
  const evs = evidenceFor({
    week, weeks, themes, th, prevTotal: prev.total,
    history,
    ratings: ratingsFrom(digest?.stats), themeStats: themeStatsFrom(digest?.stats),
  });
  const { calls, source, stored } = callsFrom(digest?.stats, evs, week);
  const prevStats = prevDigestRes.data?.stats as { calls_version?: number; calls?: unknown } | undefined;
  // Until this week is clustered there is nothing to compare last week's calls with.
  const held = themes.length && prevStats?.calls_version === 1 ? signalHeld(prevStats.calls, themes, th) : [];
  const weeksTracked = Math.min(8, weeksTrackedIn({ week, weeks, history, prevTotal: prev.total }).filter(Boolean).length);
  return { week, prevWeek, weeks, cur, prev, digest, all, themes, th, evs, calls, callsSource: source, stored, held, weeksTracked };
}

/** The Overview: this week's calls, the Monday question, what's on the radar and how sure we are. */
export async function getBrief(weekParam?: string | null) {
  const week = await resolveWeek(weekParam);
  const [ev, topics, { data: srcRows }, { data: srcs }, { data: runs }] = await Promise.all([
    weekEvidence(week),
    getTopics(),
    db().rpc("source_weekly_stats", { p_since: week }),
    db().from("sources").select("id, name, enabled"),
    db().from("runs").select("stage, started_at, ok, error").order("started_at", { ascending: false }).limit(1),
  ]);
  const { cur, prev, digest, calls, callsSource, stored } = ev;
  const bySource = new Map<string, number>();
  for (const r of (srcRows ?? []) as { week_start: string; source: string; mentions: number }[]) {
    if (r.week_start !== week) continue;
    // Stack Overflow and other Stack Exchange sites are one collector.
    const id = r.source === "stackoverflow" ? "stackexchange" : r.source;
    bySource.set(id, (bySource.get(id) ?? 0) + Number(r.mentions));
  }
  const sources = [...bySource.entries()].map(([source, mentions]) => ({ source, mentions })).filter((s) => s.mentions > 0);
  const silent = ((srcs ?? []) as { id: string; enabled: boolean }[]).filter((s) => s.enabled && !bySource.get(s.id)).map((s) => sourceLabel(s.id));

  // Text the brief wrote is used only when its calls survived and it is about call #1; otherwise it is computed, so they never disagree.
  const storedFirst = (digest?.stats as { calls?: { theme?: string; verb?: string }[] } | undefined)?.calls?.[0];
  const fromBrief = stored && !!digest && !!calls[0] && storedFirst?.theme === calls[0].theme && storedFirst?.verb === calls[0].verb;
  const aboutFirst = (s: string | null | undefined) => !!s && headlineOk(s, calls, null);
  const headline = (fromBrief && aboutFirst(digest!.headline) ? digest!.headline : computedHeadline(calls))
    ?? (ev.themes.length ? `No theme has enough evidence for a call this week; ${cur.pain} pain posts read.` : digest?.headline ?? `${cur.total} developer posts collected so far this week.`);
  const watch = fromBrief && aboutFirst(digest!.watch) ? digest!.watch : computedWatch(calls);
  const dec = (digest?.stats as { decision?: { lean?: string; because?: string } | null } | undefined)?.decision;
  const decision = fromBrief && watch === digest!.watch && callsSource === "gemini" && dec && (dec.lean === "yes" || dec.lean === "no") && dec.because ? { lean: dec.lean, because: dec.because } : null;
  const called = new Set(calls.map((c) => c.theme));
  const radar = ev.evs.filter((e) => !called.has(e.theme) && e.n > 0).slice(0, 4);
  const evidenceOf = (c: Call) => ev.evs.find((e) => e.theme === c.theme) as Evidence;

  return {
    week, prevWeek: ev.prevWeek, weeks: ev.weeks, isCurrent: week === currentWeek(),
    totals: cur, prevTotals: prev,
    names: Object.fromEntries(topics.map((t) => [t.slug, t.name])) as Record<string, string>,
    digest, calls: calls.map((c) => ({ call: c, evidence: evidenceOf(c) })), callsSource, headline, watch, decision,
    radar, held: ev.held, themeCount: ev.evs.filter((e) => e.n > 0).length, hasThemes: ev.themes.length > 0,
    weeksTracked: ev.weeksTracked, th: ev.th,
    communities: sources.length,
    coverage: coverageNote({ total: cur.total, analyzed: cur.analyzed, sources, silent, weeksTracked: ev.weeksTracked, label: sourceLabel }),
    lastRun: (runs?.[0] ?? null) as { stage: string; started_at: string; ok: boolean | null; error: string | null } | null,
    threadsKnown: themeStatsFrom(digest?.stats) != null,
  };
}
export type Brief = Awaited<ReturnType<typeof getBrief>>;

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
    posts: [...cur].sort((a, b) => Number(!!b.is_pain) - Number(!!a.is_pain) || eng(b) - eng(a)).slice(0, 400),
    deepDive: cached?.content ?? null,
  };
}

export type TopicDetail = NonNullable<Awaited<ReturnType<typeof getTopicDetail>>>;
export type { TopicSummary };


/** Per-community volumes for the Sources page, plus the latest collection result per source. */
export async function getSourcesPage(weekParam?: string | null) {
  const week = await resolveWeek(weekParam);
  const prevWeek = addWeeks(week, -1);
  const since = addWeeks(week, -7);
  const weeks = Array.from({ length: 8 }, (_, i) => addWeeks(since, i));
  const [{ data: rows }, { data: srcs }, { data: runs }] = await Promise.all([
    db().rpc("source_weekly_stats", { p_since: since }),
    db().from("sources").select("*").order("id"),
    db().from("runs").select("started_at, ok, stats, error").eq("stage", "collect").order("started_at", { ascending: false }).limit(1),
  ]);
  const r = (rows ?? []) as { week_start: string; source: string; mentions: number; pain: number }[];
  const lastCollect = runs?.[0] ?? null;
  const perSource = ((lastCollect?.stats as { perSource?: Record<string, { fetched: number; kept: number; error?: string }> } | null)?.perSource) ?? {};
  const ids = [...new Set(r.map((x) => x.source))];
  const series = weeks.map((w) => ({ week: w, ...Object.fromEntries(ids.map((id) => [id, Number(r.find((x) => x.source === id && x.week_start === w)?.mentions ?? 0)])) }));
  const stat = (id: string, w: string) => r.find((x) => x.source === id && x.week_start === w);
  const bySource = ids.map((id) => {
    const c = stat(id, week), p = stat(id, prevWeek);
    return {
      id, mentions: Number(c?.mentions ?? 0), prev: Number(p?.mentions ?? 0), pain: Number(c?.pain ?? 0),
      deltaPct: delta(Number(c?.mentions ?? 0), Number(p?.mentions ?? 0)),
      painPct: pct(Number(c?.pain ?? 0), Number(c?.mentions ?? 0)),
      spark: weeks.map((w) => Number(stat(id, w)?.mentions ?? 0)),
    };
  }).sort((a, b) => b.mentions - a.mentions);
  return { week, prevWeek, weeks, series, ids, bySource, sources: (srcs ?? []) as { id: string; name: string; enabled: boolean }[], perSource, lastCollect };
}

/** Pain themes ranked by the same evidence as the Overview's calls, with 8-week history and the raw phrases behind them. */
export async function getPainPage(weekParam?: string | null) {
  const week = await resolveWeek(weekParam);
  const [ev, topics, phrases] = await Promise.all([
    weekEvidence(week),
    getTopics(),
    fetchAll<{ pain_point: string; topic_slugs: string[]; unresolved: boolean | null; severity: number | null }>((from, to) =>
      db().from("posts").select("pain_point, topic_slugs, unresolved, severity").eq("week_start", week).eq("is_pain", true)
        .not("pain_point", "is", null).or("relevant.is.null,relevant.eq.true").range(from, to)),
  ]);
  const verbOf = new Map(ev.calls.map((c) => [c.theme, c.verb]));
  const themes = ev.evs.map((e) => {
    const t = ev.themes.find((x) => x.theme === e.theme)!;
    return {
      ...e, theme_row: t, call: verbOf.get(e.theme) ?? null,
      history: ev.weeks.map((w) => {
        if (w === week) return e.n;
        const h = ev.all.find((x) => x.week_start === w && x.theme.toLowerCase() === e.theme.toLowerCase());
        return w === ev.prevWeek && !h ? e.p : h?.mentions ?? 0;
      }),
    };
  });
  const map = new Map<string, { n: number; unresolved: number; severe: number; topics: Map<string, number> }>();
  for (const p of phrases) {
    const g = map.get(p.pain_point) ?? { n: 0, unresolved: 0, severe: 0, topics: new Map() };
    g.n++; if (p.unresolved) g.unresolved++; if ((p.severity ?? 0) >= 3) g.severe++;
    for (const t of p.topic_slugs) g.topics.set(t, (g.topics.get(t) ?? 0) + 1);
    map.set(p.pain_point, g);
  }
  const phraseRows = [...map.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25).map(([text, g]) => ({
    text, n: g.n, unresolved: g.unresolved, severe: g.severe, topic: [...g.topics.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  }));
  return { week, weeks: ev.weeks, topics, themes, phrases: phraseRows, totalPain: phrases.length, th: ev.th, weeksTracked: ev.weeksTracked, threadsKnown: themeStatsFrom(ev.digest?.stats) != null };
}

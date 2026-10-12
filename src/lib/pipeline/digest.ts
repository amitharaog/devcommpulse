import "server-only";
import { db, fetchAll } from "../supabase";
import { getTopics } from "../config";
import { geminiJSON, currentModel } from "../gemini";
import { addWeeks, lastCompleteWeek, weekLabel } from "../week";
import { summarize, pct, delta } from "../stats";
import { slugify } from "../match";
import { deliverBrief } from "../notify";
import { isRelevance, type ThemeRating } from "../priority";
import type { TopicWeekStat } from "../types";

const SYSTEM = `You write a weekly product-intelligence brief for Sumit, the only PM at a 15-person startup selling a code review automation tool to mid-size engineering teams.
Plain words. Concrete numbers. No hype, no jargon, no emojis. Output JSON only.`;

type PainRow = {
  id: string; week_start: string; topic_slugs: string[]; pain_point: string; unresolved: boolean | null;
  sentiment: number | null; score: number; comments: number;
};

type ThemeOut = { name: string; topic: string; posts: number[]; summary: string; underserved: boolean; relevance: string; why: string };

export async function digest(opts: { week?: string; notify?: boolean } = {}) {
  const week = opts.week ?? lastCompleteWeek();
  const prevWeek = addWeeks(week, -1);
  const since = addWeeks(week, -7);
  const weeks = Array.from({ length: 8 }, (_, i) => addWeeks(since, i));
  const topics = await getTopics({ activeOnly: true });
  const slugs = topics.map((t) => t.slug);

  const { data: statRows, error } = await db().rpc("topic_weekly_stats", { p_since: since });
  if (error) throw new Error(error.message);
  const summaries = summarize((statRows ?? []) as TopicWeekStat[], slugs, weeks, week, prevWeek);
  const { data: srcRows } = await db().rpc("source_weekly_stats", { p_since: prevWeek });
  const sources = (srcRows ?? []) as { week_start: string; source: string; mentions: number; pain: number }[];
  const totalCur = sources.filter((s) => s.week_start === week).reduce((a, s) => a + Number(s.mentions), 0);
  const totalPrev = sources.filter((s) => s.week_start === prevWeek).reduce((a, s) => a + Number(s.mentions), 0);

  // ---------- 1. Cluster pain points from this week and last week into named themes ----------
  const pains = await fetchAll<PainRow>((from, to) =>
    db().from("posts")
      .select("id, week_start, topic_slugs, pain_point, unresolved, sentiment, score, comments")
      .in("week_start", [week, prevWeek]).eq("is_pain", true).not("pain_point", "is", null)
      .or("relevant.is.null,relevant.eq.true")
      .range(from, to));
  const eng = (p: PainRow) => p.score + p.comments;

  // Gemini already normalised each post's pain point into a short phrase, so we cluster the unique
  // phrases (with their counts) rather than individual posts. Counts stay exact at any volume.
  const byPhrase = new Map<string, { cur: PainRow[]; prev: PainRow[]; topics: Map<string, number> }>();
  for (const p of pains) {
    const k = p.pain_point.trim().toLowerCase();
    if (!k) continue;
    const g = byPhrase.get(k) ?? { cur: [], prev: [], topics: new Map() };
    (p.week_start === week ? g.cur : g.prev).push(p);
    for (const t of p.topic_slugs) g.topics.set(t, (g.topics.get(t) ?? 0) + 1);
    byPhrase.set(k, g);
  }
  const phrases = [...byPhrase.entries()]
    .sort((a, b) => b[1].cur.length + b[1].prev.length - (a[1].cur.length + a[1].prev.length))
    .slice(0, 600);
  const topTopic = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";

  const { data: priorThemes } = await db().from("pain_themes").select("theme").eq("week_start", prevWeek);
  let ratings: ThemeRating[] = [];
  let themes: { theme: string; topic_slug: string | null; mentions: number; prev_mentions: number; unresolved: number; avg_sentiment: number | null; underserved: boolean; summary: string; example_ids: string[] }[] = [];

  if (phrases.length >= 2) {
    const lines = phrases.map(([text, g], i) => `${i}|${topTopic(g.topics)}|${text}|${g.cur.length}|${g.prev.length}|${g.cur.filter((p) => p.unresolved).length}`).join("\n");
    const out = await geminiJSON<{ themes: ThemeOut[] }>(
      `Group these developer pain-point phrases into 5–12 recurring themes. Each line is "index|topic|phrase|posts this week|posts last week|unresolved this week".
${priorThemes?.length ? `Last week's theme names (reuse a name exactly when it is the same problem): ${priorThemes.map((t) => t.theme).join("; ")}\n` : ""}
Rules:
- name: 3–7 plain words a PM would say out loud (e.g. "Review bots flag too many false positives")
- topic: the best matching slug from: ${slugs.join(", ")}
- posts: every phrase index that belongs to the theme (each index in at most one theme; leave out one-off noise)
- summary: one sentence on what developers are struggling with
- underserved: true when people say existing tools don't solve it or it keeps going unresolved
- relevance: how directly Sumit's code review automation product could address it: "high" (core to automated code review), "medium" (adjacent, e.g. CI or review process), "low" (outside the product)
- why: one sentence, max 18 words, on why it matters (or not) for Sumit's product
Return {"themes":[{"name":"","topic":"","posts":[0],"summary":"","underserved":false,"relevance":"medium","why":""}]}

${lines}`,
      { system: SYSTEM, maxOutputTokens: 8192 },
    );
    const used = new Set<number>();
    themes = (out.themes ?? []).map((t) => {
      const members = (t.posts ?? []).filter((i) => Number.isInteger(i) && phrases[i] && !used.has(i));
      members.forEach((i) => used.add(i));
      const cur = members.flatMap((i) => phrases[i][1].cur);
      const prev = members.flatMap((i) => phrases[i][1].prev);
      const sents = cur.map((p) => p.sentiment).filter((x): x is number => x != null);
      return {
        theme: String(t.name).trim().slice(0, 120),
        topic_slug: slugs.includes(t.topic) ? t.topic : cur[0]?.topic_slugs[0] ?? null,
        mentions: cur.length,
        prev_mentions: prev.length,
        unresolved: cur.filter((p) => p.unresolved).length,
        avg_sentiment: sents.length ? sents.reduce((a, b) => a + b, 0) / sents.length : null,
        underserved: !!t.underserved,
        summary: String(t.summary ?? "").slice(0, 400),
        example_ids: [...cur].sort((a, b) => eng(b) - eng(a)).slice(0, 6).map((p) => p.id),
      };
    }).filter((t) => t.theme && (t.mentions > 0 || t.prev_mentions > 0))
      .sort((a, b) => b.mentions - a.mentions);

    const seen = new Set<string>();
    themes = themes.filter((t) => (seen.has(t.theme.toLowerCase()) ? false : (seen.add(t.theme.toLowerCase()), true)));
    const kept = new Set(themes.map((t) => t.theme.toLowerCase()));
    ratings = (out.themes ?? []).flatMap((t) => {
      const theme = String(t.name).trim().slice(0, 120);
      return kept.has(theme.toLowerCase()) && isRelevance(t.relevance) ? [{ theme, relevance: t.relevance, why: String(t.why ?? "").slice(0, 200) }] : [];
    });
    await db().from("pain_themes").delete().eq("week_start", week);
    if (themes.length) {
      const { error: e } = await db().from("pain_themes").insert(themes.map((t) => ({ ...t, week_start: week })));
      if (e) throw new Error(e.message);
    }
  }

  // ---------- 2. Write the brief and propose keyword/topic updates ----------
  const topicTable = summaries.map((s) => {
    const t = topics.find((x) => x.slug === s.slug)!;
    return { slug: s.slug, name: t.name, mentions: s.mentions, last_week: s.prev, change_pct: s.deltaPct, negative_pct: s.negativePct, unresolved_pct: s.unresolvedPct, keywords: t.keywords };
  });
  const brief = await geminiJSON<{
    headline: string; bullets: string[]; watch: string;
    new_keywords: { topic_slug: string; keyword: string; reason: string }[];
    new_topic: null | { name: string; description: string; keywords: string[]; reason: string };
  }>(
    `Week: ${weekLabel(week)} (compared with ${weekLabel(prevWeek)}).
Posts matched across Stack Overflow, Stack Exchange, Reddit, Hacker News, DEV, Lobsters and devRant: ${totalCur} this week vs ${totalPrev} last week.

Topics (counts are posts; change_pct null means it was zero last week):
${JSON.stringify(topicTable)}

Pain themes this week (mentions, last week, unresolved, underserved):
${JSON.stringify(themes.map((t) => ({ theme: t.theme, topic: t.topic_slug, mentions: t.mentions, last_week: t.prev_mentions, unresolved: t.unresolved, underserved: t.underserved })))}

Write:
- headline: the single most important shift this week, max 16 words, includes a number
- bullets: 3–5 bullets, max 28 words each, every bullet has a number; cover what is rising, what is falling, and what looks unresolved or underserved
- watch: one question Sumit should raise in Monday sprint planning, max 25 words
- new_keywords: up to 5 short phrases (1–3 words) developers actually used this week that would catch more relevant posts and are NOT already in a topic's keywords; attach each to an existing topic slug, with a short reason
- new_topic: only if a theme with 5+ mentions fits none of the topics, else null
Return {"headline":"","bullets":[],"watch":"","new_keywords":[],"new_topic":null}`,
    { system: SYSTEM, maxOutputTokens: 4096 },
  );

  // ---------- 3. Apply keyword/topic updates to Supabase ----------
  const changes: string[] = [];
  const existingKw = new Set(topics.flatMap((t) => t.keywords.map((k) => k.toLowerCase())));
  const cleanKw = (k: string) => String(k ?? "").toLowerCase().replace(/[^a-z0-9.+#\- ]/g, "").replace(/\s+/g, " ").trim();
  for (const nk of (brief.new_keywords ?? []).slice(0, 5)) {
    const kw = cleanKw(nk.keyword);
    const topic = topics.find((t) => t.slug === nk.topic_slug);
    if (!topic || kw.length < 3 || kw.length > 40 || kw.split(" ").length > 4 || existingKw.has(kw)) continue;
    existingKw.add(kw);
    topic.keywords = [...topic.keywords, kw];
    await db().from("topics").update({ keywords: topic.keywords, updated_at: new Date().toISOString() }).eq("slug", topic.slug);
    await db().from("keyword_changes").insert({ topic_slug: topic.slug, keyword: kw, action: "added_keyword", reason: String(nk.reason ?? "").slice(0, 300) });
    await db().rpc("retag_keyword", { p_slug: topic.slug, p_keyword: kw, p_since: since });
    changes.push(`+ "${kw}" → ${topic.slug}`);
  }
  if (brief.new_topic?.name) {
    const slug = slugify(brief.new_topic.name);
    const kws = [...new Set((brief.new_topic.keywords ?? []).map(cleanKw).filter((k) => k.length >= 3 && !existingKw.has(k)))].slice(0, 8);
    if (slug && kws.length && !topics.some((t) => t.slug === slug)) {
      const { error: e } = await db().from("topics").insert({ slug, name: brief.new_topic.name.slice(0, 80), description: String(brief.new_topic.description ?? "").slice(0, 300), keywords: kws, origin: "ai" });
      if (!e) {
        await db().from("keyword_changes").insert({ topic_slug: slug, keyword: kws.join(", "), action: "added_topic", reason: String(brief.new_topic.reason ?? "").slice(0, 300) });
        for (const k of kws) await db().rpc("retag_keyword", { p_slug: slug, p_keyword: k, p_since: since });
        changes.push(`+ topic ${slug}`);
      }
    }
  }

  // ---------- 4. Save and deliver ----------
  const bullets = (brief.bullets ?? []).map(String).filter(Boolean).slice(0, 5);
  const headline = String(brief.headline || `${totalCur} posts matched this week`).slice(0, 200);
  const { data: tot } = await db().rpc("week_totals", { p_week: week });
  const t0 = (tot as { analyzed: number; negative: number; unresolved: number }[] | null)?.[0];
  const stats = {
    total: totalCur, prev_total: totalPrev, change_pct: delta(totalCur, totalPrev),
    negative_pct: t0 ? pct(Number(t0.negative), Number(t0.analyzed)) : null,
    unresolved_pct: t0 ? pct(Number(t0.unresolved), Number(t0.analyzed)) : null,
    model: currentModel(), changes, priorities: ratings,
  };
  const { error: de } = await db().from("digests").upsert({ week_start: week, headline, bullets, watch: brief.watch ?? null, stats, generated_at: new Date().toISOString() });
  if (de) throw new Error(de.message);

  let delivered: string[] = [];
  if (opts.notify) {
    const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
    delivered = await deliverBrief({ weekLabel: weekLabel(week), headline, bullets, watch: brief.watch, url: `${base}/?week=${week}` });
  }
  return { week, headline, themes: themes.length, changes, delivered, model: currentModel() };
}

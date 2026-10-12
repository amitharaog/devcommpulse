import "server-only";
import { db, fetchAll } from "../supabase";
import { getTopics } from "../config";
import { geminiJSON, currentModel } from "../gemini";
import { addWeeks, lastCompleteWeek, weekLabel } from "../week";
import { summarize, pct, delta } from "../stats";
import { slugify } from "../match";
import { deliverBrief } from "../notify";
import {
  allowedNumbers, checkText, computedCalls, computedHeadline, computedWatch, enforceMessageQuotes, evidenceFor, headlineOk,
  isRelevance, thresholds, threadKey, validateCalls, verifyQuote, STRENGTH_LABEL,
  type Call, type ThemeRating, type ThemeStat,
} from "../decide";
import type { PainTheme, TopicWeekStat } from "../types";

const SYSTEM = `You write a weekly product-intelligence brief for Sumit, the only PM at a 15-person startup selling a code review automation tool to mid-size engineering teams.
Plain words. Concrete numbers. No hype, no jargon, no emojis. Output JSON only.`;

type PainRow = {
  id: string; week_start: string; topic_slugs: string[]; pain_point: string; unresolved: boolean | null;
  sentiment: number | null; score: number; comments: number; severity: number | null; source: string; title: string;
};

type ThemeOut = { name: string; topic: string; posts: number[]; summary: string; underserved: boolean; relevance: string; why: string };
type Totals = { total: number; analyzed: number; negative: number; pain: number; unresolved: number };

async function weekTotals(week: string): Promise<Totals> {
  const { data } = await db().rpc("week_totals", { p_week: week });
  const r = (data as Totals[] | null)?.[0];
  return { total: Number(r?.total ?? 0), analyzed: Number(r?.analyzed ?? 0), negative: Number(r?.negative ?? 0), pain: Number(r?.pain ?? 0), unresolved: Number(r?.unresolved ?? 0) };
}

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
      .select("id, week_start, topic_slugs, pain_point, unresolved, sentiment, score, comments, severity, source, title")
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
  let themeStats: ThemeStat[] = [];
  let themes: (Omit<PainTheme, "week_start" | "summary"> & { summary: string })[] = [];

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
    const built = (out.themes ?? []).map((t) => {
      const members = (t.posts ?? []).filter((i) => Number.isInteger(i) && phrases[i] && !used.has(i));
      members.forEach((i) => used.add(i));
      const cur = members.flatMap((i) => phrases[i][1].cur);
      const prev = members.flatMap((i) => phrases[i][1].prev);
      const sents = cur.map((p) => p.sentiment).filter((x): x is number => x != null);
      const name = String(t.name).trim().slice(0, 120);
      const communities: Record<string, number> = {};
      for (const p of cur) communities[p.source] = (communities[p.source] ?? 0) + 1;
      return {
        row: {
          theme: name,
          topic_slug: slugs.includes(t.topic) ? t.topic : cur[0]?.topic_slugs[0] ?? null,
          mentions: cur.length,
          prev_mentions: prev.length,
          unresolved: cur.filter((p) => p.unresolved).length,
          avg_sentiment: sents.length ? sents.reduce((a, b) => a + b, 0) / sents.length : null,
          underserved: !!t.underserved,
          summary: String(t.summary ?? "").slice(0, 400),
          example_ids: [...cur].sort((a, b) => eng(b) - eng(a)).slice(0, 6).map((p) => p.id),
        },
        rating: isRelevance(t.relevance) ? { theme: name, relevance: t.relevance, why: String(t.why ?? "").slice(0, 200) } : null,
        // Exact counts the calls rely on: posts that block work, and separate threads (HN comments on one story are one thread).
        stat: { theme: name, blocking: cur.filter((p) => p.severity === 3).length, threads: new Set(cur.map(threadKey)).size, communities, engagement: cur.reduce((a, p) => a + eng(p), 0) },
      };
    }).filter((x) => x.row.theme && (x.row.mentions > 0 || x.row.prev_mentions > 0))
      .sort((a, b) => b.row.mentions - a.row.mentions);

    const seen = new Set<string>();
    const unique = built.filter((x) => (seen.has(x.row.theme.toLowerCase()) ? false : (seen.add(x.row.theme.toLowerCase()), true)));
    themes = unique.map((x) => x.row);
    ratings = unique.flatMap((x) => (x.rating ? [x.rating] : []));
    themeStats = unique.map((x) => x.stat);
    await db().from("pain_themes").delete().eq("week_start", week);
    if (themes.length) {
      const { error: e } = await db().from("pain_themes").insert(themes.map((t) => ({ ...t, week_start: week })));
      if (e) throw new Error(e.message);
    }
  }

  // ---------- 2. Evidence: which calls each theme has earned (decided in code, not by Gemini) ----------
  const [cur, prev, { data: historyRows }] = await Promise.all([
    weekTotals(week),
    weekTotals(prevWeek),
    db().from("pain_themes").select("week_start, theme, topic_slug, mentions").gte("week_start", since).lt("week_start", week),
  ]);
  const th = thresholds(cur.pain);
  const evs = evidenceFor({
    week, weeks, th, ratings, themeStats, prevTotal: prev.total,
    themes: themes.map((t) => ({ ...t, week_start: week })),
    history: (historyRows ?? []) as Pick<PainTheme, "week_start" | "theme" | "topic_slug" | "mentions">[],
  });
  const evidenceTable = evs.filter((e) => e.n > 0).map((e, i) => ({
    id: i + 1, theme: e.theme, topic: e.topic_slug, fit: e.fit, posts: e.n, last_week: e.p, unresolved: e.u,
    unresolved_pct: Math.round(e.share * 100), blocking: e.blocking, weeks_seen: e.weeksSeen, weeks_tracked: e.weeksTracked,
    threads: e.threads, tools_dont_solve_it: e.underserved, strength: e.strength, allowed: e.allowed,
  }));

  // ---------- 3. Write the calls and the brief, and propose keyword/topic updates ----------
  const topicTable = summaries.map((s) => {
    const t = topics.find((x) => x.slug === s.slug)!;
    return { slug: s.slug, name: t.name, mentions: s.mentions, last_week: s.prev, change_pct: s.deltaPct, negative_pct: s.negativePct, unresolved_pct: s.unresolvedPct, keywords: t.keywords };
  });
  const brief = await geminiJSON<{
    calls: unknown[]; headline: string; watch: string; lean: string; because: string; bullets: string[];
    new_keywords: { topic_slug: string; keyword: string; reason: string }[];
    new_topic: null | { name: string; description: string; keywords: string[]; reason: string };
  }>(
    `Week: ${weekLabel(week)} (compared with ${weekLabel(prevWeek)}).
Posts matched across Stack Overflow, Stack Exchange, Reddit, Hacker News, DEV, Lobsters and devRant: ${totalCur} this week vs ${totalPrev} last week.

Topics (counts are posts; change_pct null means it was zero last week):
${JSON.stringify(topicTable)}

Evidence table: one row per pain theme this week. "allowed" lists the only calls the evidence supports for that theme (decided by rules, not by you). fit is how close it is to the product; strength is ${Object.values(STRENGTH_LABEL).join(" / ").toLowerCase()}; blocking is posts saying it blocks work (null = unknown); threads are separate discussions.
${JSON.stringify(evidenceTable)}

Write, in this order:
- calls: 1–3 decisions for Sumit this week, best first. Use only themes from the evidence table and only a verb listed in that row's "allowed". At most 2 build, 1 message, 1 ignore. Prefer one build, one investigate or message, and one ignore when allowed. Never call a row whose allowed list is empty.
  theme: the theme name copied exactly
  verb: "build" | "investigate" | "message" | "ignore". message means the pain is about trust or perception and is best answered with proof in sales and marketing, not new engineering.
  title: 4–10 words saying WHAT to do (e.g. "Reviewer aid that splits large AI-generated PRs"); do not start with the verb
  why: max 25 words; cite at least one number from that row
  next_step: max 20 words; one action that can start this week, naming who does it (Sumit, engineering or sales)
  pitch: for build and message only, max 20 words, a line sales could say, in developers' own terms; otherwise ""
  ask_who: for build and investigate only, max 14 words, the kind of customer to interview (role, team size, stack), never a name; otherwise ""
  ask_question: for build and investigate only, one open, non-leading question about their last real experience, max 18 words, ending with "?"; otherwise ""
  metric: for build only, max 14 words, one in-product signal that would show the fix worked; otherwise ""
  revisit_if: for ignore only, max 15 words, a measurable condition in posts, weeks or unresolved; otherwise ""
- headline: one sentence, max 16 words, about the first call, with exactly one number from its row; do not copy its title
- watch: one yes/no question about the first call for Monday sprint planning, max 25 words
- lean: "yes" | "no" | "unsure": what the evidence suggests for the watch question
- because: max 18 words, containing one number from the evidence table
- bullets: 3–5 bullets, max 28 words each, every bullet has a number; cover what is rising, what is falling, and what looks unresolved or underserved
- new_keywords: up to 5 short phrases (1–3 words) developers actually used this week that would catch more relevant posts and are NOT already in a topic's keywords; attach each to an existing topic slug, with a short reason
- new_topic: only if a theme with 5+ mentions fits none of the topics, else null
Rules for all text: use only numbers that appear in the input; no money, prices, revenue, ROI, market size, dates or superlatives; no emojis; plain words.
Return {"calls":[{"theme":"","verb":"build","title":"","why":"","next_step":"","pitch":"","ask_who":"","ask_question":"","metric":"","revisit_if":""}],"headline":"","watch":"","lean":"unsure","because":"","bullets":[],"new_keywords":[],"new_topic":null}`,
    { system: SYSTEM, maxOutputTokens: 6144 },
  );

  // ---------- 4. Validate Gemini's calls against the evidence; fall back to calls computed from counts ----------
  const nums = allowedNumbers({ evidence: evidenceTable, topics: topicTable, totals: [totalCur, totalPrev] }, evs);
  let calls: Call[] = validateCalls(brief.calls, evs, nums, week);
  let callsSource: "gemini" | "computed" = "gemini";
  if (!calls.length) { calls = computedCalls(evs, week); callsSource = "computed"; }
  calls = enforceMessageQuotes(await withQuotes(calls, evs.map((e) => ({ theme: e.theme, ids: e.example_ids }))), evs, week);
  if (!calls.length && callsSource === "gemini") { calls = computedCalls(evs, week); callsSource = "computed"; }

  const h = String(brief.headline ?? "").trim();
  const headline = (headlineOk(h, calls[0], nums) ? h : computedHeadline(calls))
    ?? (h && checkText(h, nums) ? h : themes.length ? `No theme has enough evidence for a call this week; ${cur.pain} pain posts read.` : `${totalCur} posts matched this week.`);
  const w = String(brief.watch ?? "").trim();
  const watch = calls.length ? (w && checkText(w, nums) && callsSource === "gemini" ? w : computedWatch(calls)) : null;
  const because = String(brief.because ?? "").trim();
  const decision = callsSource === "gemini" && (brief.lean === "yes" || brief.lean === "no") && because && checkText(because, nums) && hasNumber(because)
    ? { lean: brief.lean, because: because.slice(0, 160) } : null;
  const bullets = (brief.bullets ?? []).map((b) => String(b).trim()).filter((b) => b && checkText(b, nums)).slice(0, 5);

  // ---------- 5. Apply keyword/topic updates to Supabase ----------
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

  // ---------- 6. Save and deliver ----------
  const stats = {
    total: totalCur, prev_total: totalPrev, change_pct: delta(totalCur, totalPrev),
    negative_pct: pct(cur.negative, cur.analyzed), unresolved_pct: pct(cur.unresolved, cur.analyzed),
    model: currentModel(), changes, priorities: ratings,
    calls_version: 1, calls_source: callsSource, calls, decision, theme_stats: themeStats,
    thresholds: { pain_total: th.painTotal, min_strong: th.minStrong, min_moderate: th.minModerate },
  };
  const { error: de } = await db().from("digests").upsert({ week_start: week, headline: headline.slice(0, 200), bullets, watch, stats, generated_at: new Date().toISOString() });
  if (de) throw new Error(de.message);

  let delivered: string[] = [];
  if (opts.notify) {
    const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
    delivered = await deliverBrief({ weekLabel: weekLabel(week), headline, bullets, watch, decision, calls, url: `${base}/?week=${week}` });
  }
  return { week, headline, themes: themes.length, calls: calls.map((c) => `${c.verb}: ${c.title}`), callsSource, changes, delivered, model: currentModel() };
}

const hasNumber = (s: string) => /\d/.test(s);

/**
 * One optional Gemini call: a verbatim developer quote per call (not for ignore), checked word for word against
 * the post. A failure only means no quotes, never a failed brief. Authors are never sent.
 */
async function withQuotes(calls: Call[], examples: { theme: string; ids: string[] }[]): Promise<Call[]> {
  const wanted = calls.filter((c) => c.verb !== "ignore").map((c) => ({ call: c, ids: (examples.find((x) => x.theme === c.theme)?.ids ?? []).slice(0, 6) }))
    .filter((x) => x.ids.length);
  if (!wanted.length) return calls;
  try {
    const { data } = await db().from("posts").select("id, source, url, title, body").in("id", wanted.flatMap((x) => x.ids).slice(0, 18));
    const posts = (data ?? []) as { id: string; source: string; url: string; title: string; body: string | null }[];
    const input = wanted.map((x) => ({
      theme: x.call.theme,
      posts: x.ids.map((id) => posts.find((p) => p.id === id)).filter((p) => !!p).map((p, i) => ({ i, id: p!.id, source: p!.source, title: p!.title.slice(0, 160), text: (p!.body ?? "").slice(0, 500) })),
    })).filter((x) => x.posts.length);
    if (!input.length) return calls;
    const out = await geminiJSON<{ quotes: { theme: string; post: number; quote: string }[] }>(
      `For each theme, pick the single most telling post and copy one exact, contiguous quote of 8–30 words that shows the pain. Copy it character for character: do not paraphrase, shorten with ellipses or fix typos. Return {"quotes":[{"theme":"","post":0,"quote":""}]}

${JSON.stringify(input.map((x) => ({ theme: x.theme, posts: x.posts.map(({ id: _id, ...p }) => p) })))}`,
      { system: SYSTEM, maxOutputTokens: 1024 },
    );
    return calls.map((c) => {
      const q = (out.quotes ?? []).find((x) => x.theme === c.theme);
      const p = q && input.find((x) => x.theme === c.theme)?.posts.find((x) => x.i === q.post);
      const post = p && posts.find((x) => x.id === p.id);
      if (!q || !post || typeof q.quote !== "string" || !verifyQuote(q.quote, post.title, post.body)) return c;
      return { ...c, quote: { text: q.quote.trim().replace(/^["“]|["”]$/g, ""), post_id: post.id, url: post.url, source: post.source } };
    });
  } catch {
    return calls;
  }
}

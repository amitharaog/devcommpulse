import "server-only";
import { db, fetchAll } from "./supabase";
import { getTopics } from "./config";
import { geminiJSON } from "./gemini";
import { addWeeks, currentWeek, weekLabel } from "./week";
import { clip } from "./http";
import type { PostRow } from "./types";

export type DeepDive = {
  tldr: string;
  whats_happening: string[];
  root_causes: string[];
  who: string;
  tool_gaps: string[];
  opportunities: string[];
  objections: string[];
  evidence: { title: string; url: string; source: string; why: string }[];
  generated_at: string;
  posts_read: number;
};

/** On-demand Gemini deep dive for one topic (optionally one keyword) in one week. Cached in Supabase. */
export async function deepDive(slug: string, week: string, keyword: string | null, refresh = false): Promise<DeepDive> {
  const kw = keyword ?? "";
  if (!refresh) {
    const { data } = await db().from("deep_dives").select("content, created_at").eq("topic_slug", slug).eq("week_start", week).eq("keyword", kw).maybeSingle();
    const fresh = data && (week < currentWeek() || Date.now() - Date.parse(data.created_at) < 6 * 3600_000);
    if (fresh) return data.content as DeepDive;
  }
  const topic = (await getTopics()).find((t) => t.slug === slug);
  if (!topic) throw new Error("Unknown topic");

  let posts = await fetchAll<PostRow>((from, to) =>
    db().from("posts").select("*").contains("topic_slugs", [slug]).in("week_start", [week, addWeeks(week, -1)])
      .or("relevant.is.null,relevant.eq.true").range(from, to));
  if (kw) posts = posts.filter((p) => p.matched_keywords.includes(kw));
  const cur = posts.filter((p) => p.week_start === week);
  const prevCount = posts.length - cur.length;
  const sample = cur.sort((a, b) => Number(!!b.is_pain) - Number(!!a.is_pain) || b.score + b.comments - (a.score + a.comments)).slice(0, 70);
  if (!sample.length) throw new Error("No posts for this topic in this week yet.");

  const { data: themes } = await db().from("pain_themes").select("theme, mentions, prev_mentions, unresolved, underserved").eq("week_start", week).eq("topic_slug", slug);

  const lines = sample.map((p, i) => JSON.stringify({
    i, src: p.source, title: clip(p.title, 160), pain: p.pain_point ?? "", mood: p.sentiment_label ?? "", unresolved: !!p.unresolved,
    engagement: p.score + p.comments, text: clip(p.body ?? "", 350),
  })).join("\n");

  const out = await geminiJSON<Omit<DeepDive, "evidence" | "generated_at" | "posts_read"> & { evidence: { post: number; why: string }[] }>(
    `Deep dive for Sumit (PM, code review automation startup selling to mid-size engineering teams).
Topic: ${topic.name} — ${topic.description}${kw ? `\nFocus keyword: "${kw}"` : ""}
Week: ${weekLabel(week)}. Posts this week: ${cur.length} (last week: ${prevCount}).
Clustered themes: ${JSON.stringify(themes ?? [])}

Posts (one JSON per line):
${lines}

Answer in plain, specific language grounded only in these posts. Return:
{"tldr":"2 sentences","whats_happening":["3–5 short points with numbers where possible"],"root_causes":["2–4"],"who":"one sentence on who is hurting (role, team size, stack) if visible","tool_gaps":["2–4 things existing tools fail at, per the posts"],"opportunities":["2–4 concrete things a code review automation product could do or say"],"objections":["0–3 objections a buyer might raise in a demo, implied by the posts"],"evidence":[{"post":0,"why":"one line"}]}
Give 3–6 evidence items using the "i" index of the most telling posts.`,
    { maxOutputTokens: 4096 },
  );

  const dive: DeepDive = {
    tldr: out.tldr ?? "",
    whats_happening: out.whats_happening ?? [],
    root_causes: out.root_causes ?? [],
    who: out.who ?? "",
    tool_gaps: out.tool_gaps ?? [],
    opportunities: out.opportunities ?? [],
    objections: out.objections ?? [],
    evidence: (out.evidence ?? []).filter((e) => sample[e.post]).slice(0, 6).map((e) => ({
      title: sample[e.post].title, url: sample[e.post].url, source: sample[e.post].source, why: e.why,
    })),
    generated_at: new Date().toISOString(),
    posts_read: sample.length,
  };
  await db().from("deep_dives").upsert({ topic_slug: slug, week_start: week, keyword: kw, content: dive, created_at: dive.generated_at });
  return dive;
}

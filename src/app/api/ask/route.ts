import { db, fetchAll } from "@/lib/supabase";
import { getTopics } from "@/lib/config";
import { geminiJSON } from "@/lib/gemini";
import { addWeeks, isWeek, weekLabel } from "@/lib/week";
import { clip } from "@/lib/http";
import type { PostRow } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Free-form question about the selected week's data, answered by Gemini Flash from stored posts only. */
export async function POST(req: Request) {
  const { question, week, topic } = (await req.json().catch(() => ({}))) as { question?: string; week?: string; topic?: string };
  const q = String(question ?? "").trim().slice(0, 400);
  if (!q || !isWeek(week)) return Response.json({ error: "Ask a question and pick a week." }, { status: 400 });
  try {
    const prev = addWeeks(week, -1);
    const topics = (await getTopics()).filter((t) => t.active);
    const { data: themes } = await db().from("pain_themes").select("theme, topic_slug, mentions, prev_mentions, unresolved, underserved").eq("week_start", week);
    const posts = await fetchAll<PostRow>((from, to) => {
      let b = db().from("posts").select("id, source, url, title, body, week_start, topic_slugs, pain_point, sentiment_label, unresolved, score, comments")
        .in("week_start", [week, prev]).or("relevant.is.null,relevant.eq.true");
      if (topic) b = b.contains("topic_slugs", [topic]);
      return b.range(from, to);
    }) as PostRow[];
    const cur = posts.filter((p) => p.week_start === week);
    const counts = topics.map((t) => ({
      topic: t.slug, name: t.name,
      this_week: cur.filter((p) => p.topic_slugs.includes(t.slug)).length,
      last_week: posts.filter((p) => p.week_start === prev && p.topic_slugs.includes(t.slug)).length,
    }));
    const sample = cur.sort((a, b) => b.score + b.comments - (a.score + a.comments)).slice(0, 90);
    const lines = sample.map((p, i) => `${i}|${p.source}|${p.topic_slugs.join(",")}|${clip(p.title, 120)}|${p.pain_point ?? ""}|${p.sentiment_label ?? ""}${p.unresolved ? "|unresolved" : ""}|${clip(p.body ?? "", 160)}`).join("\n");

    const out = await geminiJSON<{ answer: string; sources: number[] }>(
      `Sumit (PM at a code review automation startup) asks: "${q}"
Week: ${weekLabel(week)}${topic ? `, topic ${topic}` : ""}.
Counts per topic: ${JSON.stringify(counts)}
Pain themes: ${JSON.stringify(themes ?? [])}
Top posts this week ("index|source|topics|title|pain point|mood|unresolved|excerpt"):
${lines}

Answer in at most 120 plain words using only this data; use numbers; say plainly if the data can't answer it.
Return {"answer":"","sources":[indexes of up to 5 supporting posts]}`,
      { maxOutputTokens: 2048 },
    );
    return Response.json({
      answer: out.answer,
      sources: (out.sources ?? []).filter((i) => sample[i]).slice(0, 5).map((i) => ({ title: sample[i].title, url: sample[i].url, source: sample[i].source })),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

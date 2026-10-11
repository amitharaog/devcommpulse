import "server-only";
import { db } from "../supabase";
import { getTopics } from "../config";
import { geminiJSON, currentModel } from "../gemini";
import { pool, clip } from "../http";
import type { PostRow } from "../types";

const SYSTEM = `You are a product-research analyst for a startup that sells a code review automation tool to mid-size engineering teams.
You read public developer posts and classify them precisely and conservatively. Output JSON only.`;

type Result = {
  id: string; relevant: boolean; topics: string[]; sentiment: number; label: string;
  is_pain: boolean; pain_point: string; unresolved: boolean; severity: number;
};

function prompt(topicsText: string, posts: PostRow[]) {
  const items = posts.map((p) => ({
    id: p.id,
    source: p.source,
    candidates: p.topic_slugs,
    title: clip(p.title, 200),
    text: clip(p.body ?? "", 700),
  }));
  return `Monitored topics (slug: name — description):
${topicsText}

For EACH post return:
- id: copy exactly
- relevant: true only if it is genuinely about software development and one of the topics (false for unrelated meanings, job ads, spam, self-promotion with no problem discussed)
- topics: slugs from the list above that truly apply (can differ from candidates)
- sentiment: number from -1 (very frustrated) to 1 (very positive)
- label: "negative" | "neutral" | "positive"
- is_pain: true if the author describes a problem, frustration, blocker or unmet need
- pain_point: if is_pain, the underlying problem as a short, generic noun phrase of 3–8 words that would read the same across many posts (e.g. "too many false positives from review bots", "flaky tests block merges", "PRs wait days for review"); else ""
- unresolved: true if it asks for help or describes a problem with no fix visible, or says existing tools don't solve it
- severity: 1 minor annoyance, 2 slows the team down, 3 blocks work or makes people switch tools

Return {"results":[...]} with one object per post in the same order.

Posts:
${JSON.stringify(items)}`;
}

export type AnalyzeResult = { analyzed: number; failedBatches: number; remaining: number; model: string; errors: string[] };

/** Sends unanalysed posts to Gemini Flash in batches until the time budget runs out. Newest posts first. */
export async function analyze(opts: { budgetMs?: number; batchSize?: number } = {}): Promise<AnalyzeResult> {
  const deadline = Date.now() + (opts.budgetMs ?? 120_000);
  const batchSize = opts.batchSize ?? 25;
  const workers = Math.max(1, Number(process.env.GEMINI_CONCURRENCY || 2));
  const topics = await getTopics({ activeOnly: true });
  const slugs = new Set(topics.map((t) => t.slug));
  const topicsText = topics.map((t) => `${t.slug}: ${t.name} — ${t.description}`).join("\n");
  let analyzed = 0, failedBatches = 0;
  const errors: string[] = [];
  const skip = new Set<string>();

  while (Date.now() < deadline - 25_000) {
    const { data, error } = await db()
      .from("posts")
      .select("*")
      .eq("analyzed", false)
      .order("posted_at", { ascending: false })
      .limit(batchSize * workers + skip.size);
    if (error) throw new Error(error.message);
    const todo = ((data ?? []) as PostRow[]).filter((p) => !skip.has(p.id)).slice(0, batchSize * workers);
    if (!todo.length) break;

    const batches: PostRow[][] = [];
    for (let i = 0; i < todo.length; i += batchSize) batches.push(todo.slice(i, i + batchSize));

    const outcomes = await pool(batches, workers, async (batch) => {
      try {
        const res = await geminiJSON<{ results: Result[] }>(prompt(topicsText, batch), { system: SYSTEM, maxOutputTokens: 8192 });
        const byId = new Map(batch.map((p) => [p.id, p]));
        const items = (res.results ?? [])
          .filter((r) => r && byId.has(r.id))
          .map((r) => {
            const post = byId.get(r.id)!;
            const s = Math.max(-1, Math.min(1, Number(r.sentiment) || 0));
            return {
              id: r.id,
              relevant: r.relevant !== false,
              topic_slugs: (r.topics ?? []).filter((t) => slugs.has(t)),
              sentiment: s,
              sentiment_label: ["negative", "neutral", "positive"].includes(r.label) ? r.label : s < -0.2 ? "negative" : s > 0.2 ? "positive" : "neutral",
              is_pain: !!r.is_pain,
              pain_point: r.is_pain ? clip(String(r.pain_point ?? "").toLowerCase().trim(), 90) : "",
              // An accepted answer on Stack Exchange overrides the model's guess.
              unresolved: !!r.unresolved && post.answered !== true,
              severity: Math.max(1, Math.min(3, Math.round(Number(r.severity) || 1))),
            };
          });
        // Posts the model skipped are marked so they don't loop forever.
        for (const p of batch) if (!items.some((i) => i.id === p.id)) skip.add(p.id);
        if (!items.length) return 0;
        const { data: n, error: e } = await db().rpc("apply_analysis", { items });
        if (e) throw new Error(e.message);
        return Number(n) || 0;
      } catch (e) {
        failedBatches++;
        errors.push((e as Error).message.slice(0, 200));
        batch.forEach((p) => skip.add(p.id));
        return 0;
      }
    });
    const done = outcomes.reduce((a, b) => a + b, 0);
    analyzed += done;
    if (done === 0 && failedBatches >= 3) break;
  }

  const { count } = await db().from("posts").select("id", { count: "exact", head: true }).eq("analyzed", false);
  return { analyzed, failedBatches, remaining: count ?? 0, model: currentModel(), errors: errors.slice(0, 5) };
}

import "server-only";
import { db } from "../supabase";
import { getSources, getTopics } from "../config";
import { ADAPTERS } from "../sources";
import { matchPost } from "../match";
import { daysAgo, weekStartOf } from "../week";
import type { RawPost } from "../types";

export type CollectResult = {
  lookbackDays: number;
  perSource: Record<string, { fetched: number; kept: number; error?: string }>;
  inserted: number;
  updated: number;
  log: string[];
};

/** Pulls recent posts from every enabled community, keeps those that match a monitored topic, and upserts them. */
export async function collect(opts: { lookbackDays?: number; budgetMs?: number } = {}): Promise<CollectResult> {
  const started = Date.now();
  const deadline = started + (opts.budgetMs ?? 100_000);
  const topics = await getTopics({ activeOnly: true });
  if (!topics.length) throw new Error("No active topics. Add topics in Topics & sources.");
  const sources = (await getSources()).filter((s) => s.enabled && ADAPTERS[s.id]);

  let lookbackDays = opts.lookbackDays;
  if (!lookbackDays) {
    const { count } = await db().from("posts").select("id", { count: "exact", head: true });
    lookbackDays = count ? 8 : 21; // first run backfills three weeks so week-over-week works immediately
  }
  const since = daysAgo(lookbackDays);
  const log: string[] = [];
  const perSource: CollectResult["perSource"] = {};

  const results = await Promise.allSettled(
    sources.map(async (s) => {
      const posts = await ADAPTERS[s.id]({ topics, config: s.config ?? {}, since, deadline, log: (m) => log.push(m) });
      return { id: s.id, posts };
    }),
  );

  const kept = new Map<string, { raw: RawPost; topics: string[]; keywords: string[] }>();
  results.forEach((r, i) => {
    const id = sources[i].id;
    if (r.status === "rejected") {
      perSource[id] = { fetched: 0, kept: 0, error: String(r.reason?.message ?? r.reason) };
      return;
    }
    let k = 0;
    for (const raw of r.value.posts) {
      if (raw.postedAt < since || !raw.title) continue;
      const m = matchPost(raw, topics);
      if (!m.topics.length) continue;
      kept.set(raw.id, { raw, topics: m.topics, keywords: m.keywords });
      k++;
    }
    perSource[id] = { fetched: r.value.posts.length, kept: k };
  });

  // Merge with what's already stored so Gemini's topic corrections aren't overwritten.
  const ids = [...kept.keys()];
  const existing = new Map<string, { topic_slugs: string[]; matched_keywords: string[] }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db().from("posts").select("id, topic_slugs, matched_keywords, analyzed").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) existing.set(row.id, row);
  }

  const rows = [...kept.values()].map(({ raw, topics: t, keywords }) => {
    const prev = existing.get(raw.id);
    return {
      id: raw.id,
      source: raw.source,
      url: raw.url,
      title: raw.title.slice(0, 500),
      body: raw.body,
      author: raw.author ?? null,
      score: raw.score || 0,
      comments: raw.comments || 0,
      posted_at: raw.postedAt.toISOString(),
      week_start: weekStartOf(raw.postedAt),
      topic_slugs: prev ? [...new Set([...prev.topic_slugs, ...t])] : t,
      matched_keywords: [...new Set([...(prev?.matched_keywords ?? []), ...keywords])],
      answered: raw.answered ?? null,
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db().from("posts").upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (error) throw new Error(error.message);
  }

  return {
    lookbackDays,
    perSource,
    inserted: rows.filter((r) => !existing.has(r.id)).length,
    updated: rows.filter((r) => existing.has(r.id)).length,
    log: log.slice(0, 40),
  };
}

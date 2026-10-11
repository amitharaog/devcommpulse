import { getJSON, pool, sleep, stripHtml, clip } from "../http";
import type { RawPost } from "../types";
import { type Adapter, num, strList, unix } from "./context";

/**
 * Stack Overflow + other Stack Exchange sites via the public API (no login).
 * Tag queries cover Stack Overflow; keyword queries cover discussion-heavy sites.
 * STACKEXCHANGE_KEY raises the quota from 300 to 10,000 requests/day.
 */
type Q = {
  question_id: number; title: string; body?: string; link: string; score: number;
  answer_count: number; is_answered: boolean; creation_date: number; tags: string[];
  owner?: { display_name?: string };
};
type Resp = { items: Q[]; has_more: boolean; backoff?: number; quota_remaining?: number; error_message?: string };

const API = "https://api.stackexchange.com/2.3";

export const stackexchange: Adapter = async ({ topics, config, since, deadline, log }) => {
  const tagSites = strList(config.tag_sites, ["stackoverflow"]);
  const keywordSites = strList(config.keyword_sites, ["softwareengineering"]);
  const maxPages = num(config.max_pages, 5);
  const key = process.env.STACKEXCHANGE_KEY ? `&key=${process.env.STACKEXCHANGE_KEY}` : "";
  const out = new Map<string, RawPost>();

  const tagToTopics = new Map<string, string[]>();
  for (const t of topics) for (const tag of t.tags) tagToTopics.set(tag, [...(tagToTopics.get(tag) ?? []), t.slug]);

  type Job = { site: string; path: string; hintTopics?: string[]; hintKeyword?: string };
  const jobs: Job[] = [];
  for (const site of tagSites)
    for (const [tag, slugs] of tagToTopics)
      jobs.push({ site, path: `/questions?order=desc&sort=creation&tagged=${encodeURIComponent(tag)}`, hintTopics: slugs });
  const keywords = [...new Set(topics.flatMap((t) => t.keywords))];
  for (const site of keywordSites)
    for (const kw of keywords)
      jobs.push({ site, path: `/search/advanced?order=desc&sort=creation&q=${encodeURIComponent(kw)}`, hintKeyword: kw });

  let quota: number | undefined;
  await pool(jobs, 3, async (job) => {
    for (let page = 1; page <= maxPages; page++) {
      if (Date.now() > deadline || (quota !== undefined && quota < 5)) return;
      const url = `${API}${job.path}&site=${job.site}&fromdate=${unix(since)}&pagesize=100&page=${page}&filter=withbody${key}`;
      let r: Resp;
      try {
        r = await getJSON<Resp>(url, { retries: 1 });
      } catch (e) {
        log(`stackexchange ${job.site}: ${(e as Error).message}`);
        return;
      }
      quota = r.quota_remaining;
      for (const q of r.items ?? []) {
        const id = `se:${job.site}:${q.question_id}`;
        const prev = out.get(id);
        out.set(id, {
          id,
          source: job.site === "stackoverflow" ? "stackoverflow" : `stackexchange`,
          url: q.link,
          title: stripHtml(q.title),
          body: clip(stripHtml(q.body), 1500),
          author: q.owner?.display_name,
          score: q.score,
          comments: q.answer_count,
          postedAt: new Date(q.creation_date * 1000),
          answered: q.is_answered,
          hintTopics: [...new Set([...(prev?.hintTopics ?? []), ...(job.hintTopics ?? [])])],
          hintKeyword: job.hintKeyword ?? prev?.hintKeyword,
        });
      }
      if (r.backoff) await sleep(r.backoff * 1000);
      if (!r.has_more) return;
    }
  });
  if (quota !== undefined) log(`stackexchange: quota remaining ${quota}`);
  return [...out.values()];
};

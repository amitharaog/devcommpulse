import { getJSON, pool, stripHtml, clip } from "../http";
import type { RawPost } from "../types";
import { type Adapter, num, unix } from "./context";

/** Hacker News via the Algolia search API (stories + comments, no login). */
type Hit = {
  objectID: string; title?: string | null; story_title?: string | null; story_text?: string | null;
  comment_text?: string | null; url?: string | null; author: string; points?: number | null;
  num_comments?: number | null; created_at_i: number; _tags: string[];
};

export const hackernews: Adapter = async ({ topics, config, since, deadline, log }) => {
  const tags = config.include_comments === false ? "story" : "(story,comment)";
  const maxPages = num(config.max_pages, 2);
  const keywords = [...new Set(topics.flatMap((t) => t.keywords))];
  const out = new Map<string, RawPost>();
  await pool(keywords, 4, async (kw) => {
    for (let page = 0; page < maxPages; page++) {
      if (Date.now() > deadline) return;
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(`"${kw}"`)}&tags=${tags}&numericFilters=created_at_i>${unix(since)}&hitsPerPage=100&page=${page}`;
      try {
        const r = await getJSON<{ hits: Hit[]; nbPages: number }>(url, { retries: 1 });
        for (const h of r.hits) {
          const isComment = h._tags.includes("comment");
          out.set(`hn:${h.objectID}`, {
            id: `hn:${h.objectID}`,
            source: "hackernews",
            url: `https://news.ycombinator.com/item?id=${h.objectID}`,
            title: isComment ? `Comment on “${h.story_title ?? "HN thread"}”` : h.title ?? "(untitled)",
            body: clip(stripHtml(isComment ? h.comment_text : h.story_text ?? h.url ?? ""), 1500),
            author: h.author,
            score: h.points ?? 0,
            comments: h.num_comments ?? 0,
            postedAt: new Date(h.created_at_i * 1000),
            answered: null,
            hintKeyword: kw,
          });
        }
        if (page + 1 >= r.nbPages) return;
      } catch (e) {
        log(`hackernews "${kw}": ${(e as Error).message}`);
        return;
      }
    }
  });
  return [...out.values()];
};

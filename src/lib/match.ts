import type { RawPost, Topic } from "./types";

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word, case-insensitive, tolerant of a trailing plural "s" and of "-" vs " " (e.g. "code-review"). */
export function keywordRegex(keyword: string): RegExp {
  const k = escape(keyword.trim().toLowerCase()).replace(/\\?[\s-]+/g, "[\\s-]+");
  return new RegExp(`(^|[^a-z0-9])${k}s?(?![a-z0-9])`, "i");
}

const cache = new Map<string, RegExp>();
function re(k: string) {
  let r = cache.get(k);
  if (!r) cache.set(k, (r = keywordRegex(k)));
  return r;
}

export type Match = { topics: string[]; keywords: string[] };

export function matchPost(post: Pick<RawPost, "title" | "body" | "hintTopics">, topics: Topic[]): Match {
  const text = `${post.title}\n${post.body}`;
  const topicSet = new Set<string>();
  const kwSet = new Set<string>();
  for (const t of topics) {
    for (const k of t.keywords) {
      if (re(k).test(text)) {
        topicSet.add(t.slug);
        kwSet.add(k.toLowerCase());
      }
    }
  }
  for (const h of post.hintTopics ?? []) if (topics.some((t) => t.slug === h)) topicSet.add(h);
  return { topics: [...topicSet], keywords: [...kwSet] };
}

export function allKeywords(topics: Topic[]): string[] {
  return [...new Set(topics.flatMap((t) => t.keywords.map((k) => k.toLowerCase().trim())).filter(Boolean))];
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

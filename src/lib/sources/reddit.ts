import { getJSON, clip, UA } from "../http";
import type { RawPost } from "../types";
import { type Adapter, strList, unix } from "./context";

/**
 * Reddit search across a multireddit. Uses app-only OAuth when REDDIT_CLIENT_ID/SECRET are set
 * (recommended: Reddit often blocks anonymous requests from cloud servers), else the public JSON.
 */
type Child = { data: {
  id: string; title: string; selftext: string; permalink: string; author: string; score: number;
  num_comments: number; created_utc: number; subreddit: string; over_18: boolean;
} };
type Listing = { data: { children: Child[]; after: string | null } };

async function token(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID, secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`reddit oauth ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Splits keywords into OR-queries that stay under Reddit's query length limit. */
function queries(keywords: string[], maxLen = 400): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const k of keywords) {
    const term = k.includes(" ") ? `"${k}"` : k;
    if (cur.length && [...cur, term].join(" OR ").length > maxLen) { out.push(cur.join(" OR ")); cur = []; }
    cur.push(term);
  }
  if (cur.length) out.push(cur.join(" OR "));
  return out;
}

export const reddit: Adapter = async ({ topics, config, since, deadline, log }) => {
  const subs = strList(config.subreddits, ["programming", "ExperiencedDevs", "devops"]);
  const tok = await token().catch((e) => { log(`reddit: ${e.message}; trying public JSON`); return null; });
  const base = tok ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const headers: Record<string, string> = tok ? { Authorization: `Bearer ${tok}` } : {};
  const ageDays = (Date.now() - since.getTime()) / 86_400_000;
  const t = ageDays <= 7 ? "week" : "month";
  const out = new Map<string, RawPost>();

  const keywords = [...new Set(topics.flatMap((tp) => tp.keywords))];
  for (const q of queries(keywords)) {
    let after: string | null = null;
    for (let page = 0; page < 4; page++) {
      if (Date.now() > deadline) break;
      const url = `${base}/r/${subs.join("+")}/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new&t=${t}&limit=100&raw_json=1${after ? `&after=${after}` : ""}`;
      let listing: Listing;
      try {
        listing = await getJSON<Listing>(url, { headers, retries: 1 });
      } catch (e) {
        log(`reddit: ${(e as Error).message}${tok ? "" : " (set REDDIT_CLIENT_ID/SECRET for reliable access)"}`);
        return [...out.values()];
      }
      let older = false;
      for (const { data: p } of listing.data.children) {
        if (p.over_18) continue;
        if (p.created_utc < unix(since)) { older = true; continue; }
        out.set(`reddit:${p.id}`, {
          id: `reddit:${p.id}`,
          source: "reddit",
          url: `https://www.reddit.com${p.permalink}`,
          title: `${p.title}`,
          body: clip(`r/${p.subreddit}: ${p.selftext}`, 1500),
          author: p.author,
          score: p.score,
          comments: p.num_comments,
          postedAt: new Date(p.created_utc * 1000),
          answered: null,
        });
      }
      after = listing.data.after;
      if (!after || older) break;
    }
  }
  return [...out.values()];
};

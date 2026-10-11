import { getJSON, pool, clip } from "../http";
import type { RawPost } from "../types";
import { type Adapter } from "./context";

/** devRant public API (app=3). Best effort: the service is lightly maintained, so failures are logged and skipped. */
type Rant = { id: number; text: string; score: number; num_comments: number; created_time: number; tags: string[]; user_username: string };

export const devrant: Adapter = async ({ topics, since, deadline, log }) => {
  const keywords = [...new Set(topics.flatMap((t) => t.keywords))].filter((k) => k.length <= 25);
  const out = new Map<string, RawPost>();
  let failures = 0;
  await pool(keywords, 3, async (kw) => {
    if (Date.now() > deadline || failures > 3) return;
    try {
      const r = await getJSON<{ success: boolean; results?: Rant[] }>(
        `https://devrant.com/api/devrant/search?app=3&term=${encodeURIComponent(kw)}`, { retries: 0, timeoutMs: 8000 });
      for (const rant of r.results ?? []) {
        const posted = new Date(rant.created_time * 1000);
        if (posted < since) continue;
        out.set(`devrant:${rant.id}`, {
          id: `devrant:${rant.id}`,
          source: "devrant",
          url: `https://devrant.com/rants/${rant.id}`,
          title: clip(rant.text.split("\n")[0], 140),
          body: clip(`${rant.text} [tags: ${rant.tags.join(", ")}]`, 1500),
          author: rant.user_username,
          score: rant.score,
          comments: rant.num_comments,
          postedAt: posted,
          answered: null,
          hintKeyword: kw,
        });
      }
    } catch (e) {
      failures++;
      if (failures === 1) log(`devrant: ${(e as Error).message}`);
    }
  });
  return [...out.values()];
};

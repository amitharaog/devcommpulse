import { getJSON, pool, clip } from "../http";
import type { RawPost } from "../types";
import { type Adapter, strList } from "./context";

/** DEV Community public API: recent articles per tag; topic matching is done on title, description and tags. */
type Article = {
  id: number; title: string; description: string; url: string; tag_list: string[];
  comments_count: number; public_reactions_count: number; published_at: string; user?: { username?: string };
};

export const devto: Adapter = async ({ config, since, log }) => {
  const tags = strList(config.tags, ["codereview", "cicd", "devops"]);
  const days = Math.max(1, Math.ceil((Date.now() - since.getTime()) / 86_400_000));
  const out = new Map<string, RawPost>();
  await pool(tags, 3, async (tag) => {
    for (const mode of [`top=${days}`, "state=fresh"]) {
      try {
        const list = await getJSON<Article[]>(`https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&per_page=100&${mode}`, { retries: 1 });
        for (const a of list) {
          const posted = new Date(a.published_at);
          if (posted < since) continue;
          out.set(`devto:${a.id}`, {
            id: `devto:${a.id}`,
            source: "devto",
            url: a.url,
            title: a.title,
            body: clip(`${a.description} [tags: ${a.tag_list.join(", ")}]`, 1500),
            author: a.user?.username,
            score: a.public_reactions_count,
            comments: a.comments_count,
            postedAt: posted,
            answered: null,
          });
        }
      } catch (e) {
        log(`devto #${tag}: ${(e as Error).message}`);
      }
    }
  });
  return [...out.values()];
};

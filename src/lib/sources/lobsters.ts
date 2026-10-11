import { getJSON, clip, stripHtml } from "../http";
import type { RawPost } from "../types";
import { type Adapter, num } from "./context";

/** Lobsters newest stories (JSON feed). A small, senior-engineer-heavy community. */
type Story = {
  short_id: string; title: string; url: string; comments_url: string; description?: string;
  score: number; comment_count: number; created_at: string; tags: string[]; submitter_user?: string | { username: string };
};

export const lobsters: Adapter = async ({ config, since, deadline, log }) => {
  const pages = num(config.pages, 8);
  const out: RawPost[] = [];
  for (let p = 1; p <= pages; p++) {
    if (Date.now() > deadline) break;
    try {
      const stories = await getJSON<Story[]>(p === 1 ? "https://lobste.rs/newest.json" : `https://lobste.rs/newest/page/${p}.json`, { retries: 1 });
      let older = false;
      for (const s of stories) {
        const posted = new Date(s.created_at);
        if (posted < since) { older = true; continue; }
        out.push({
          id: `lobsters:${s.short_id}`,
          source: "lobsters",
          url: s.comments_url,
          title: s.title,
          body: clip(`${stripHtml(s.description)} [tags: ${s.tags.join(", ")}] ${s.url}`, 1500),
          author: typeof s.submitter_user === "string" ? s.submitter_user : s.submitter_user?.username,
          score: s.score,
          comments: s.comment_count,
          postedAt: posted,
          answered: null,
        });
      }
      if (older || !stories.length) break;
    } catch (e) {
      log(`lobsters page ${p}: ${(e as Error).message}`);
      break;
    }
  }
  return out;
};

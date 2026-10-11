"use client";

import { useMemo, useState } from "react";
import { sourceLabel } from "@/lib/labels";

export type PostLite = {
  id: string; source: string; url: string; title: string; score: number; comments: number; posted_at: string;
  sentiment_label: string | null; is_pain: boolean | null; pain_point: string | null; unresolved: boolean | null; answered: boolean | null; severity: number | null;
};

const PAGE = 15;

export function PostsTable({ posts }: { posts: PostLite[] }) {
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("all");
  const [only, setOnly] = useState<"all" | "pain" | "unresolved" | "negative">("all");
  const [sort, setSort] = useState<"engagement" | "newest">("engagement");
  const [page, setPage] = useState(0);
  const sources = useMemo(() => [...new Set(posts.map((p) => p.source))], [posts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = posts.filter((p) =>
      (src === "all" || p.source === src) &&
      (only === "all" || (only === "pain" && p.is_pain) || (only === "unresolved" && p.unresolved) || (only === "negative" && p.sentiment_label === "negative")) &&
      (!needle || p.title.toLowerCase().includes(needle) || (p.pain_point ?? "").includes(needle)));
    return out.sort((a, b) => (sort === "newest" ? Date.parse(b.posted_at) - Date.parse(a.posted_at) : b.score + b.comments - (a.score + a.comments)));
  }, [posts, q, src, only, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const view = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const reset = () => setPage(0);
  const sel = "rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px]";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <input value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Search titles and pain points" className={`${sel} w-full sm:w-64`} aria-label="Search posts" />
        <select value={src} onChange={(e) => { setSrc(e.target.value); reset(); }} className={sel} aria-label="Community">
          <option value="all">All communities</option>
          {sources.map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}
        </select>
        <div className="flex rounded-md border border-line bg-paper p-0.5 text-[13px]" role="group" aria-label="Show">
          {(["all", "pain", "unresolved", "negative"] as const).map((k) => (
            <button key={k} onClick={() => { setOnly(k); reset(); }} className={`rounded px-2.5 py-1 ${only === k ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>
              {{ all: "All", pain: "Pain points", unresolved: "Unresolved", negative: "Negative" }[k]}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={`${sel} sm:ml-auto`} aria-label="Sort">
          <option value="engagement">Most engagement</option>
          <option value="newest">Newest</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl w-full min-w-[760px] text-[14px]">
          <thead><tr><th>Post</th><th>Community</th><th>Mood</th><th>Status</th><th className="text-right">Engagement</th></tr></thead>
          <tbody>
            {view.map((p) => (
              <tr key={p.id}>
                <td className="max-w-[460px]">
                  <a href={p.url} target="_blank" rel="noreferrer" className="line-clamp-1 font-medium hover:text-cobalt hover:underline">{p.title}</a>
                  {p.pain_point && <div className="line-clamp-1 text-[12.5px] text-muted">{p.pain_point}</div>}
                </td>
                <td className="whitespace-nowrap text-[13px]">{sourceLabel(p.source)}<div className="text-[12px] text-muted">{new Date(p.posted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</div></td>
                <td className="text-[13px]">
                  <span className={p.sentiment_label === "negative" ? "text-rise" : p.sentiment_label === "positive" ? "text-ease" : "text-muted"}>{p.sentiment_label ?? "pending"}</span>
                </td>
                <td>
                  {p.unresolved ? <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[12px] font-medium text-amber">Unresolved</span>
                    : p.answered ? <span className="rounded-full bg-ease-soft px-2 py-0.5 text-[12px] font-medium text-ease">Answered</span>
                    : <span className="text-[12px] text-muted">—</span>}
                </td>
                <td className="whitespace-nowrap text-right text-[13px]">{p.score} pts, {p.comments} replies</td>
              </tr>
            ))}
            {!view.length && <tr><td colSpan={5} className="py-8 text-center text-muted">No posts match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 border-t border-line px-5 py-3 text-[13px] text-muted">
        <span>{filtered.length} posts</span>
        <div className="ml-auto flex items-center gap-2">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40">Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}

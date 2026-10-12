"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Source, Topic } from "@/lib/types";
import { timeAgo } from "./bits";

type Change = { id: number; topic_slug: string; keyword: string; action: string; reason: string; created_at: string };
type Run = { id: number; stage: string; started_at: string; finished_at: string | null; ok: boolean | null; error: string | null; stats: Record<string, unknown> | null };

/** Read-only view of what the dashboard monitors, plus a public button to pull in new data now. */
export function SettingsClient(props: {
  topics: Topic[]; sources: Source[]; changes: Change[]; runs: Run[]; postCount: number; geminiModel: string;
}) {
  const [tab, setTab] = useState<"topics" | "sources" | "pipeline" | "changes">("topics");

  return (
    <div className="space-y-6">
      <CheckPanel />

      <div className="flex gap-1 border-b border-line" role="tablist">
        {([["topics", `Topics (${props.topics.length})`], ["sources", "Communities"], ["pipeline", "Data refresh"], ["changes", `AI changes (${props.changes.length})`]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-[14px] ${tab === k ? "border-cobalt font-medium" : "border-transparent text-muted hover:text-ink"}`}>{label}</button>
        ))}
      </div>

      {tab === "pipeline" && <RefreshPanel postCount={props.postCount} runs={props.runs} model={props.geminiModel} />}

      {tab === "topics" && <section>
        <h2 className="text-[17px] font-semibold">Monitored topics</h2>
        <p className="mb-4 text-sm text-muted">Keywords are matched as whole words in titles and text, case-insensitive, plural-tolerant. Stack Overflow tags pull every question with that tag.</p>
        <div className="space-y-3">
          {props.topics.map((t) => <TopicView key={t.slug} topic={t} />)}
        </div>
      </section>}

      {tab === "changes" && <section>
        <h2 className="text-[17px] font-semibold">Added automatically</h2>
        <p className="mb-3 text-sm text-muted">Keywords and topics the Friday brief added after seeing them in posts.</p>
        {props.changes.length ? (
          <ul className="panel divide-y divide-line text-[15px]">
            {props.changes.map((c) => (
              <li key={c.id} className="px-4 py-2.5">
                <span className="font-medium">{c.action === "added_topic" ? `New topic ${c.topic_slug}` : `“${c.keyword}”`}</span>
                {c.action === "added_keyword" && <span className="text-muted"> → {c.topic_slug}</span>}
                <span className="text-muted">, {timeAgo(c.created_at)}</span>
                {c.reason && <div className="text-sm text-muted">{c.reason}</div>}
              </li>
            ))}
          </ul>
        ) : <p className="panel p-4 text-sm text-muted">Nothing yet. The first Friday brief may suggest additions.</p>}
      </section>}

      {tab === "sources" && <section>
        <h2 className="text-[17px] font-semibold">Communities</h2>
        <p className="mb-4 text-sm text-muted">Where posts are collected from, and each community&apos;s settings (subreddits, DEV tags, Stack Exchange sites).</p>
        <div className="space-y-3">
          {props.sources.map((s) => <SourceView key={s.id} source={s} />)}
        </div>
      </section>}
    </div>
  );
}

type Json = Record<string, unknown>;

/** Collect, analyse and rewrite the brief. The server enforces cooldowns, so this needs no passcode. */
function CheckPanel() {
  const router = useRouter();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const add = (line: string) => setLog((l) => [...l, line]);

  async function call(stage: "collect" | "analyze" | "digest"): Promise<Json> {
    const r = await fetch(`/api/refresh?stage=${stage}`, { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as Json;
    if (!r.ok) throw new Error((j.error as string) || `Request failed (${r.status})`);
    return j;
  }

  async function check() {
    setBusy(true); setLog([]);
    try {
      add("Checking communities for new posts…");
      const c = await call("collect");
      if (c.skipped) add(`  Already checked ${timeAgo(c.lastRunAt as string)}, so the posts are up to date.`);
      else {
        const per = c.perSource as Record<string, { kept: number }>;
        add(`  ${c.inserted} new and ${c.updated} updated posts. ` + Object.entries(per).map(([k, v]) => `${k}: ${v.kept}`).join(", "));
      }

      let last = Infinity;
      for (let i = 0; i < 8; i++) {
        add(i === 0 ? "Analysing new posts with Gemini…" : "Continuing analysis…");
        const a = await call("analyze");
        if (a.skipped) { add(a.limit ? "  Analysis limit reached for now; the nightly run finishes the rest." : "  Analysis is already running; it will finish on its own."); break; }
        add(`  ${a.analyzed} analysed, ${a.remaining} left`);
        const remaining = Number(a.remaining);
        if (!remaining || Number(a.analyzed) === 0 || remaining >= last) break;
        last = remaining;
      }

      add("Updating the brief…");
      const d = await call("digest");
      add(d.skipped ? `  Brief already updated ${timeAgo(d.lastRunAt as string)}.` : `  “${d.headline}” (${d.themes} themes)`);
      add("Done. The dashboard now shows the latest data.");
      router.refresh();
    } catch (e) {
      add(`Stopped: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={check} disabled={busy} className="rounded-md bg-cobalt px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          {busy ? "Checking…" : "Check for new data"}
        </button>
        <span className="text-sm text-muted">Collects new posts, analyses them with Gemini and updates the brief. Takes a few minutes.</span>
      </div>
      {log.length > 0 && (
        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-ink p-4 text-[13px] leading-relaxed text-white/90">{log.join("\n")}{busy ? "\n…" : ""}</pre>
      )}
    </section>
  );
}

function RefreshPanel({ postCount, runs, model }: { postCount: number; runs: Run[]; model: string }) {
  return (
    <section>
      <h2 className="text-[17px] font-semibold">Data refresh</h2>
      <p className="mb-4 max-w-[75ch] text-sm text-muted">
        Runs automatically: collection and analysis every night, and the brief every Friday at 06:00 IST (00:30 UTC). {postCount.toLocaleString()} posts stored. AI model: {model}.
      </p>
      {runs.length > 0 && (
        <>
          <h3 className="text-sm font-medium">Recent runs</h3>
          <ul className="mt-1 text-sm text-muted">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id}>
                {r.stage} {timeAgo(r.started_at)}: {r.ok === null ? "running or timed out" : r.ok ? "ok" : `failed (${r.error?.slice(0, 120)})`}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function TopicView({ topic }: { topic: Topic }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`panel p-4 ${!topic.active ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setOpen(!open)} className="text-left">
          <span className="font-semibold">{topic.name}</span>
          {topic.origin === "ai" && <span className="ml-2 rounded bg-amber-soft px-1.5 py-0.5 text-xs text-amber">added by AI</span>}
          <span className="ml-2 text-sm text-muted">{topic.keywords.length} keywords, {topic.tags.length} tags{!topic.active ? ", paused" : ""}</span>
        </button>
        <button onClick={() => setOpen(!open)} className="ml-auto text-sm text-cobalt underline">{open ? "Close" : "Details"}</button>
      </div>
      {open && (
        <dl className="mt-4 grid gap-3 text-sm">
          {topic.description && <Detail label="What it covers">{topic.description}</Detail>}
          <Detail label="Keywords">{topic.keywords.join(", ") || "None"}</Detail>
          <Detail label="Stack Overflow tags">{topic.tags.join(", ") || "None"}</Detail>
        </dl>
      )}
    </div>
  );
}

function SourceView({ source }: { source: Source }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`panel p-4 ${!source.enabled ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">{source.name}</span>
        <span className="ml-auto text-sm text-muted">{source.enabled ? "Collecting" : "Off"}</span>
        <button onClick={() => setOpen(!open)} className="text-sm text-cobalt underline">{open ? "Close" : "Settings"}</button>
      </div>
      {open && (
        <pre className="mt-3 overflow-auto rounded-md border border-line px-3 py-2 font-mono text-[13px]">{JSON.stringify(source.config, null, 2)}</pre>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1"><dt className="text-muted">{label}</dt><dd>{children}</dd></div>;
}

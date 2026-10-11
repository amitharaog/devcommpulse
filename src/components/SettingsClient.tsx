"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Source, Topic } from "@/lib/types";
import { timeAgo } from "./bits";

type Change = { id: number; topic_slug: string; keyword: string; action: string; reason: string; created_at: string };
type Run = { id: number; stage: string; started_at: string; finished_at: string | null; ok: boolean | null; error: string | null; stats: Record<string, unknown> | null };

export function SettingsClient(props: {
  topics: Topic[]; sources: Source[]; changes: Change[]; runs: Run[]; postCount: number;
  weeks: { value: string; label: string }[]; geminiModel: string;
}) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const k = sessionStorage.getItem("dcp-admin");
    if (k) { setKey(k); setUnlocked(true); }
  }, []);

  async function api(path: string, body?: unknown) {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": key }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { setUnlocked(false); sessionStorage.removeItem("dcp-admin"); }
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    return j;
  }

  async function unlock() {
    try {
      await api("/api/admin/topics", { action: "check" });
      sessionStorage.setItem("dcp-admin", key);
      setUnlocked(true); setMsg(null);
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="space-y-10">
      <section className="panel flex flex-wrap items-center gap-3 p-4">
        {unlocked ? (
          <>
            <span className="text-sm">Editing unlocked for this browser tab.</span>
            <button className="ml-auto text-sm text-cobalt underline" onClick={() => { sessionStorage.removeItem("dcp-admin"); setUnlocked(false); setKey(""); }}>Lock</button>
          </>
        ) : (
          <>
            <label className="text-sm" htmlFor="pass">Admin passcode</label>
            <input id="pass" type="password" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()} className="rounded-md border border-line px-3 py-1.5" />
            <button onClick={unlock} className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white">Unlock editing</button>
            <span className="text-sm text-muted">Anyone can read the dashboard; changes need the passcode.</span>
            {msg && <span className="w-full text-sm text-rise">{msg}</span>}
          </>
        )}
      </section>

      <RunPanel api={api} unlocked={unlocked} weeks={props.weeks} postCount={props.postCount} runs={props.runs} model={props.geminiModel} onDone={() => router.refresh()} />

      <section>
        <h2 className="font-display text-2xl font-bold">Monitored topics</h2>
        <p className="mb-4 text-sm text-muted">Keywords are matched as whole words in titles and text, case-insensitive, plural-tolerant. Stack Overflow tags pull every question with that tag.</p>
        <div className="space-y-3">
          {props.topics.map((t) => <TopicEditor key={t.slug} topic={t} api={api} unlocked={unlocked} onSaved={() => router.refresh()} />)}
          <TopicEditor api={api} unlocked={unlocked} onSaved={() => router.refresh()} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-bold">Added automatically</h2>
        <p className="mb-3 text-sm text-muted">Keywords and topics the Friday brief added after seeing them in posts. Remove any you don&apos;t want from the topic above.</p>
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
      </section>

      <section>
        <h2 className="font-display text-2xl font-bold">Communities</h2>
        <p className="mb-4 text-sm text-muted">Turn a community off, or change its settings (subreddits, DEV tags, Stack Exchange sites) as JSON.</p>
        <div className="space-y-3">
          {props.sources.map((s) => <SourceEditor key={s.id} source={s} api={api} unlocked={unlocked} onSaved={() => router.refresh()} />)}
        </div>
      </section>
    </div>
  );
}

type Api = (path: string, body?: unknown) => Promise<Record<string, unknown>>;

function RunPanel({ api, unlocked, weeks, postCount, runs, model, onDone }: { api: Api; unlocked: boolean; weeks: { value: string; label: string }[]; postCount: number; runs: Run[]; model: string; onDone: () => void }) {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [week, setWeek] = useState(weeks[0].value);
  const add = (s: string) => setLog((l) => [...l, s]);

  async function stage(s: "collect" | "analyze" | "digest") {
    if (s === "collect") {
      add("Collecting from communities…");
      const r = await api("/api/pipeline?stage=collect");
      const per = r.perSource as Record<string, { fetched: number; kept: number; error?: string }>;
      add(`Collected ${r.inserted} new and ${r.updated} updated posts (last ${r.lookbackDays} days). ` + Object.entries(per).map(([k, v]) => `${k}: ${v.kept}${v.error ? " (error)" : ""}`).join(", "));
      for (const l of (r.log as string[]) ?? []) add(`  note: ${l}`);
    }
    if (s === "analyze") {
      let last = Infinity;
      for (let i = 0; i < 20; i++) {
        add(i === 0 ? "Analysing posts with Gemini…" : "Continuing analysis…");
        const r = await api("/api/pipeline?stage=analyze");
        add(`  ${r.analyzed} analysed with ${r.model}, ${r.remaining} left${(r.errors as string[])?.length ? `; ${(r.errors as string[])[0]}` : ""}`);
        const remaining = Number(r.remaining);
        if (!remaining || Number(r.analyzed) === 0 || remaining >= last) break;
        last = remaining;
      }
    }
    if (s === "digest") {
      add("Writing the brief…");
      const r = await api(`/api/pipeline?stage=digest&week=${week}`);
      add(`Brief written: “${r.headline}”. ${r.themes} themes.${(r.changes as string[])?.length ? ` Added: ${(r.changes as string[]).join(", ")}` : ""}`);
    }
  }

  async function run(stages: ("collect" | "analyze" | "digest")[]) {
    setBusy(true); setLog([]);
    try {
      for (const s of stages) await stage(s);
      add("Done. Open the brief to see the result.");
      onDone();
    } catch (e) {
      add(`Stopped: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <section>
      <h2 className="font-display text-2xl font-bold">Run the pipeline</h2>
      <p className="mb-4 max-w-[75ch] text-sm text-muted">
        Runs automatically: collection and analysis every night, and the brief every Friday at 06:00 IST (00:30 UTC). {postCount.toLocaleString()} posts stored. AI model: {model}.
        {postCount === 0 && " The first collection backfills 21 days."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={!unlocked || busy} onClick={() => run(["collect", "analyze", "digest"])} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Run full pipeline</button>
        <button disabled={!unlocked || busy} onClick={() => run(["collect"])} className="rounded-md border border-line bg-surface px-3 py-2 text-sm disabled:opacity-40">Collect only</button>
        <button disabled={!unlocked || busy} onClick={() => run(["analyze"])} className="rounded-md border border-line bg-surface px-3 py-2 text-sm disabled:opacity-40">Analyse only</button>
        <button disabled={!unlocked || busy} onClick={() => run(["digest"])} className="rounded-md border border-line bg-surface px-3 py-2 text-sm disabled:opacity-40">Write brief only</button>
        <label className="ml-2 text-sm text-muted">
          Brief for{" "}
          <select value={week} onChange={(e) => setWeek(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-ink">
            {weeks.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </label>
      </div>
      {log.length > 0 && (
        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-ink p-4 text-[13px] leading-relaxed text-white/90">{log.join("\n")}{busy ? "\n…" : ""}</pre>
      )}
      {runs.length > 0 && (
        <ul className="mt-4 text-sm text-muted">
          {runs.slice(0, 5).map((r) => (
            <li key={r.id}>
              {r.stage} {timeAgo(r.started_at)}: {r.ok === null ? "running or timed out" : r.ok ? "ok" : `failed (${r.error?.slice(0, 120)})`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TopicEditor({ topic, api, unlocked, onSaved }: { topic?: Topic; api: Api; unlocked: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(topic?.name ?? "");
  const [description, setDescription] = useState(topic?.description ?? "");
  const [keywords, setKeywords] = useState((topic?.keywords ?? []).join(", "));
  const [tags, setTags] = useState((topic?.tags ?? []).join(", "));
  const [active, setActive] = useState(topic?.active ?? true);
  const [status, setStatus] = useState<string | null>(null);

  async function save(extra: Record<string, unknown> = {}) {
    setStatus("Saving…");
    try {
      await api("/api/admin/topics", { action: "upsert", slug: topic?.slug, name, description, keywords, tags, active, retag: true, ...extra });
      setStatus("Saved"); onSaved();
      if (!topic) { setName(""); setDescription(""); setKeywords(""); setTags(""); setOpen(false); }
    } catch (e) { setStatus((e as Error).message); }
  }
  async function remove() {
    if (!topic || !confirm(`Delete “${topic.name}”? Collected posts stay in the database.`)) return;
    try { await api("/api/admin/topics", { action: "delete", slug: topic.slug }); onSaved(); } catch (e) { setStatus((e as Error).message); }
  }

  if (!topic && !open) {
    return <button disabled={!unlocked} onClick={() => setOpen(true)} className="rounded-md border border-dashed border-line px-4 py-3 text-sm text-muted hover:text-ink disabled:opacity-40">Add a topic</button>;
  }

  return (
    <div className={`panel p-4 ${topic && !active ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        {topic ? (
          <button onClick={() => setOpen(!open)} className="text-left">
            <span className="font-semibold">{topic.name}</span>
            {topic.origin === "ai" && <span className="ml-2 rounded bg-amber-soft px-1.5 py-0.5 text-xs text-amber">added by AI</span>}
            <span className="ml-2 text-sm text-muted">{topic.keywords.length} keywords, {topic.tags.length} tags{!topic.active ? ", paused" : ""}</span>
          </button>
        ) : <span className="font-semibold">New topic</span>}
        {topic && (
          <label className="ml-auto inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} disabled={!unlocked} onChange={(e) => { setActive(e.target.checked); void save({ active: e.target.checked }); }} />
            Monitored
          </label>
        )}
        {topic && <button onClick={() => setOpen(!open)} className="text-sm text-cobalt underline">{open ? "Close" : "Edit"}</button>}
      </div>
      {open && (
        <div className="mt-4 grid gap-3">
          <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-line px-3 py-2" /></Field>
          <Field label="What it covers (helps the AI decide what's relevant)"><input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-md border border-line px-3 py-2" /></Field>
          <Field label="Keywords, comma-separated"><textarea value={keywords} onChange={(e) => setKeywords(e.target.value)} rows={3} className="w-full rounded-md border border-line px-3 py-2" /></Field>
          <Field label="Stack Overflow tags, comma-separated (optional)"><input value={tags} onChange={(e) => setTags(e.target.value)} className="w-full rounded-md border border-line px-3 py-2" placeholder="github-actions, code-review" /></Field>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={!unlocked} onClick={() => save()} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{topic ? "Save topic" : "Add topic"}</button>
            {topic && <button disabled={!unlocked} onClick={remove} className="text-sm text-rise underline disabled:opacity-40">Delete topic</button>}
            {!topic && <button onClick={() => setOpen(false)} className="text-sm text-muted underline">Cancel</button>}
            {status && <span className="text-sm text-muted">{status}</span>}
          </div>
          <p className="text-xs text-muted">Saving also tags already-collected posts from the last 60 days that contain these keywords.</p>
        </div>
      )}
    </div>
  );
}

function SourceEditor({ source, api, unlocked, onSaved }: { source: Source; api: Api; unlocked: boolean; onSaved: () => void }) {
  const [json, setJson] = useState(JSON.stringify(source.config, null, 2));
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  async function save(patch: Record<string, unknown>) {
    setStatus("Saving…");
    try { await api("/api/admin/sources", { id: source.id, ...patch }); setStatus("Saved"); onSaved(); } catch (e) { setStatus((e as Error).message); }
  }
  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">{source.name}</span>
        <label className="ml-auto inline-flex items-center gap-2 text-sm">
          <input type="checkbox" defaultChecked={source.enabled} disabled={!unlocked} onChange={(e) => save({ enabled: e.target.checked })} /> Collect
        </label>
        <button onClick={() => setOpen(!open)} className="text-sm text-cobalt underline">{open ? "Close" : "Settings"}</button>
        {status && <span className="text-sm text-muted">{status}</span>}
      </div>
      {open && (
        <div className="mt-3">
          <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={6} className="w-full rounded-md border border-line px-3 py-2 font-mono text-[13px]" spellCheck={false} />
          <button disabled={!unlocked} onClick={() => { try { void save({ config: JSON.parse(json) }); } catch { setStatus("That isn't valid JSON."); } }} className="mt-2 rounded-md bg-ink px-3 py-1.5 text-sm text-white disabled:opacity-40">Save settings</button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-sm"><span className="text-muted">{label}</span>{children}</label>;
}

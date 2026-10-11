"use client";

import { useState } from "react";
import { sourceLabel } from "@/lib/labels";
import type { DeepDive as Dive } from "@/lib/deepdive";

export function DeepDive({ topic, week, keyword, initial }: { topic: string; week: string; keyword: string | null; initial: Dive | null }) {
  const [dive, setDive] = useState<Dive | null>(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(refresh = false) {
    setOpen(true);
    if (dive && !refresh) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/deepdive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, week, keyword, refresh }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Deep dive failed");
      setDive(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">AI deep dive</h2>
          <p className="text-sm text-muted">Root causes, tool gaps and product angles, written by Gemini from this week&apos;s posts{keyword ? ` mentioning “${keyword}”` : ""}.</p>
        </div>
        <div className="ml-auto flex gap-2">
          {!open && <button onClick={() => run()} className="rounded-md bg-cobalt px-4 py-2 text-sm font-medium text-white">{dive ? "Show deep dive" : "Run deep dive"}</button>}
          {open && dive && <button onClick={() => run(true)} disabled={busy} className="rounded-md border border-line px-3 py-2 text-sm">Refresh</button>}
          {open && <button onClick={() => setOpen(false)} className="rounded-md border border-line px-3 py-2 text-sm">Hide</button>}
        </div>
      </div>

      {open && busy && <p className="mt-4 text-sm text-muted">Reading up to 70 posts… usually 10–20 seconds.</p>}
      {open && err && <p className="mt-4 text-sm text-rise">{err}</p>}
      {open && dive && !busy && (
        <div className="reveal mt-5 grid gap-6 md:grid-cols-2">
          <p className="rounded-lg bg-cobalt-soft px-4 py-3 font-display text-[18px] leading-snug md:col-span-2">{dive.tldr}</p>
          <Block title="What's happening" items={dive.whats_happening} />
          <Block title="Root causes" items={dive.root_causes} />
          <Block title="Where existing tools fall short" items={dive.tool_gaps} />
          <Block title="What our product could do or say" items={dive.opportunities} accent />
          {dive.objections.length > 0 && <Block title="Objections this could raise in demos" items={dive.objections} />}
          {dive.who && (
            <div>
              <h3 className="mb-1.5 font-semibold">Who&apos;s hurting</h3>
              <p className="text-[15px] leading-relaxed">{dive.who}</p>
            </div>
          )}
          {dive.evidence.length > 0 && (
            <div className="md:col-span-2">
              <h3 className="mb-1.5 font-semibold">Evidence</h3>
              <ul className="space-y-2 text-[15px]">
                {dive.evidence.map((e) => (
                  <li key={e.url}>
                    <a href={e.url} target="_blank" rel="noreferrer" className="text-cobalt underline">{e.title}</a>
                    <span className="text-muted"> ({sourceLabel(e.source)})</span>
                    <div className="text-sm text-muted">{e.why}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted md:col-span-2">Based on {dive.posts_read} posts. Generated {new Date(dive.generated_at).toLocaleString()}.</p>
        </div>
      )}
    </section>
  );
}

function Block({ title, items, accent }: { title: string; items: string[]; accent?: boolean }) {
  if (!items?.length) return null;
  return (
    <div className={accent ? "rounded-md bg-amber-soft p-3" : ""}>
      <h3 className="mb-1.5 font-semibold">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-[15px] leading-relaxed">
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}

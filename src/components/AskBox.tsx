"use client";

import { useState } from "react";
import { sourceLabel } from "@/lib/labels";

type Answer = { answer: string; sources: { title: string; url: string; source: string }[] };

export function AskBox({ week, topic: fixedTopic, topics, suggestions }: { week: string; topic?: string; topics?: { slug: string; name: string }[]; suggestions: string[] }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState("");
  const topic = fixedTopic ?? (picked || undefined);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Answer | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function ask(question: string) {
    if (!question.trim()) return;
    setQ(question); setBusy(true); setErr(null); setRes(null);
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, week, topic }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The question could not be answered.");
      setRes(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {topics && (
          <select value={picked} onChange={(e) => setPicked(e.target.value)} aria-label="Topic" className="rounded-md border border-line bg-surface px-3 py-2.5 text-[14px]">
            <option value="">All topics</option>
            {topics.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
          </select>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(q)}
          placeholder={topic ? "Ask about this topic's posts this week" : "Ask about this week's posts"}
          className="flex-1 rounded-md border border-line bg-surface px-3 py-2.5 text-[15px] placeholder:text-muted"
          maxLength={400}
        />
        <button onClick={() => ask(q)} disabled={busy || !q.trim()} className="rounded-md bg-cobalt px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Reading posts…" : "Ask"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button key={s} onClick={() => ask(s)} disabled={busy} className="rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-muted hover:text-ink">
            {s}
          </button>
        ))}
      </div>
      {err && <p className="mt-3 text-sm text-rise">{err}</p>}
      {res && (
        <div className="reveal mt-5 rounded-lg bg-paper px-4 py-4 ring-1 ring-line">
          <p className="max-w-[70ch] leading-relaxed">{res.answer}</p>
          {res.sources.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {res.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-cobalt underline">{s.title}</a>
                  <span className="text-muted"> ({sourceLabel(s.source)})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

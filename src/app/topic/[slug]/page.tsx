import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isConfigured } from "@/lib/supabase";
import { getTopicDetail, weekOptions, type TopicDetail } from "@/lib/data";
import { currentWeek, weekLabel } from "@/lib/week";
import { sourceLabel } from "@/lib/labels";
import { Delta, Stat } from "@/components/bits";
import { KeywordBars, TopicTrend } from "@/components/Charts";
import { WeekPicker } from "@/components/WeekPicker";
import { DeepDive } from "@/components/DeepDive";
import { AskBox } from "@/components/AskBox";
import { Setup } from "@/components/Setup";
import type { DeepDive as Dive } from "@/lib/deepdive";

export const dynamic = "force-dynamic";

export default async function TopicPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ week?: string; kw?: string }> }) {
  if (!isConfigured()) return <Setup reason="env" />;
  const { slug } = await params;
  const { week, kw } = await searchParams;
  const d = await getTopicDetail(slug, week, kw);
  if (!d) notFound();

  const labels = Object.fromEntries(weekOptions().map((w) => [w, weekLabel(w) + (w === currentWeek() ? " (so far)" : "")]));
  const href = (k?: string) => `/topic/${slug}?week=${d.week}${k ? `&kw=${encodeURIComponent(k)}` : ""}`;
  const kwChart = d.keywords.filter((k) => k.mentions || k.prev).slice(0, 10);

  return (
    <div className="space-y-10">
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link href={`/?week=${d.week}`} className="text-sm text-cobalt underline">Back to the brief</Link>
          <div className="ml-auto"><Suspense><WeekPicker week={d.week} options={weekOptions()} labels={labels} /></Suspense></div>
        </div>
        <p className="text-[15px] text-muted">{weekLabel(d.week)}</p>
        <h1 className="mt-1 font-display text-[clamp(30px,4vw,44px)] font-bold leading-tight tracking-[-0.02em]">
          {d.topic.name}
          {d.keyword && <span className="text-muted">: “{d.keyword}”</span>}
        </h1>
        {d.topic.description && <p className="mt-2 max-w-[70ch] text-[17px] text-muted">{d.topic.description}</p>}

        <div className="mt-5 flex flex-wrap gap-2" role="list" aria-label="Filter by keyword">
          <Link href={href()} className={`rounded-full border px-3 py-1 text-sm ${!d.keyword ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink"}`}>
            All keywords
          </Link>
          {d.keywords.map((k) => (
            <Link key={k.keyword} href={href(k.keyword)} className={`rounded-full border px-3 py-1 text-sm ${d.keyword === k.keyword ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink"}`}>
              {k.keyword} <span className={d.keyword === k.keyword ? "text-white/70" : "text-muted"}>{k.mentions}</span>
            </Link>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-6 border-y border-line py-6 md:grid-cols-4">
        <Stat value={d.stats.mentions} label="posts this week" sub={<><Delta pct={d.stats.deltaPct} prev={d.stats.prev} cur={d.stats.mentions} /> <span className="text-muted">vs {d.stats.prev}</span></>} />
        <Stat value={d.stats.painPct === null ? "—" : `${d.stats.painPct}%`} label="describe a pain point" />
        <Stat value={d.stats.negativePct === null ? "—" : `${d.stats.negativePct}%`} label="negative in tone" />
        <Stat value={d.stats.unresolvedPct === null ? "—" : `${d.stats.unresolvedPct}%`} label="still unresolved" sub={<span className="text-muted">{d.stats.analyzed} analysed by AI</span>} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-4">
          <h2 className="mb-1 font-semibold">Eight weeks</h2>
          <p className="mb-3 text-sm text-muted">Posts, unresolved posts and average mood.</p>
          <TopicTrend data={d.series} />
        </div>
        <div className="panel p-4">
          <h2 className="mb-1 font-semibold">Keywords</h2>
          <p className="mb-3 text-sm text-muted">Exact keyword counts, this week vs last.</p>
          {kwChart.length ? <KeywordBars data={kwChart} /> : <p className="text-sm text-muted">No keyword matches this week.</p>}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <h2 className="font-display text-2xl font-bold">Pain point themes</h2>
          <p className="mb-3 text-sm text-muted">Grouped by the weekly brief.</p>
          {d.themes.length ? (
            <ul className="panel divide-y divide-line">
              {d.themes.map((t) => (
                <li key={t.theme} className="flex gap-4 px-4 py-3">
                  <span className="num w-8 shrink-0 text-right text-xl font-bold">{t.mentions}</span>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold">{t.theme}</span>
                      <span className="text-sm text-muted">{t.prev_mentions} last week</span>
                      {t.underserved && <span className="rounded bg-amber-soft px-1.5 py-0.5 text-xs font-medium text-amber">underserved</span>}
                    </div>
                    {t.summary && <p className="mt-0.5 text-sm text-muted">{t.summary}</p>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="panel p-4 text-sm text-muted">No themes for this topic yet. They are written with the Friday brief.</p>}
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold">In their words</h2>
          <p className="mb-3 text-sm text-muted">Most frequent pain points, as summarised per post.</p>
          {d.topPainPoints.length ? (
            <ul className="panel divide-y divide-line">
              {d.topPainPoints.map((p) => (
                <li key={p.text} className="flex gap-3 px-4 py-2.5 text-[15px]"><span className="num w-6 text-right font-bold">{p.n}</span>{p.text}</li>
              ))}
            </ul>
          ) : <p className="panel p-4 text-sm text-muted">Pain points appear after AI analysis runs.</p>}
          {d.sources.length > 0 && (
            <p className="mt-4 text-sm text-muted">
              Sources this week: {d.sources.map((s) => `${sourceLabel(s.source)} ${s.mentions}`).join(", ")}
            </p>
          )}
        </div>
      </section>

      <DeepDive topic={slug} week={d.week} keyword={d.keyword} initial={(d.deepDive as Dive | null) ?? null} />

      <section>
        <h2 className="font-display text-2xl font-bold">Posts</h2>
        <p className="mb-3 text-sm text-muted">Pain points first, then by engagement. {d.stats.mentions} this week.</p>
        <ul className="panel divide-y divide-line">
          {d.posts.slice(0, 12).map((p) => <PostItem key={p.id} p={p} />)}
          {d.posts.length === 0 && <li className="px-4 py-6 text-sm text-muted">No posts for this {d.keyword ? "keyword" : "topic"} in this week.</li>}
        </ul>
        {d.posts.length > 12 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-cobalt underline">Show {d.posts.length - 12} more</summary>
            <ul className="panel mt-2 divide-y divide-line">{d.posts.slice(12).map((p) => <PostItem key={p.id} p={p} />)}</ul>
          </details>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl font-bold">Ask about {d.topic.name.toLowerCase()}</h2>
        <p className="mb-3 text-sm text-muted">Answers come from this topic&apos;s posts for the selected week.</p>
        <AskBox week={d.week} topic={slug} suggestions={["What do people blame for this?", "Which tools are named and why?", "Is anything getting better?"]} />
      </section>
    </div>
  );
}

function PostItem({ p }: { p: TopicDetail["posts"][number] }) {
  return (
    <li className="px-4 py-3">
      <a href={p.url} target="_blank" rel="noreferrer" className="font-medium hover:text-cobalt hover:underline">{p.title}</a>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span>{sourceLabel(p.source)}</span>
        <span>{new Date(p.posted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
        <span>{p.score} points, {p.comments} replies</span>
        {p.sentiment_label && (
          <span className={p.sentiment_label === "negative" ? "text-rise" : p.sentiment_label === "positive" ? "text-ease" : ""}>{p.sentiment_label}</span>
        )}
        {p.unresolved && <span className="rounded bg-paper px-1.5 py-0.5 text-xs text-ink ring-1 ring-line">unresolved</span>}
        {p.answered && <span className="text-xs">answered</span>}
      </div>
      {p.pain_point && <p className="mt-1 text-sm">Pain point: {p.pain_point}</p>}
    </li>
  );
}

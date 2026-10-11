import Link from "next/link";
import { Suspense } from "react";
import { isConfigured } from "@/lib/supabase";
import { getOverview, weekOptions, type Overview } from "@/lib/data";
import { weekLabel, currentWeek } from "@/lib/week";
import { sourceLabel } from "@/lib/labels";
import { CompareBar, Delta, Mood, Sparkline, Stat, timeAgo } from "@/components/bits";
import { SourceBars, TrendLines } from "@/components/Charts";
import { WeekPicker } from "@/components/WeekPicker";
import { AskBox } from "@/components/AskBox";
import { Setup } from "@/components/Setup";

export const dynamic = "force-dynamic";

export default async function BriefPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  if (!isConfigured()) return <Setup reason="env" />;
  const { week: weekParam } = await searchParams;
  let o: Overview;
  try {
    o = await getOverview(weekParam);
  } catch (e) {
    return <Setup reason="schema" detail={(e as Error).message} />;
  }
  if (!o.topics.length) return <Setup reason="topics" />;

  const names = Object.fromEntries(o.topics.map((t) => [t.slug, t.name]));
  const labels = Object.fromEntries(weekOptions().map((w) => [w, weekLabel(w) + (w === currentWeek() ? " (so far)" : "")]));
  const maxMentions = Math.max(1, ...o.summaries.flatMap((s) => [s.mentions, s.prev]));
  const fallback = fallbackBrief(o, names);
  const headline = o.digest?.headline ?? fallback.headline;
  const bullets = o.digest?.bullets?.length ? o.digest.bullets : fallback.bullets;
  const top5 = o.summaries.slice(0, 5).map((s) => s.slug);
  const trend = o.weeks.map((w) => ({ week: w, ...Object.fromEntries(o.summaries.filter((s) => top5.includes(s.slug)).map((s) => [s.slug, s.series.find((x) => x.week === w)?.mentions ?? 0])) }));
  const q = (slug: string) => `/topic/${slug}?week=${o.week}`;

  if (o.totals.total === 0 && o.summaries.every((s) => s.prev === 0)) return <Setup reason="data" lastRun={o.lastRun} />;

  return (
    <div className="space-y-12">
      {/* The brief */}
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="text-[15px] text-muted">
            Brief for {weekLabel(o.week)}
            {o.isCurrent ? ", week still in progress" : ""}
            {o.digest ? `, written ${timeAgo(o.digest.generated_at)}` : ""}
          </p>
          <div className="ml-auto">
            <Suspense><WeekPicker week={o.week} options={weekOptions()} labels={labels} /></Suspense>
          </div>
        </div>
        <h1 className="reveal max-w-[24ch] font-display text-[clamp(30px,4.6vw,50px)] font-bold leading-[1.06] tracking-[-0.02em]">{headline}</h1>
        <ul className="mt-6 max-w-[70ch] space-y-2.5 text-[17px] leading-relaxed">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-3"><span aria-hidden className="mt-[11px] h-[3px] w-3 shrink-0 bg-rise" />{b}</li>
          ))}
        </ul>
        {o.digest?.watch && (
          <p className="mt-5 max-w-[70ch] rounded-md bg-surface px-4 py-3 text-[15px] ring-1 ring-line">
            <span className="font-semibold">For Monday&apos;s sprint planning: </span>{o.digest.watch}
          </p>
        )}
        {!o.digest && (
          <p className="mt-5 text-sm text-muted">
            The AI-written brief for this week isn&apos;t ready yet, so these lines are computed from the counts. It&apos;s written every Friday morning, or{" "}
            <Link href="/settings" className="text-cobalt underline">run it now</Link>.
          </p>
        )}
      </section>

      {/* Numbers */}
      <section className="grid grid-cols-2 gap-6 border-y border-line py-6 md:grid-cols-4">
        <Stat value={o.totals.total} label="posts about our problem space" sub={<><Delta pct={o.totals.deltaPct} prev={o.totals.prev} cur={o.totals.total} /> <span className="text-muted">vs {o.totals.prev}</span></>} />
        <Stat value={o.totals.painPct === null ? "—" : `${o.totals.painPct}%`} label="describe a real pain point" />
        <Stat value={o.totals.negativePct === null ? "—" : `${o.totals.negativePct}%`} label="negative in tone" sub={o.totals.prevNegativePct !== null && o.totals.negativePct !== null ? <span className="text-muted">{o.totals.prevNegativePct}% last week</span> : undefined} />
        <Stat value={o.totals.unresolvedPct === null ? "—" : `${o.totals.unresolvedPct}%`} label="still unresolved" />
      </section>

      {/* Topic board */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="font-display text-2xl font-bold">Topics</h2>
          <p className="text-sm text-muted">Bar is this week, tick is last week. Select a topic for charts, posts and a deep dive.</p>
        </div>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="border-b border-line text-sm text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Topic</th>
                <th className="w-[30%] px-4 py-2.5 font-medium">Posts</th>
                <th className="px-4 py-2.5 font-medium">Change</th>
                <th className="px-4 py-2.5 font-medium">8 weeks</th>
                <th className="px-4 py-2.5 font-medium">Mood</th>
                <th className="px-4 py-2.5 font-medium">Unresolved</th>
              </tr>
            </thead>
            <tbody>
              {o.summaries.map((s) => {
                const t = o.topics.find((x) => x.slug === s.slug)!;
                return (
                  <tr key={s.slug} className="group border-b border-line last:border-0 hover:bg-paper/60">
                    <td className="px-4 py-3">
                      <Link href={q(s.slug)} className="font-semibold group-hover:text-cobalt group-hover:underline">{t.name}</Link>
                      {t.origin === "ai" && <span className="ml-2 rounded bg-amber-soft px-1.5 py-0.5 text-xs text-amber">added by AI</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="num w-9 text-right text-lg font-bold">{s.mentions}</span>
                        <CompareBar cur={s.mentions} prev={s.prev} max={maxMentions} />
                      </div>
                    </td>
                    <td className="px-4 py-3"><Delta pct={s.deltaPct} prev={s.prev} cur={s.mentions} /></td>
                    <td className="px-4 py-3"><Sparkline values={s.series.map((x) => x.mentions)} /></td>
                    <td className="px-4 py-3"><Mood value={s.avgSentiment} /></td>
                    <td className="px-4 py-3 text-sm">{s.unresolvedPct === null ? "—" : `${s.unresolvedPct}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pain themes + sources */}
      <section className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="font-display text-2xl font-bold">Recurring pain points</h2>
          <p className="mb-4 text-sm text-muted">Similar complaints grouped into one theme. Count is posts this week.</p>
          {o.themes.length === 0 ? (
            <p className="panel p-4 text-sm text-muted">Themes appear once the weekly brief has run for this week.</p>
          ) : (
            <ol className="panel divide-y divide-line">
              {o.themes.slice(0, 10).map((t) => (
                <li key={t.theme} className="flex gap-4 px-4 py-3">
                  <span className="num w-8 shrink-0 text-right text-xl font-bold">{t.mentions}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {t.topic_slug ? (
                        <Link href={q(t.topic_slug)} className="font-semibold hover:text-cobalt hover:underline">{t.theme}</Link>
                      ) : <span className="font-semibold">{t.theme}</span>}
                      <Delta pct={t.prev_mentions === 0 ? (t.mentions ? null : 0) : Math.round(((t.mentions - t.prev_mentions) / t.prev_mentions) * 100)} prev={t.prev_mentions} />
                      {t.underserved && <span className="rounded bg-amber-soft px-1.5 py-0.5 text-xs font-medium text-amber">underserved</span>}
                    </div>
                    {t.summary && <p className="mt-0.5 text-sm text-muted">{t.summary}</p>}
                    <p className="mt-0.5 text-xs text-muted">{t.unresolved} unresolved, {t.prev_mentions} last week</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold">Where it&apos;s said</h2>
          <p className="mb-4 text-sm text-muted">Matched posts per community.</p>
          <div className="panel p-3">
            <SourceBars data={o.sources.map((s) => ({ name: sourceLabel(s.source), thisWeek: s.mentions, lastWeek: s.prev }))} />
          </div>
        </div>
      </section>

      {/* Trend */}
      <section>
        <h2 className="font-display text-2xl font-bold">Eight-week trend</h2>
        <p className="mb-4 text-sm text-muted">Posts per week for the five busiest topics.</p>
        <div className="panel p-4"><TrendLines data={trend} keys={top5} names={names} /></div>
      </section>

      {/* Ask */}
      <section>
        <h2 className="font-display text-2xl font-bold">Ask this week&apos;s data</h2>
        <p className="mb-4 text-sm text-muted">Gemini answers from the stored posts only and links its sources.</p>
        <AskBox week={o.week} suggestions={["What are teams saying about false positives?", "Which complaints have no good tool today?", "What objections might come up in demos?"]} />
      </section>

      <footer className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-5 text-sm text-muted">
        {o.lastRun && <span>Last pipeline run: {o.lastRun.stage}, {timeAgo(o.lastRun.started_at)}{o.lastRun.ok === false ? " (failed)" : ""}</span>}
        {o.pending > 0 && <span>{o.pending} posts waiting for AI analysis</span>}
        {o.changes.length > 0 && (
          <span>
            Recently added by AI:{" "}
            {o.changes.slice(0, 4).map((c) => `“${c.keyword}”`).join(", ")}{" "}
            <Link href="/settings" className="text-cobalt underline">review</Link>
          </span>
        )}
      </footer>
    </div>
  );
}

function fallbackBrief(o: Overview, names: Record<string, string>) {
  const rising = [...o.summaries].filter((s) => s.mentions >= 3).sort((a, b) => (b.deltaPct ?? 999) - (a.deltaPct ?? 999))[0];
  const falling = [...o.summaries].filter((s) => s.prev >= 3 && (s.deltaPct ?? 0) < 0).sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0))[0];
  const top = o.summaries[0];
  const bullets: string[] = [];
  if (top) bullets.push(`${names[top.slug]} was the busiest topic with ${top.mentions} posts (${top.prev} last week).`);
  if (rising && rising.slug !== top?.slug) bullets.push(`${names[rising.slug]} grew to ${rising.mentions} posts from ${rising.prev}.`);
  if (falling) bullets.push(`${names[falling.slug]} cooled to ${falling.mentions} posts from ${falling.prev}.`);
  if (o.totals.unresolvedPct !== null) bullets.push(`${o.totals.unresolvedPct}% of analysed posts describe a problem that is still unresolved.`);
  return {
    headline: top ? `${o.totals.total} developer posts touched our problem space; ${names[top.slug].toLowerCase()} led with ${top.mentions}.` : "No posts collected for this week yet.",
    bullets,
  };
}

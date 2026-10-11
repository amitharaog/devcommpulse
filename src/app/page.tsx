import Link from "next/link";
import { Suspense } from "react";
import { isConfigured } from "@/lib/supabase";
import { getOverview, weekOptions, type Overview } from "@/lib/data";
import { weekLabel } from "@/lib/week";
import { sourceLabel } from "@/lib/labels";
import { Delta } from "@/components/bits";
import { Donut, TrendLines, SERIES } from "@/components/Charts";
import { WeekPicker } from "@/components/WeekPicker";
import { Setup } from "@/components/Setup";
import { Card, Kpi, Page, PageHeader, Badge, Empty, Freshness } from "@/components/ui";
import { ThemesTable } from "@/components/ThemesTable";
import { TopicsTable } from "@/components/TopicsTable";
import { topicRows, weekLabels } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  if (!isConfigured()) return <Setup reason="env" />;
  const { week: weekParam } = await searchParams;
  let o: Overview;
  try {
    o = await getOverview(weekParam);
  } catch (e) {
    return <Setup reason="schema" detail={(e as Error).message} />;
  }
  if (!o.topics.length) return <Setup reason="topics" />;
  if (o.totals.total === 0 && o.summaries.every((s) => s.prev === 0)) return <Setup reason="data" lastRun={o.lastRun} />;

  const names = Object.fromEntries(o.topics.map((t) => [t.slug, t.name]));
  const fallback = fallbackBrief(o, names);
  const headline = o.digest?.headline ?? fallback.headline;
  const bullets = o.digest?.bullets?.length ? o.digest.bullets : fallback.bullets;
  const top5 = o.summaries.slice(0, 5).map((s) => s.slug);
  const trend = o.weeks.map((w) => ({ week: w, ...Object.fromEntries(o.summaries.filter((s) => top5.includes(s.slug)).map((s) => [s.slug, s.series.find((x) => x.week === w)?.mentions ?? 0])) }));
  const k = o.kpiSeries;
  const rising = o.summaries.filter((s) => s.mentions >= 3 && (s.deltaPct === null || s.deltaPct > 0)).sort((a, b) => (b.deltaPct ?? 999) - (a.deltaPct ?? 999)).slice(0, 4);
  const easing = o.summaries.filter((s) => s.prev >= 3 && (s.deltaPct ?? 0) < 0).sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0)).slice(0, 3);
  const q = (slug: string) => `/topic/${slug}?week=${o.week}`;
  const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={<>Week of {weekLabel(o.week)}{o.isCurrent ? " (in progress)" : ""}, compared with {weekLabel(o.prevWeek)}</>}
        actions={<>
          <Freshness iso={o.digest?.generated_at ?? o.lastRun?.started_at} label={o.digest ? "Brief written" : "Data updated"} />
          <Suspense><WeekPicker week={o.week} options={weekOptions()} labels={weekLabels()} /></Suspense>
        </>}
      />
      <Page>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Kpi label="Posts in our problem space" value={o.totals.total} spark={k.map((x) => x.total)}
            delta={<Delta pct={o.totals.deltaPct} prev={o.totals.prev} cur={o.totals.total} />} foot={<span>vs {o.totals.prev} last week</span>} />
          <Kpi label="Describe a pain point" value={o.totals.painPct ?? "—"} unit={o.totals.painPct === null ? undefined : "%"} tone="bad"
            spark={k.map((x) => pctOf(x.pain, x.analyzed))} foot={<span>{o.totals.pain} posts</span>} />
          <Kpi label="Negative in tone" value={o.totals.negativePct ?? "—"} unit={o.totals.negativePct === null ? undefined : "%"} tone="bad"
            spark={k.map((x) => pctOf(x.negative, x.analyzed))} foot={o.totals.prevNegativePct !== null ? <span>{o.totals.prevNegativePct}% last week</span> : undefined} />
          <Kpi label="Still unresolved" value={o.totals.unresolvedPct ?? "—"} unit={o.totals.unresolvedPct === null ? undefined : "%"} tone="bad"
            spark={k.map((x) => pctOf(x.unresolved, x.analyzed))} foot={<span>{o.totals.unresolved} posts with no fix in sight</span>} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="This week's brief" action={<Badge tone="cobalt">{o.digest ? "Written by Gemini" : "Computed from counts"}</Badge>}>
            <p className="reveal max-w-[60ch] font-display text-[23px] font-bold leading-snug tracking-[-0.01em]">{headline}</p>
            <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed">
              {bullets.map((b, i) => <li key={i} className="flex gap-3"><span aria-hidden className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-rise" />{b}</li>)}
            </ul>
            {o.digest?.watch && (
              <div className="mt-5 rounded-lg bg-cobalt-soft px-4 py-3 text-[14.5px]">
                <span className="font-semibold">For Monday&apos;s sprint planning: </span>{o.digest.watch}
              </div>
            )}
            {!o.digest && <p className="mt-4 text-[13px] text-muted">The AI brief for this week isn&apos;t written yet. It runs Friday morning, or <Link href="/settings" className="text-cobalt underline">run it now</Link>.</p>}
          </Card>

          <Card title="Biggest movers" subtitle="Change in posts vs last week">
            <h3 className="mb-2 text-[12.5px] font-medium text-muted">Rising</h3>
            {rising.length ? (
              <ul className="space-y-2">
                {rising.map((s) => (
                  <li key={s.slug} className="flex items-center gap-3 text-[14px]">
                    <Link href={q(s.slug)} className="min-w-0 flex-1 leading-snug hover:text-cobalt hover:underline">{names[s.slug]}</Link>
                    <span className="num text-[14px] font-bold">{s.mentions}</span>
                    <span className="w-16 text-right"><Delta pct={s.deltaPct} /></span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-muted">Nothing rising this week.</p>}
            <h3 className="mb-2 mt-5 text-[12.5px] font-medium text-muted">Easing</h3>
            {easing.length ? (
              <ul className="space-y-2">
                {easing.map((s) => (
                  <li key={s.slug} className="flex items-center gap-3 text-[14px]">
                    <Link href={q(s.slug)} className="min-w-0 flex-1 leading-snug hover:text-cobalt hover:underline">{names[s.slug]}</Link>
                    <span className="num text-[14px] font-bold">{s.mentions}</span>
                    <span className="w-16 text-right"><Delta pct={s.deltaPct} /></span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-muted">Nothing easing this week.</p>}
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="Posts per week" subtitle="Five busiest topics over eight weeks" action={<Link href={`/topics?week=${o.week}`} className="text-cobalt hover:underline">All topics</Link>}>
            <TrendLines data={trend} keys={top5} names={names} />
          </Card>
          <Card title="Where it's discussed" subtitle="Share of this week's posts" action={<Link href={`/sources?week=${o.week}`} className="text-cobalt hover:underline">Sources</Link>}>
            {o.sources.some((s) => s.mentions) ? (
              <>
                <Donut data={o.sources.filter((s) => s.mentions).map((s) => ({ name: sourceLabel(s.source), value: s.mentions }))} />
                <ul className="mt-3 space-y-1.5 text-[13.5px]">
                  {o.sources.filter((s) => s.mentions).map((s, i) => (
                    <li key={s.source} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} aria-hidden />
                      <span className="flex-1">{sourceLabel(s.source)}</span>
                      <span className="num font-bold">{s.mentions}</span>
                      <span className="w-14 text-right"><Delta pct={s.prev ? Math.round(((s.mentions - s.prev) / s.prev) * 100) : null} /></span>
                    </li>
                  ))}
                </ul>
              </>
            ) : <Empty>No posts this week yet.</Empty>}
          </Card>
        </div>

        <Card flush title="Top pain points" subtitle="Similar complaints grouped into themes by Gemini" action={<Link href={`/pain-points?week=${o.week}`} className="text-cobalt hover:underline">View all {o.themes.length}</Link>}>
          {o.themes.length ? <ThemesTable themes={o.themes.slice(0, 6)} names={names} week={o.week} />
            : <div className="px-5 pb-5"><Empty>Themes appear once the weekly brief has run for this week.</Empty></div>}
        </Card>

        <Card flush title="Topics at a glance" subtitle="Bar shows this week; the tick marks last week. Click a column to sort." action={<Link href={`/topics?week=${o.week}`} className="text-cobalt hover:underline">Open topics</Link>}>
          <TopicsTable rows={topicRows(o)} week={o.week} compact />
        </Card>

        {(o.pending > 0 || o.changes.length > 0) && (
          <p className="text-[13px] text-muted">
            {o.pending > 0 && <>{o.pending} posts are waiting for AI analysis. </>}
            {o.changes.length > 0 && <>Recently added by AI: {o.changes.slice(0, 4).map((c) => `“${c.keyword}”`).join(", ")}. <Link href="/settings" className="text-cobalt underline">Review</Link></>}
          </p>
        )}
      </Page>
    </>
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

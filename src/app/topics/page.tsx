import Link from "next/link";
import { Suspense } from "react";
import { isConfigured } from "@/lib/supabase";
import { getOverview, weekOptions } from "@/lib/data";
import { weekLabel } from "@/lib/week";
import { fallbackBrief, topicRows, weekLabels } from "@/lib/view";
import { Setup } from "@/components/Setup";
import { WeekPicker } from "@/components/WeekPicker";
import { Badge, Card, Kpi, Page, PageHeader } from "@/components/ui";
import { Delta } from "@/components/bits";
import { TrendLines } from "@/components/Charts";
import { Heatmap } from "@/components/Heatmap";
import { TopicsTable } from "@/components/TopicsTable";

export const dynamic = "force-dynamic";

export default async function TopicsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  if (!isConfigured()) return <Setup reason="env" />;
  const { week } = await searchParams;
  const o = await getOverview(week);
  const rows = topicRows(o);
  const names = Object.fromEntries(o.topics.map((t) => [t.slug, t.name]));
  const fallback = fallbackBrief(o, names);
  const headline = o.digest?.headline ?? fallback.headline;
  const bullets = o.digest?.bullets?.length ? o.digest.bullets : fallback.bullets;
  const k = o.kpiSeries;
  const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const top5 = o.summaries.slice(0, 5).map((s) => s.slug);
  const trend = o.weeks.map((w) => ({ week: w, ...Object.fromEntries(o.summaries.filter((s) => top5.includes(s.slug)).map((s) => [s.slug, s.series.find((x) => x.week === w)?.mentions ?? 0])) }));
  const rising = o.summaries.filter((s) => s.mentions >= 3 && (s.deltaPct === null || s.deltaPct > 0)).sort((a, b) => (b.deltaPct ?? 999) - (a.deltaPct ?? 999)).slice(0, 4);
  const easing = o.summaries.filter((s) => s.prev >= 3 && (s.deltaPct ?? 0) < 0).sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0)).slice(0, 3);
  const q = (slug: string) => `/topic/${slug}?week=${o.week}`;
  const mover = (s: (typeof rising)[number]) => (
    <li key={s.slug} className="flex items-center gap-3 text-[14px]">
      <Link href={q(s.slug)} className="min-w-0 flex-1 leading-snug hover:text-cobalt hover:underline">{names[s.slug]}</Link>
      <span className="num text-[14px] font-bold">{s.mentions}</span>
      <span className="w-20 text-right">{s.prev < 20 ? <span className="text-[13px] text-muted">from {s.prev}</span> : <Delta pct={s.deltaPct} />}</span>
    </li>
  );

  return (
    <>
      <PageHeader
        title="Topics & trends"
        subtitle={<>Week of {weekLabel(o.week)}</>}
        actions={<Suspense><WeekPicker week={o.week} options={weekOptions()} labels={weekLabels()} /></Suspense>}
      />
      <Page>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Kpi label="Posts this week" value={o.totals.total} spark={k.map((x) => x.total)}
            delta={<Delta pct={o.totals.deltaPct} prev={o.totals.prev} cur={o.totals.total} />} foot={<span>vs {o.totals.prev}</span>} />
          <Kpi label="Pain points" value={o.totals.painPct ?? "—"} unit={o.totals.painPct === null ? undefined : "%"} tone="bad"
            spark={k.map((x) => pctOf(x.pain, x.analyzed))} foot={<span>{o.totals.pain} posts</span>} />
          <Kpi label="Negative tone" value={o.totals.negativePct ?? "—"} unit={o.totals.negativePct === null ? undefined : "%"} tone="bad"
            spark={k.map((x) => pctOf(x.negative, x.analyzed))} foot={o.totals.prevNegativePct !== null ? <span>{o.totals.prevNegativePct}% last week</span> : undefined} />
          <Kpi label="Unresolved" value={o.totals.unresolvedPct ?? "—"} unit={o.totals.unresolvedPct === null ? undefined : "%"} tone="bad"
            spark={k.map((x) => pctOf(x.unresolved, x.analyzed))} foot={<span>{o.totals.unresolved} posts</span>} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="What moved this week" action={<Badge tone={o.digest?.bullets?.length ? "cobalt" : "neutral"}>{o.digest?.bullets?.length ? "From the Friday brief" : "Computed from counts"}</Badge>}>
            <p className="max-w-[60ch] text-[17px] font-semibold leading-snug">{headline}</p>
            <ul className="mt-3 space-y-2 text-[14.5px] leading-relaxed">
              {bullets.map((b, i) => <li key={i} className="flex gap-3"><span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />{b}</li>)}
            </ul>
          </Card>
          <Card title="Biggest movers">
            <h3 className="mb-2 text-[12.5px] font-medium text-muted">Rising</h3>
            {rising.length ? <ul className="space-y-2">{rising.map(mover)}</ul> : <p className="text-[13px] text-muted">Nothing rising this week.</p>}
            <h3 className="mb-2 mt-5 text-[12.5px] font-medium text-muted">Easing</h3>
            {easing.length ? <ul className="space-y-2">{easing.map(mover)}</ul> : <p className="text-[13px] text-muted">Nothing easing this week.</p>}
          </Card>
        </div>

        <Card flush title="All topics">
          <TopicsTable rows={rows} week={o.week} />
        </Card>
        <Card title="Posts per week">
          <TrendLines data={trend} keys={top5} names={names} />
        </Card>
        <Card title="Eight-week heatmap">
          <Heatmap rows={rows.map((r) => ({ slug: r.slug, name: r.name, values: r.series }))} weeks={o.weeks} week={o.week} />
        </Card>
      </Page>
    </>
  );
}

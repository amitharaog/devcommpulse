import { Suspense } from "react";
import { isConfigured } from "@/lib/supabase";
import { getSourcesPage, weekOptions } from "@/lib/data";
import { weekLabel } from "@/lib/week";
import { weekLabels } from "@/lib/view";
import { sourceLabel } from "@/lib/labels";
import { Setup } from "@/components/Setup";
import { WeekPicker } from "@/components/WeekPicker";
import { Badge, Card, Empty, Freshness, Page, PageHeader } from "@/components/ui";
import { Delta, Sparkline } from "@/components/bits";
import { StackedWeeks } from "@/components/Charts";

export const dynamic = "force-dynamic";

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  if (!isConfigured()) return <Setup reason="env" />;
  const { week } = await searchParams;
  const d = await getSourcesPage(week);
  const names = Object.fromEntries(d.ids.map((id) => [id, sourceLabel(id)]));
  return (
    <>
      <PageHeader
        title="Sources"
        subtitle={<>Where the conversation happens, week of {weekLabel(d.week)}</>}
        actions={<>
          <Freshness iso={d.lastCollect?.started_at} label="Last collected" />
          <Suspense><WeekPicker week={d.week} options={weekOptions()} labels={weekLabels()} /></Suspense>
        </>}
      />
      <Page>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {d.bySource.map((s) => (
            <div key={s.id} className="card px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{sourceLabel(s.id)}</span>
                <span className="ml-auto"><Delta pct={s.deltaPct} prev={s.prev} cur={s.mentions} /></span>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="num text-[28px] font-bold leading-none">{s.mentions}</div>
                  <div className="mt-1 text-[13px] text-muted">posts, {s.painPct ?? 0}% describe pain</div>
                </div>
                <Sparkline values={s.spark} width={110} height={36} stroke="var(--color-cobalt)" area />
              </div>
            </div>
          ))}
          {!d.bySource.length && <Empty>No posts collected yet.</Empty>}
        </div>

        <Card title="Posts per week by community" subtitle="Stacked, so the total height is all matched posts">
          <StackedWeeks data={d.series} keys={d.ids} names={names} />
        </Card>

        <Card flush title="Collection status" subtitle="Result of the most recent collection run for each community">
          <div className="overflow-x-auto">
            <table className="tbl w-full min-w-[620px] text-[14px]">
              <thead><tr><th>Community</th><th>Collecting</th><th className="text-right">Fetched</th><th className="text-right">Matched a topic</th><th>Status</th></tr></thead>
              <tbody>
                {d.sources.map((s) => {
                  const r = d.perSource[s.id];
                  return (
                    <tr key={s.id}>
                      <td className="font-medium">{s.name}</td>
                      <td>{s.enabled ? <Badge tone="ease">On</Badge> : <Badge>Off</Badge>}</td>
                      <td className="text-right">{r ? r.fetched : "—"}</td>
                      <td className="text-right">{r ? r.kept : "—"}</td>
                      <td className="max-w-[340px] text-[13px]">
                        {!s.enabled ? <span className="text-muted">Turned off in Settings</span>
                          : !r ? <span className="text-muted">Not run yet</span>
                          : r.error ? <span className="text-rise">{r.error}</span>
                          : r.fetched === 0 ? <span className="text-amber">Returned nothing. The site may be blocking requests or down.</span>
                          : <span className="text-ease">Working</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[12.5px] text-muted">Stack Overflow and the other Stack Exchange sites are collected together. Source settings live in Settings.</p>
        </Card>
      </Page>
    </>
  );
}

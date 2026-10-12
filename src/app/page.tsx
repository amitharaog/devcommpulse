import Link from "next/link";
import { Suspense } from "react";
import { isConfigured } from "@/lib/supabase";
import { getBrief, weekOptions, type Brief } from "@/lib/data";
import { memoText } from "@/lib/decide";
import { pct } from "@/lib/stats";
import { weekLabel } from "@/lib/week";
import { weekLabels } from "@/lib/view";
import { Setup } from "@/components/Setup";
import { WeekPicker } from "@/components/WeekPicker";
import { CopyButton } from "@/components/CopyButton";
import { Badge, Card, Empty, Freshness, Page, PageHeader } from "@/components/ui";
import { CallRow, HeldList, HowCallsAreMade, RadarList } from "@/components/Memo";

export const dynamic = "force-dynamic";

export default async function BriefPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  if (!isConfigured()) return <Setup reason="env" />;
  const { week: weekParam } = await searchParams;
  let b: Brief;
  try {
    b = await getBrief(weekParam);
  } catch (e) {
    return <Setup reason="schema" detail={(e as Error).message} />;
  }
  if (b.totals.total === 0 && b.prevTotals.total === 0) return <Setup reason="data" lastRun={b.lastRun} />;

  const computed = b.callsSource === "computed";
  const memo = memoText({ weekLabel: weekLabel(b.week), headline: b.headline, calls: b.calls.map((x) => x.call), watch: b.watch, lean: b.decision, url: "{{url}}" });
  const need = Math.max(1, Math.min(3, b.weeksTracked));

  return (
    <>
      <PageHeader
        title="This week's calls"
        subtitle={<>Week of {weekLabel(b.week)} · {b.totals.total} developer posts · {b.communities} {b.communities === 1 ? "community" : "communities"}{b.isCurrent ? " · in progress, calls are made Friday morning" : ""}</>}
        actions={<>
          {b.calls.length > 0 && <Badge tone={computed ? "neutral" : "cobalt"}>{computed ? "Computed from counts" : "Written by Gemini"}</Badge>}
          <Freshness iso={b.digest?.generated_at ?? b.lastRun?.started_at} label={b.digest ? "Brief written" : "Data updated"} />
          <Suspense><WeekPicker week={b.week} options={weekOptions()} labels={weekLabels()} /></Suspense>
          {b.calls.length > 0 && <CopyButton text={memo} label="Copy memo" path={`/?week=${b.week}`} />}
        </>}
      />
      <Page>
        <section className="grid gap-4 lg:grid-cols-12">
          <div className={b.watch ? "lg:col-span-7" : "lg:col-span-12"}>
            <p className="line-clamp-2 max-w-[60ch] font-display text-[22px] font-bold leading-snug tracking-[-0.01em]">{b.headline}</p>
            <Pulse b={b} />
          </div>
          {b.watch && (
            <div className="rounded-xl bg-cobalt-soft px-4 py-3.5 lg:col-span-5">
              <div className="text-[11.5px] font-semibold uppercase tracking-wide text-cobalt">Ask in Monday&apos;s sprint planning</div>
              <p className="mt-1 line-clamp-3 text-[15.5px] font-semibold leading-snug">{b.watch}</p>
              {b.decision && <p className="mt-1 text-[13px] text-muted">Gemini leans {b.decision.lean}: {b.decision.because}</p>}
            </div>
          )}
        </section>

        <section aria-labelledby="calls">
          <div className="mb-2 flex items-baseline gap-3">
            <h2 id="calls" className="text-[13px] font-semibold uppercase tracking-wide text-muted">Calls for this week</h2>
            <a href="#how" className="ml-auto text-[13px] text-cobalt hover:underline">How calls are made ↓</a>
          </div>
          {!b.hasThemes ? (
            <Empty>
              Calls are made on Friday morning, when the week closes.{" "}
              <Link href={`/?week=${b.prevWeek}`} className="text-cobalt underline">See last week&apos;s calls →</Link>
            </Empty>
          ) : !b.calls.length ? (
            <Empty>
              No theme has enough evidence for a call this week.{" "}
              <Link href={`/pain-points?week=${b.week}`} className="text-cobalt underline">See all pain themes →</Link>
            </Empty>
          ) : (
            <>
              {b.weeksTracked === 1 && <p className="mb-2 text-[13px] text-muted">Only 1 week of history so far: build calls start once 2 weeks are tracked.</p>}
              <div className="card">
                <ol className="divide-y divide-line">
                  {b.calls.map(({ call, evidence }, i) => <CallRow key={call.theme} c={call} e={evidence} week={b.week} first={i === 0} computed={computed} />)}
                </ol>
              </div>
            </>
          )}
        </section>

        {(b.held.length > 0 || b.radar.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            {b.held.length > 0 && (
              <Card flush title="Last week's calls: did the signal hold?" subtitle="Posts this week vs last week for each call, counted the same way. Market signal, not attribution.">
                <HeldList held={b.held} week={b.week} />
              </Card>
            )}
            {b.radar.length > 0 && (
              <Card flush title="Also on the radar" className={b.held.length ? "" : "lg:col-span-2"}
                action={<Link href={`/pain-points?week=${b.week}`} className="text-cobalt hover:underline">All {b.themeCount} pain themes →</Link>}>
                <RadarList items={b.radar} week={b.week} />
              </Card>
            )}
          </div>
        )}

        <footer className="space-y-3 border-t border-line pt-4">
          <p className="text-[13px] leading-relaxed text-muted">{b.coverage}</p>
          <HowCallsAreMade th={b.th} need={need} />
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]" aria-label="More detail">
            <Link href={`/topics?week=${b.week}`} className="text-cobalt hover:underline">Topics &amp; trends →</Link>
            <Link href={`/pain-points?week=${b.week}`} className="text-cobalt hover:underline">Pain themes →</Link>
            <Link href={`/sources?week=${b.week}`} className="text-cobalt hover:underline">Sources →</Link>
          </nav>
        </footer>
      </Page>
    </>
  );
}

/** Three facts under the headline: volume, how much is pain, how much is still unresolved. */
function Pulse({ b }: { b: Brief }) {
  const cur = b.totals, prev = b.prevTotals;
  const arrow = (up: boolean) => <span className={up ? "text-rise" : "text-ease"}>{up ? "▲" : "▼"}</span>;
  const posts = prev.total >= 20
    ? <>{cur.total} posts {cur.total !== prev.total && <>{arrow(cur.total > prev.total)} {Math.abs(Math.round(((cur.total - prev.total) / prev.total) * 100))}%</>} vs {prev.total}</>
    : prev.total === 0 ? <>{cur.total} posts (new)</> : <>{cur.total} posts ({cur.total >= prev.total ? "+" : ""}{cur.total - prev.total} vs {prev.total})</>;
  const facts: React.ReactNode[] = [posts];
  if (!cur.analyzed) facts.push("analysis pending");
  else {
    const unres = pct(cur.unresolved, cur.analyzed)!, prevUnres = pct(prev.unresolved, prev.analyzed);
    const pts = prevUnres === null ? null : unres - prevUnres;
    facts.push(<>{pct(cur.pain, cur.analyzed)}% describe a problem</>);
    facts.push(<>{unres}% unresolved{pts ? <> {arrow(pts > 0)} {Math.abs(pts)} pts</> : null}</>);
  }
  return (
    <p className="mt-2 flex flex-wrap gap-x-2 text-[14px] text-muted">
      {facts.map((f, i) => <span key={i}>{i > 0 && <span aria-hidden className="mr-2">·</span>}{f}</span>)}
    </p>
  );
}

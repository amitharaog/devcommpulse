import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isConfigured } from "@/lib/supabase";
import { getTopicDetail, weekOptions } from "@/lib/data";
import { weekLabel } from "@/lib/week";
import { weekLabels } from "@/lib/view";
import { sourceLabel } from "@/lib/labels";
import { Delta } from "@/components/bits";
import { Donut, KeywordBars, SERIES, TopicTrend } from "@/components/Charts";
import { WeekPicker } from "@/components/WeekPicker";
import { DeepDive } from "@/components/DeepDive";
import { AskBox } from "@/components/AskBox";
import { Setup } from "@/components/Setup";
import { PostsTable } from "@/components/PostsTable";
import { Badge, Card, Empty, Kpi, Page, PageHeader, Tabs } from "@/components/ui";
import type { DeepDive as Dive } from "@/lib/deepdive";

export const dynamic = "force-dynamic";

const TABS = ["overview", "keywords", "posts", "deep-dive"] as const;
type Tab = (typeof TABS)[number];

export default async function TopicPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ week?: string; kw?: string; tab?: string }> }) {
  if (!isConfigured()) return <Setup reason="env" />;
  const { slug } = await params;
  const { week, kw, tab: tabParam } = await searchParams;
  const d = await getTopicDetail(slug, week, kw);
  if (!d) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";
  const link = (t: Tab, k = d.keyword) => `/topic/${slug}?week=${d.week}${k ? `&kw=${encodeURIComponent(k)}` : ""}${t !== "overview" ? `&tab=${t}` : ""}`;
  const k = d.series;

  return (
    <>
      <PageHeader
        crumbs={[{ href: `/topics?week=${d.week}`, label: "Topics" }]}
        title={<>{d.topic.name}{d.topic.origin === "ai" && <span className="ml-3 align-middle"><Badge tone="amber">Added by AI</Badge></span>}</>}
        subtitle={d.topic.description || undefined}
        actions={<Suspense><WeekPicker week={d.week} options={weekOptions()} labels={weekLabels()} /></Suspense>}
      />
      <Tabs active={tab} tabs={[
        { key: "overview", label: "Overview", href: link("overview") },
        { key: "keywords", label: "Keywords", href: link("keywords"), count: d.topic.keywords.length },
        { key: "posts", label: "Posts", href: link("posts"), count: d.stats.mentions },
        { key: "deep-dive", label: "Deep dive", href: link("deep-dive") },
      ]} />
      <Page>
        {d.keyword && (
          <div className="flex items-center gap-2 text-[14px]">
            Filtered to keyword <Badge tone="cobalt">{d.keyword}</Badge>
            <Link href={link(tab, null)} className="text-cobalt hover:underline">Clear filter</Link>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Kpi label="Posts this week" value={d.stats.mentions} spark={k.map((x) => x.mentions)}
            delta={<Delta pct={d.stats.deltaPct} prev={d.stats.prev} cur={d.stats.mentions} />} foot={<span>vs {d.stats.prev} last week</span>} />
          <Kpi label="Describe a pain point" value={d.stats.painPct ?? "—"} unit={d.stats.painPct === null ? undefined : "%"} tone="bad" />
          <Kpi label="Negative in tone" value={d.stats.negativePct ?? "—"} unit={d.stats.negativePct === null ? undefined : "%"} tone="bad" spark={k.map((x) => x.negativePct ?? 0)} />
          <Kpi label="Still unresolved" value={d.stats.unresolvedPct ?? "—"} unit={d.stats.unresolvedPct === null ? undefined : "%"} tone="bad"
            spark={k.map((x) => x.unresolved)} foot={<span>{d.stats.analyzed} analysed by AI</span>} />
        </div>

        {tab === "overview" && (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2" title="Eight-week trend" subtitle="Posts, unresolved posts and average mood (−1 to +1)">
                <TopicTrend data={d.series} />
              </Card>
              <Card title="Where it's discussed" subtitle="This week's posts by community">
                {d.sources.length ? (
                  <>
                    <Donut data={d.sources.map((s) => ({ name: sourceLabel(s.source), value: s.mentions }))} />
                    <ul className="mt-3 space-y-1.5 text-[13.5px]">
                      {d.sources.map((s, i) => (
                        <li key={s.source} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} aria-hidden />
                          <span className="flex-1">{sourceLabel(s.source)}</span><span className="num font-bold">{s.mentions}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : <Empty>No posts this week.</Empty>}
              </Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Pain point themes" subtitle="Grouped by the weekly brief" action={<Link href={`/pain-points?week=${d.week}`} className="text-cobalt hover:underline">All pain points</Link>}>
                {d.themes.length ? (
                  <ul className="divide-y divide-line">
                    {d.themes.map((t) => (
                      <li key={t.theme} className="flex gap-3 py-2.5">
                        <span className="num w-9 shrink-0 text-right text-[18px] font-bold">{t.mentions}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 font-medium">{t.theme}{t.underserved && <Badge tone="amber">Underserved</Badge>}</div>
                          <div className="text-[12.5px] text-muted">{t.prev_mentions} last week, {t.unresolved} unresolved</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <Empty>No themes yet. They are written with the Friday brief.</Empty>}
              </Card>
              <Card title="In their words" subtitle="Most frequent pain points this week">
                {d.topPainPoints.length ? (
                  <ul className="space-y-2.5">
                    {d.topPainPoints.map((p) => {
                      const max = d.topPainPoints[0].n;
                      return (
                        <li key={p.text} className="text-[14px]">
                          <div className="flex justify-between gap-3"><span className="first-letter:uppercase">{p.text}</span><span className="num font-bold">{p.n}</span></div>
                          <div className="mt-1 h-1.5 rounded-full bg-paper"><div className="h-full rounded-full bg-rise/70" style={{ width: `${(p.n / max) * 100}%` }} /></div>
                        </li>
                      );
                    })}
                  </ul>
                ) : <Empty>Pain points appear after AI analysis runs.</Empty>}
              </Card>
            </div>
          </>
        )}

        {tab === "keywords" && (
          <div className="grid gap-4 lg:grid-cols-5">
            <Card flush className="lg:col-span-3" title="Keyword performance" subtitle="Exact matches this week vs last. Select a keyword to filter every tab.">
              <div className="overflow-x-auto">
                <table className="tbl w-full min-w-[480px] text-[14px]">
                  <thead><tr><th>Keyword</th><th className="text-right">This week</th><th className="text-right">Last week</th><th>Change</th><th /></tr></thead>
                  <tbody>
                    {d.keywords.map((x) => (
                      <tr key={x.keyword}>
                        <td className="font-medium">{x.keyword}</td>
                        <td className="num text-right text-[15px] font-bold">{x.mentions}</td>
                        <td className="text-right text-muted">{x.prev}</td>
                        <td>{x.mentions || x.prev ? <Delta pct={x.prev ? Math.round(((x.mentions - x.prev) / x.prev) * 100) : null} /> : <span className="text-[13px] text-muted">—</span>}</td>
                        <td className="text-right">
                          {d.keyword === x.keyword
                            ? <Link href={link("keywords", null)} className="text-[13px] text-muted hover:underline">Clear</Link>
                            : <Link href={link("posts", x.keyword)} className="text-[13px] text-cobalt hover:underline">View posts</Link>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card className="lg:col-span-2" title="Top keywords" subtitle="This week vs last">
              {d.keywords.some((x) => x.mentions || x.prev) ? <KeywordBars data={d.keywords.filter((x) => x.mentions || x.prev).slice(0, 8)} /> : <Empty>No keyword matches this week.</Empty>}
            </Card>
          </div>
        )}

        {tab === "posts" && (
          <Card flush title="Posts" subtitle={`Every post matched to this topic in the week of ${weekLabel(d.week)}${d.posts.length < d.stats.mentions ? ` (showing the top ${d.posts.length})` : ""}`}>
            <PostsTable posts={d.posts} />
          </Card>
        )}

        {tab === "deep-dive" && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-5 lg:col-span-2">
              <DeepDive topic={slug} week={d.week} keyword={d.keyword} initial={(d.deepDive as Dive | null) ?? null} />
            </div>
            <Card title={`Ask about ${d.topic.name.toLowerCase()}`} subtitle="Answers come from this topic's posts for the selected week.">
              <AskBox week={d.week} topic={slug} suggestions={["What do people blame for this?", "Which tools are named and why?", "Is anything getting better?"]} />
            </Card>
          </div>
        )}
      </Page>
    </>
  );
}

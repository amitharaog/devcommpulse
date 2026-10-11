import { Suspense } from "react";
import { isConfigured } from "@/lib/supabase";
import { getOverview, weekOptions } from "@/lib/data";
import { weekLabel } from "@/lib/week";
import { topicRows, weekLabels } from "@/lib/view";
import { Setup } from "@/components/Setup";
import { WeekPicker } from "@/components/WeekPicker";
import { Card, Page, PageHeader } from "@/components/ui";
import { Heatmap } from "@/components/Heatmap";
import { TopicsTable } from "@/components/TopicsTable";

export const dynamic = "force-dynamic";

export default async function TopicsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  if (!isConfigured()) return <Setup reason="env" />;
  const { week } = await searchParams;
  const o = await getOverview(week);
  const rows = topicRows(o);
  return (
    <>
      <PageHeader
        title="Topics"
        subtitle={<>{o.topics.length} monitored topic categories, week of {weekLabel(o.week)}. Edit them in Settings.</>}
        actions={<Suspense><WeekPicker week={o.week} options={weekOptions()} labels={weekLabels()} /></Suspense>}
      />
      <Page>
        <Card flush title="All topics" subtitle="Click a column to sort, or a topic for charts, keywords, posts and a deep dive.">
          <TopicsTable rows={rows} week={o.week} />
        </Card>
        <Card title="Eight-week heatmap" subtitle="Posts per topic per week. Spot what's heating up at a glance.">
          <Heatmap rows={rows.map((r) => ({ slug: r.slug, name: r.name, values: r.series }))} weeks={o.weeks} week={o.week} />
        </Card>
      </Page>
    </>
  );
}

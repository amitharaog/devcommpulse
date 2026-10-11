import { Suspense } from "react";
import { isConfigured } from "@/lib/supabase";
import { getTopics } from "@/lib/config";
import { resolveWeek, weekOptions } from "@/lib/data";
import { weekLabel } from "@/lib/week";
import { weekLabels } from "@/lib/view";
import { Setup } from "@/components/Setup";
import { WeekPicker } from "@/components/WeekPicker";
import { Card, Page, PageHeader } from "@/components/ui";
import { AskBox } from "@/components/AskBox";

export const dynamic = "force-dynamic";

export default async function AskPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  if (!isConfigured()) return <Setup reason="env" />;
  const { week: wp } = await searchParams;
  const [week, topics] = await Promise.all([resolveWeek(wp), getTopics()]);
  return (
    <>
      <PageHeader
        title="Ask AI"
        subtitle={<>Questions are answered by Gemini Flash from the posts collected in the week of {weekLabel(week)}, with links to sources</>}
        actions={<Suspense><WeekPicker week={week} options={weekOptions()} labels={weekLabels()} /></Suspense>}
      />
      <Page>
        <Card title="Ask a question" subtitle="Narrow it to one topic for sharper answers.">
          <AskBox
            week={week}
            topics={topics.filter((t) => t.active).map((t) => ({ slug: t.slug, name: t.name }))}
            suggestions={[
              "What are teams saying about false positives?",
              "Which complaints have no good tool today?",
              "What objections might come up in demos?",
              "What changed most compared with last week?",
            ]}
          />
        </Card>
      </Page>
    </>
  );
}

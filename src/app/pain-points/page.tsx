import Link from "next/link";
import { Suspense } from "react";
import { isConfigured } from "@/lib/supabase";
import { getPainPage, weekOptions } from "@/lib/data";
import { weekLabel } from "@/lib/week";
import { weekLabels } from "@/lib/view";
import { Setup } from "@/components/Setup";
import { WeekPicker } from "@/components/WeekPicker";
import { Card, Empty, Kpi, Page, PageHeader } from "@/components/ui";
import { ThemesTable } from "@/components/ThemesTable";

export const dynamic = "force-dynamic";

export default async function PainPointsPage({ searchParams }: { searchParams: Promise<{ week?: string; filter?: string }> }) {
  if (!isConfigured()) return <Setup reason="env" />;
  const { week, filter } = await searchParams;
  const d = await getPainPage(week);
  const names = Object.fromEntries(d.topics.map((t) => [t.slug, t.name]));
  const underserved = d.themes.filter((t) => t.underserved);
  const high = d.themes.filter((t) => t.priority.tier === "High");
  const shown = filter === "underserved" ? underserved : filter === "high" ? high : d.themes;
  const seg = (key: string | undefined, label: string) => (
    <Link href={`/pain-points?week=${d.week}${key ? `&filter=${key}` : ""}`}
      className={`rounded px-2.5 py-1 ${filter === key || (!filter && !key) ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>{label}</Link>
  );
  return (
    <>
      <PageHeader
        title="Pain points"
        subtitle={<>Week of {weekLabel(d.week)}, ranked by priority for Sumit</>}
        actions={<Suspense><WeekPicker week={d.week} options={weekOptions()} labels={weekLabels()} /></Suspense>}
      />
      <Page>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Kpi label="Pain point posts" value={d.totalPain} />
          <Kpi label="Themes" value={d.themes.length} />
          <Kpi label="High priority" value={high.length} tone="bad" />
          <Kpi label="Underserved" value={underserved.length} tone="bad" />
        </div>
        <Card flush title="Themes"
          action={<div className="flex rounded-md border border-line bg-paper p-0.5 text-[13px]">{seg(undefined, "All")}{seg("high", "High priority")}{seg("underserved", "Underserved")}</div>}>
          {shown.length ? <ThemesTable themes={shown} names={names} week={d.week} history />
            : <div className="px-5 pb-5"><Empty>No themes for this week yet. They are written with the Friday brief.</Empty></div>}
        </Card>
        <Card flush title="In developers' words">
          {d.phrases.length ? (
            <div className="overflow-x-auto">
              <table className="tbl w-full min-w-[640px] text-[14px]">
                <thead><tr><th>Pain point</th><th>Main topic</th><th className="text-right">Posts</th><th className="text-right">Unresolved</th><th className="text-right">Blocking</th></tr></thead>
                <tbody>
                  {d.phrases.map((p) => (
                    <tr key={p.text}>
                      <td className="first-letter:uppercase">{p.text}</td>
                      <td className="text-[13px]">{p.topic ? <Link href={`/topic/${p.topic}?week=${d.week}`} className="text-cobalt hover:underline">{names[p.topic] ?? p.topic}</Link> : "—"}</td>
                      <td className="num text-right text-[15px] font-bold">{p.n}</td>
                      <td className="text-right">{p.unresolved}</td>
                      <td className="text-right" title="Severity 3: blocks work or makes people switch tools">{p.severe}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="px-5 pb-5"><Empty>Pain points appear after AI analysis runs.</Empty></div>}
        </Card>
      </Page>
    </>
  );
}

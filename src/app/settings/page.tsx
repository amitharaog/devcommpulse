import { isConfigured, db } from "@/lib/supabase";
import { getSources, getTopics } from "@/lib/config";
import { lastCompleteWeek, currentWeek, weekLabel } from "@/lib/week";
import { Setup } from "@/components/Setup";
import { SettingsClient } from "@/components/SettingsClient";
import { Page, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!isConfigured()) return <Setup reason="env" />;
  let topics, sources;
  try {
    [topics, sources] = await Promise.all([getTopics(), getSources()]);
  } catch (e) {
    return <Setup reason="schema" detail={(e as Error).message} />;
  }
  const [{ data: changes }, { data: runs }, { count: postCount }] = await Promise.all([
    db().from("keyword_changes").select("*").order("created_at", { ascending: false }).limit(20),
    db().from("runs").select("*").order("started_at", { ascending: false }).limit(8),
    db().from("posts").select("id", { count: "exact", head: true }),
  ]);
  const weeks = [lastCompleteWeek(), currentWeek()].map((w) => ({ value: w, label: weekLabel(w) + (w === currentWeek() ? " (so far)" : "") }));

  return (
    <>
      <PageHeader title="Settings" subtitle="Topics and keywords live in Supabase, so changes apply from the next collection run, with no code changes." />
      <Page>
        <SettingsClient
          topics={topics}
          sources={sources}
          changes={changes ?? []}
          runs={runs ?? []}
          postCount={postCount ?? 0}
          weeks={weeks}
          geminiModel={process.env.GEMINI_MODEL || "gemini-3.6-flash"}
        />
      </Page>
    </>
  );
}

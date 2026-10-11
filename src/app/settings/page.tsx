import { isConfigured, db } from "@/lib/supabase";
import { getSources, getTopics } from "@/lib/config";
import { lastCompleteWeek, currentWeek, weekLabel } from "@/lib/week";
import { Setup } from "@/components/Setup";
import { SettingsClient } from "@/components/SettingsClient";

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
    <div className="space-y-4">
      <h1 className="font-display text-4xl font-bold tracking-tight">Topics &amp; sources</h1>
      <p className="max-w-[70ch] text-[17px] text-muted">
        Topics and keywords live in Supabase, so changes here apply from the next collection run, with no code changes.
        The Friday brief can also add keywords it sees developers using; those are marked and listed below.
      </p>
      <SettingsClient
        topics={topics}
        sources={sources}
        changes={changes ?? []}
        runs={runs ?? []}
        postCount={postCount ?? 0}
        weeks={weeks}
        geminiModel={process.env.GEMINI_MODEL || "gemini-3.6-flash"}
      />
    </div>
  );
}

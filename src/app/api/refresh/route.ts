import { db, logRun } from "@/lib/supabase";
import { collect } from "@/lib/pipeline/collect";
import { analyze } from "@/lib/pipeline/analyze";
import { digest } from "@/lib/pipeline/digest";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const COOLDOWN_MS = 15 * 60_000; // collect and digest run at most once per 15 minutes from the public button
const RUNNING_MS = 5 * 60_000; // a run younger than the function timeout with no result is still in progress
const MAX_ANALYZE_RUNS = 8; // per cooldown window, so repeated clicks can't keep spending Gemini quota

/** Most recent run of a stage started within the window, if any. */
async function recentRun(stage: string, withinMs: number, inProgressOnly = false) {
  let q = db().from("runs").select("started_at, ok").eq("stage", stage)
    .gte("started_at", new Date(Date.now() - withinMs).toISOString());
  if (inProgressOnly) q = q.is("ok", null);
  const { data } = await q.order("started_at", { ascending: false }).limit(1);
  return data?.[0] as { started_at: string; ok: boolean | null } | undefined;
}

async function countRuns(stage: string, withinMs: number) {
  const { count } = await db().from("runs").select("id", { count: "exact", head: true }).eq("stage", stage)
    .gte("started_at", new Date(Date.now() - withinMs).toISOString());
  return count ?? 0;
}

/**
 * Public "Check for new data": POST /api/refresh?stage=collect|analyze|digest.
 * No passcode, so each stage is rate-limited here rather than trusted to the button.
 */
export async function POST(req: Request) {
  const stage = new URL(req.url).searchParams.get("stage");
  try {
    if (stage === "collect") {
      const last = await recentRun("collect", COOLDOWN_MS);
      if (last) return Response.json({ skipped: true, lastRunAt: last.started_at });
      return Response.json(await logRun("collect", () => collect({ budgetMs: 120_000 })));
    }
    if (stage === "analyze") {
      const running = await recentRun("analyze", RUNNING_MS, true);
      if (running) return Response.json({ skipped: true, lastRunAt: running.started_at });
      if ((await countRuns("analyze", COOLDOWN_MS)) >= MAX_ANALYZE_RUNS) return Response.json({ skipped: true, limit: true });
      return Response.json(await logRun("analyze", () => analyze({ budgetMs: 100_000 })));
    }
    if (stage === "digest") {
      const last = await recentRun("digest", COOLDOWN_MS);
      if (last) return Response.json({ skipped: true, lastRunAt: last.started_at });
      return Response.json(await logRun("digest", () => digest()));
    }
    return Response.json({ error: "stage must be collect, analyze or digest" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

import { isCron, unauthorized } from "@/lib/auth";
import { logRun } from "@/lib/supabase";
import { collect } from "@/lib/pipeline/collect";
import { analyze } from "@/lib/pipeline/analyze";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Daily: collect the last 8 days (sources like Lobsters only expose recent pages), then enrich with Gemini. */
export async function GET(req: Request) {
  if (!isCron(req)) return unauthorized();
  const started = Date.now();
  const c = await logRun("collect", () => collect({ budgetMs: 110_000 }));
  const a = await logRun("analyze", () => analyze({ budgetMs: 280_000 - (Date.now() - started) }));
  return Response.json({ collect: c, analyze: a });
}

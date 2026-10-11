import { isCron, unauthorized } from "@/lib/auth";
import { logRun } from "@/lib/supabase";
import { collect } from "@/lib/pipeline/collect";
import { analyze } from "@/lib/pipeline/analyze";
import { digest } from "@/lib/pipeline/digest";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Friday morning: final collection for the week that just ended, enrichment, then the brief. */
export async function GET(req: Request) {
  if (!isCron(req)) return unauthorized();
  const started = Date.now();
  const c = await logRun("collect", () => collect({ budgetMs: 70_000 }));
  const a = await logRun("analyze", () => analyze({ budgetMs: 200_000 - (Date.now() - started) }));
  const d = await logRun("digest", () => digest({ notify: true }));
  return Response.json({ collect: c, analyze: a, digest: d });
}

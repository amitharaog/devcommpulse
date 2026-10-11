import { isAdmin, unauthorized } from "@/lib/auth";
import { logRun } from "@/lib/supabase";
import { collect } from "@/lib/pipeline/collect";
import { analyze } from "@/lib/pipeline/analyze";
import { digest } from "@/lib/pipeline/digest";
import { isWeek } from "@/lib/week";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Manual runs from the dashboard: POST /api/pipeline?stage=collect|analyze|digest[&week=YYYY-MM-DD][&days=N] */
export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const url = new URL(req.url);
  const stage = url.searchParams.get("stage");
  const week = url.searchParams.get("week");
  const days = Number(url.searchParams.get("days")) || undefined;
  try {
    if (stage === "collect") return Response.json(await logRun("collect", () => collect({ lookbackDays: days, budgetMs: 120_000 })));
    if (stage === "analyze") return Response.json(await logRun("analyze", () => analyze({ budgetMs: 100_000 })));
    if (stage === "digest")
      return Response.json(await logRun("digest", () => digest({ week: isWeek(week) ? week : undefined, notify: url.searchParams.get("notify") === "1" })));
    return Response.json({ error: "stage must be collect, analyze or digest" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

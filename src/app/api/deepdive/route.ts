import { deepDive } from "@/lib/deepdive";
import { isWeek } from "@/lib/week";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { topic, week, keyword, refresh } = (await req.json().catch(() => ({}))) as Record<string, string | boolean | undefined>;
  if (typeof topic !== "string" || !isWeek(week as string)) return Response.json({ error: "topic and week are required" }, { status: 400 });
  try {
    return Response.json(await deepDive(topic, week as string, typeof keyword === "string" && keyword ? keyword : null, refresh === true));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

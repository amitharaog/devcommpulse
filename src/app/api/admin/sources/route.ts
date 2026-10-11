import { isAdmin, unauthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const { id, enabled, config } = (await req.json().catch(() => ({}))) as { id?: string; enabled?: boolean; config?: unknown };
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof enabled === "boolean") patch.enabled = enabled;
  if (config !== undefined) {
    if (typeof config !== "object" || config === null || Array.isArray(config)) return Response.json({ error: "Settings must be a JSON object" }, { status: 400 });
    patch.config = config;
  }
  const { error } = await db().from("sources").update(patch).eq("id", id);
  return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json({ ok: true });
}

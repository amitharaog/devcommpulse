import { isAdmin, unauthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { slugify } from "@/lib/match";

export const dynamic = "force-dynamic";

const list = (v: unknown) =>
  [...new Set((Array.isArray(v) ? v : String(v ?? "").split(","))
    .map((s) => String(s).toLowerCase().replace(/\s+/g, " ").trim()).filter((s) => s.length >= 2 && s.length <= 60))];

/** Create, update or delete a monitored topic. Changes take effect on the next collection run. */
export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;
  if (action === "check") return Response.json({ ok: true });
  if (action === "delete") {
    const { error } = await db().from("topics").delete().eq("slug", String(body.slug));
    return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json({ ok: true });
  }
  if (action === "upsert") {
    const name = String(body.name ?? "").trim();
    if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
    const keywords = list(body.keywords);
    if (!keywords.length) return Response.json({ error: "Add at least one keyword" }, { status: 400 });
    const row = {
      slug: body.slug ? String(body.slug) : slugify(name),
      name: name.slice(0, 80),
      description: String(body.description ?? "").slice(0, 300),
      keywords,
      tags: list(body.tags),
      active: body.active !== false,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db().from("topics").upsert(row, { onConflict: "slug" }).select().single();
    if (!error && body.retag) {
      const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
      for (const k of keywords) await db().rpc("retag_keyword", { p_slug: row.slug, p_keyword: k, p_since: since });
    }
    return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json(data);
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}

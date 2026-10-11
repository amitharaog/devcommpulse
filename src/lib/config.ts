import "server-only";
import { db } from "./supabase";
import type { Source, Topic } from "./types";

export async function getTopics(opts: { activeOnly?: boolean } = {}): Promise<Topic[]> {
  let q = db().from("topics").select("*").order("created_at");
  if (opts.activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Topic[];
}

export async function getSources(): Promise<Source[]> {
  const { data, error } = await db().from("sources").select("*").order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as Source[];
}

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function isConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Server-only client with the service role. Never import this from a client component. */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** Supabase caps a response at 1000 rows; this pages through everything. */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  pageSize = 1000,
  max = 20000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data: raw, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const data = raw as T[] | null;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}

export async function logRun<T>(stage: string, fn: () => Promise<T>): Promise<T> {
  const { data } = await db().from("runs").insert({ stage }).select("id").single();
  const id = data?.id as number | undefined;
  try {
    const result = await fn();
    if (id) await db().from("runs").update({ ok: true, finished_at: new Date().toISOString(), stats: result as object }).eq("id", id);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (id) await db().from("runs").update({ ok: false, finished_at: new Date().toISOString(), error: msg.slice(0, 2000) }).eq("id", id);
    throw e;
  }
}

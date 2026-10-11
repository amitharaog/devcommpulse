import "server-only";
import { timingSafeEqual } from "crypto";

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Vercel Cron sends "Authorization: Bearer $CRON_SECRET". */
export function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  return !!secret && same(auth, `Bearer ${secret}`);
}

export function isAdmin(req: Request): boolean {
  const pass = process.env.ADMIN_PASSCODE;
  const given = req.headers.get("x-admin-key") ?? "";
  return !!pass && same(given, pass);
}

export function unauthorized() {
  return Response.json({ error: "Not authorised. Enter the admin passcode on Topics & sources." }, { status: 401 });
}

import Link from "next/link";

type Reason = "env" | "schema" | "topics" | "data";

export function Setup({ reason, detail, lastRun }: { reason: Reason; detail?: string; lastRun?: { stage: string; started_at: string; ok: boolean | null; error?: string | null } | null }) {
  const steps: Record<Reason, { title: string; body: React.ReactNode }> = {
    env: {
      title: "Connect Supabase to start",
      body: <>Set <code>SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code>, <code>GEMINI_API_KEY</code>, <code>ADMIN_PASSCODE</code> and <code>CRON_SECRET</code> in Vercel → Settings → Environment Variables, then redeploy.</>,
    },
    schema: {
      title: "Create the database tables",
      body: <>Open Supabase → SQL Editor, paste <code>supabase/schema.sql</code> from the repository and run it. Then reload this page.{detail && <span className="mt-2 block text-sm text-muted">Error: {detail}</span>}</>,
    },
    topics: {
      title: "Add a topic to monitor",
      body: <>There are no active topics. Add one in the <code>topics</code> table in Supabase.</>,
    },
    data: {
      title: "Collect the first batch of posts",
      body: <>
        Posts are collected and analysed automatically every night. The first run backfills three weeks so week-over-week comparisons work straight away,
        and the brief is written every Friday morning. To load it now, open <Link className="text-cobalt underline" href="/settings">Settings</Link> and press <strong>Check for new data</strong>.
        {lastRun && <span className="mt-2 block text-sm text-muted">Last run: {lastRun.stage} {lastRun.ok === false ? `failed: ${lastRun.error}` : "finished"}.</span>}
      </>,
    },
  };
  const s = steps[reason];
  return (
    <main className="mx-auto max-w-[720px] px-5 py-16">
      <div className="card p-8">
        <h1 className="font-display text-[28px] font-bold tracking-tight">{s.title}</h1>
        <p className="mt-3 text-[16px] leading-relaxed">{s.body}</p>
      </div>
    </main>
  );
}

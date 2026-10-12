import Link from "next/link";
import type { PainTheme } from "@/lib/types";
import type { Priority, Tier } from "@/lib/priority";

type Item = PainTheme & { priority: Priority };

const TIER: Record<Tier, { dot: string; chip: string }> = {
  High: { dot: "bg-rise", chip: "bg-rise-soft text-rise ring-rise/15" },
  Medium: { dot: "bg-amber", chip: "bg-amber-soft text-amber ring-amber/15" },
  Low: { dot: "bg-faint", chip: "bg-paper text-muted ring-line" },
};

export function TierChip({ tier }: { tier: Tier }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ${TIER[tier].chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TIER[tier].dot}`} aria-hidden />{tier}
    </span>
  );
}

function Change({ pct, mentions }: { pct: number | null; mentions: number }) {
  if (pct === null) return <span className="text-rise">{mentions ? "new" : "—"}</span>;
  if (pct === 0) return <span className="text-muted">flat</span>;
  return <span className={pct > 0 ? "text-rise" : "text-ease"}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

/** Pain themes ranked by priority for Sumit, grouped High → Medium → Low. */
export function PriorityList({ items, names, week }: { items: Item[]; names: Record<string, string>; week: string }) {
  const tiers: Tier[] = ["High", "Medium", "Low"];
  let rank = 0;
  return (
    <div className="divide-y divide-line border-t border-line">
      <div className="hidden justify-end gap-5 px-5 py-2 text-[12px] text-muted sm:flex" aria-hidden>
        <span className="text-right">Posts</span><span className="w-[76px] text-right">Unresolved</span><span className="w-[64px] text-right">Score</span>
      </div>
      {tiers.map((tier) => {
        const group = items.filter((t) => t.priority.tier === tier);
        if (!group.length) return null;
        return (
          <section key={tier}>
            <h3 className="flex items-center gap-2 bg-[#fafbfd] px-5 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
              <span className={`h-2 w-2 rounded-full ${TIER[tier].dot}`} aria-hidden />{tier} priority<span className="font-normal normal-case tracking-normal">· {group.length}</span>
            </h3>
            <ol className="divide-y divide-line">
              {group.map((t) => {
                rank++;
                return (
                  <li key={t.theme} className="grid grid-cols-[28px_1fr] items-start gap-x-3 gap-y-2 px-5 py-3.5 sm:grid-cols-[28px_1fr_auto] sm:items-center">
                    <span className="num pt-0.5 text-[15px] font-bold text-faint">{rank}</span>
                    <div className="min-w-0">
                      <div className="font-medium leading-snug">{t.theme}</div>
                      {t.priority.why && <p className="mt-0.5 text-[13px] leading-snug text-muted">{t.priority.why}</p>}
                      {t.topic_slug && (
                        <Link href={`/topic/${t.topic_slug}?week=${week}`} className="mt-1 inline-block text-[12.5px] text-cobalt hover:underline">
                          {names[t.topic_slug] ?? t.topic_slug}
                        </Link>
                      )}
                    </div>
                    <dl className="col-start-2 flex items-center gap-5 text-[13px] sm:col-start-3">
                      <div className="text-right">
                        <dt className="mb-1 text-[11px] text-muted sm:sr-only">Posts</dt>
                        <dd className="num text-[17px] font-bold leading-none">{t.mentions}</dd>
                        <dd className="mt-1 whitespace-nowrap text-[12px]"><Change pct={t.priority.changePct} mentions={t.mentions} /></dd>
                      </div>
                      <div className="w-[76px] text-right">
                        <dt className="mb-1 text-[11px] text-muted sm:sr-only">Unresolved</dt>
                        <dd className="num text-[17px] font-bold leading-none">{t.priority.unresolvedPct}%</dd>
                        <dd className="mt-1 text-[12px] text-muted">{t.unresolved} of {t.mentions}</dd>
                      </div>
                      <div className="w-[64px]" title={`Priority score ${t.priority.score} of 100: relevance to the product (${t.priority.relevance}) × demand`}>
                        <dt className="mb-1 text-[11px] text-muted sm:sr-only">Score</dt>
                        <dd className="num text-right text-[17px] font-bold leading-none">{t.priority.score}</dd>
                        <dd className="mt-1.5 h-1.5 rounded-full bg-paper"><div className={`h-full rounded-full ${TIER[tier].dot}`} style={{ width: `${t.priority.score}%` }} /></dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

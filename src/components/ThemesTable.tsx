import Link from "next/link";
import type { PainTheme } from "@/lib/types";
import type { Priority } from "@/lib/priority";
import { Sparkline } from "./bits";
import { TierChip } from "./PriorityList";

type Row = PainTheme & { history?: number[]; priority?: Priority };

export function ThemesTable({ themes, names, week, history }: { themes: Row[]; names: Record<string, string>; week: string; history?: boolean }) {
  const ranked = themes.some((t) => t.priority);
  return (
    <div className="overflow-x-auto">
      <table className="tbl w-full min-w-[820px] text-[14px]">
        <thead>
          <tr>
            {ranked && <th>Priority</th>}
            <th>Pain point</th><th>Topic</th><th className="text-right">Posts</th><th>Change</th>
            {history && <th>8 weeks</th>}<th className="text-right">Unresolved</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {themes.map((t) => {
            const change = t.prev_mentions === 0 ? null : Math.round(((t.mentions - t.prev_mentions) / t.prev_mentions) * 100);
            const note = t.priority?.why || t.summary;
            return (
              <tr key={t.theme}>
                {ranked && (
                  <td className="whitespace-nowrap">
                    {t.priority && <span className="inline-flex items-center gap-2"><TierChip tier={t.priority.tier} /><span className="num text-[13px] text-muted" title="Priority score out of 100">{t.priority.score}</span></span>}
                  </td>
                )}
                <td className="min-w-[260px] max-w-[420px]">
                  <div className="font-medium leading-snug">{t.theme}</div>
                  {note && <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{note}</div>}
                </td>
                <td className="text-[13px]">
                  {t.topic_slug ? <Link href={`/topic/${t.topic_slug}?week=${week}`} className="text-cobalt hover:underline">{names[t.topic_slug] ?? t.topic_slug}</Link> : "—"}
                </td>
                <td className="num text-right text-[16px] font-bold">{t.mentions}</td>
                <td>
                  {change === null ? <span className="text-[13px] font-medium text-rise">{t.mentions ? "new" : "—"}</span>
                    : <span className={`whitespace-nowrap text-[13px] font-medium ${change > 0 ? "text-rise" : change < 0 ? "text-ease" : "text-muted"}`}>{change > 0 ? "▲" : change < 0 ? "▼" : ""} {Math.abs(change)}%</span>}
                </td>
                {history && <td><Sparkline values={t.history ?? []} width={84} height={24} stroke="var(--color-rise)" /></td>}
                <td className="whitespace-nowrap text-right">{t.unresolved}<span className="text-[12px] text-muted"> / {t.mentions}</span></td>
                <td>{t.underserved ? <span className="whitespace-nowrap rounded-full bg-amber-soft px-2 py-0.5 text-[12px] font-medium text-amber">Underserved</span> : <span className="text-[12px] text-muted">Served</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

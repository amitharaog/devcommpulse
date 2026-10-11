import Link from "next/link";
import type { PainTheme } from "@/lib/types";
import { Sparkline } from "./bits";

export function ThemesTable({ themes, names, week, history }: { themes: (PainTheme & { history?: number[] })[]; names: Record<string, string>; week: string; history?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl w-full min-w-[780px] text-[14px]">
        <thead>
          <tr>
            <th>Pain point</th><th>Topic</th><th className="text-right">This week</th><th className="text-right">Last week</th><th>Change</th>
            {history && <th>8 weeks</th>}<th className="text-right">Unresolved</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {themes.map((t) => {
            const change = t.prev_mentions === 0 ? null : Math.round(((t.mentions - t.prev_mentions) / t.prev_mentions) * 100);
            return (
              <tr key={t.theme}>
                <td className="max-w-[380px]">
                  <div className="font-medium">{t.theme}</div>
                  {t.summary && <div className="line-clamp-1 text-[12.5px] text-muted">{t.summary}</div>}
                </td>
                <td className="whitespace-nowrap text-[13px]">
                  {t.topic_slug ? <Link href={`/topic/${t.topic_slug}?week=${week}`} className="text-cobalt hover:underline">{names[t.topic_slug] ?? t.topic_slug}</Link> : "—"}
                </td>
                <td className="num text-right text-[16px] font-bold">{t.mentions}</td>
                <td className="text-right text-muted">{t.prev_mentions}</td>
                <td>
                  {change === null ? <span className="text-[13px] font-medium text-rise">{t.mentions ? "new" : "—"}</span>
                    : <span className={`whitespace-nowrap text-[13px] font-medium ${change > 0 ? "text-rise" : change < 0 ? "text-ease" : "text-muted"}`}>{change > 0 ? "▲" : change < 0 ? "▼" : ""} {Math.abs(change)}%</span>}
                </td>
                {history && <td><Sparkline values={t.history ?? []} width={84} height={24} stroke="var(--color-rise)" /></td>}
                <td className="text-right">{t.unresolved}<span className="text-[12px] text-muted"> / {t.mentions}</span></td>
                <td>{t.underserved ? <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[12px] font-medium text-amber">Underserved</span> : <span className="text-[12px] text-muted">Served</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

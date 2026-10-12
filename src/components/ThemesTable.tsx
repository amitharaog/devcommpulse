import Link from "next/link";
import { anchorFor, FIT_LABEL, type Evidence, type Verb } from "@/lib/decide";
import { PersistenceSquares, StrengthLabel, VerbChip, seenLabel } from "./Memo";

type Row = Evidence & { call: Verb | null };

/** Pain themes in the same order as the Overview's calls (unmet demand × product fit × persistence). */
export function ThemesTable({ themes, names, week }: { themes: Row[]; names: Record<string, string>; week: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl w-full min-w-[880px] text-[14px]">
        <thead>
          <tr>
            <th>Call</th><th>Pain point</th><th className="text-right">Posts</th><th className="text-right">Unresolved</th>
            <th>Seen</th><th>Evidence</th><th>Fit</th>
          </tr>
        </thead>
        <tbody>
          {themes.map((t) => (
            <tr key={t.theme} id={anchorFor(t.theme)} className="scroll-mt-24 target:bg-cobalt-soft">
              <td className="whitespace-nowrap">{t.call ? <VerbChip verb={t.call} small /> : <span className="text-muted">—</span>}</td>
              <td className="min-w-[280px] max-w-[440px]">
                <div className="font-medium leading-snug">{t.theme}</div>
                {t.summary && <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{t.summary}</div>}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
                  {t.topic_slug && <Link href={`/topic/${t.topic_slug}?week=${week}`} className="text-cobalt hover:underline">{names[t.topic_slug] ?? t.topic_slug}</Link>}
                  {t.underserved && <span className="rounded-full bg-amber-soft px-2 py-0.5 font-medium text-amber">Tools don&apos;t solve it</span>}
                  {t.allowed.includes("build") && t.call !== "build" && <span className="rounded-full px-2 py-0.5 font-medium text-cobalt ring-1 ring-cobalt/40">Build-ready</span>}
                </div>
              </td>
              <td className="whitespace-nowrap text-right">
                <span className="num text-[16px] font-bold">{t.n}</span>
                <div className="text-[12px] text-muted">{t.p === 0 ? "new" : `${t.p} last wk`}</div>
              </td>
              <td className="whitespace-nowrap text-right">{t.u}<span className="text-[12px] text-muted"> / {t.n}</span></td>
              <td className="whitespace-nowrap">
                <PersistenceSquares marks={t.marks} label={seenLabel(t)} />
                <div className="mt-1 text-[12px] text-muted">{t.weeksSeen}/{t.weeksTracked} wks</div>
              </td>
              <td className="whitespace-nowrap"><StrengthLabel strength={t.strength} /></td>
              <td className="whitespace-nowrap text-[13px] text-muted">{FIT_LABEL[t.fit]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

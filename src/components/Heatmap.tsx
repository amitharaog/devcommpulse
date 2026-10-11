import Link from "next/link";

const fmt = (w: string) => new Date(w + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Topics × weeks; darker cells mean more posts. */
export function Heatmap({ rows, weeks, week }: { rows: { slug: string; name: string; values: number[] }[]; weeks: string[]; week: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-1 text-[13px]">
        <thead>
          <tr>
            <th className="w-[220px]" />
            {weeks.map((w) => <th key={w} className={`pb-1 text-center font-medium ${w === week ? "text-ink" : "text-muted"}`}>{fmt(w)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug}>
              <td className="pr-2"><Link href={`/topic/${r.slug}?week=${week}`} className="line-clamp-1 hover:text-cobalt hover:underline">{r.name}</Link></td>
              {r.values.map((v, i) => {
                const a = v / max;
                return (
                  <td key={i} title={`${r.name}, week of ${fmt(weeks[i])}: ${v} posts`}
                    className={`h-9 rounded-md text-center ${weeks[i] === week ? "ring-2 ring-ink/70" : ""}`}
                    style={{ background: v ? `rgba(52, 86, 240, ${0.08 + a * 0.82})` : "#f3f5f9", color: a > 0.55 ? "#fff" : "var(--color-ink)" }}>
                    {v || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-2 text-[12px] text-muted">
        Fewer
        {[0.1, 0.3, 0.5, 0.7, 0.9].map((a) => <span key={a} className="h-3 w-6 rounded-sm" style={{ background: `rgba(52,86,240,${a})` }} />)}
        More posts. The outlined column is the selected week.
      </div>
    </div>
  );
}

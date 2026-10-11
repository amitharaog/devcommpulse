import { SOURCE_LABELS } from "@/lib/labels";

/** Change in mention volume. More pain talk is red, less is teal. */
export function Delta({ pct, prev, cur, size = "sm" }: { pct: number | null; prev?: number; cur?: number; size?: "sm" | "lg" }) {
  const cls = `whitespace-nowrap ${size === "lg" ? "text-base" : "text-sm"}`;
  if (pct === null) return <span className={`${cls} font-medium text-rise`}>new{cur ? ` (${cur})` : ""}</span>;
  if (pct === 0) return <span className={`${cls} text-muted`}>no change</span>;
  const up = pct > 0;
  return (
    <span className={`${cls} font-medium ${up ? "text-rise" : "text-ease"}`} title={prev !== undefined ? `${prev} last week` : undefined}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

export function Mood({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">—</span>;
  const label = value < -0.35 ? "frustrated" : value < -0.1 ? "uneasy" : value <= 0.15 ? "mixed" : "positive";
  const color = value < -0.1 ? "var(--color-rise)" : value <= 0.15 ? "var(--color-muted)" : "var(--color-ease)";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm" title={`Average sentiment ${value.toFixed(2)} (−1 to +1)`}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function SourceName({ id }: { id: string }) {
  return <>{SOURCE_LABELS[id] ?? id}</>;
}

/** Inline trend line, rendered on the server. */
export function Sparkline({ values, width = 96, height = 26, stroke = "var(--color-muted)", area = false, highlightLast = true }: {
  values: number[]; width?: number; height?: number; stroke?: string; area?: boolean; highlightLast?: boolean;
}) {
  const w = width, h = height, max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * (w - 4) + 2, h - 3 - (v / max) * (h - 6)]);
  const last = pts[pts.length - 1];
  const line = pts.map((p) => p.join(",")).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label={`Weekly values: ${values.join(", ")}`} role="img" className="shrink-0">
      {area && pts.length > 1 && <polygon points={`${pts[0][0]},${h} ${line} ${last[0]},${h}`} fill={stroke} opacity="0.12" />}
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      {highlightLast && last && <circle cx={last[0]} cy={last[1]} r="2.6" fill={stroke} />}
    </svg>
  );
}

/** This week's volume as a bar, last week's as a tick, on a shared scale. */
export function CompareBar({ cur, prev, max }: { cur: number; prev: number; max: number }) {
  const s = (n: number) => `${Math.min(100, (n / Math.max(1, max)) * 100)}%`;
  return (
    <div className="relative h-3 w-full rounded-sm bg-paper" title={`${cur} this week, ${prev} last week`}>
      <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: s(cur), background: cur >= prev ? "var(--color-rise)" : "var(--color-ease)", opacity: 0.85 }} />
      <div className="absolute -inset-y-1 w-[2px] bg-ink" style={{ left: `calc(${s(prev)} - 1px)` }} />
    </div>
  );
}

export function Stat({ value, label, sub }: { value: React.ReactNode; label: string; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="num text-[30px] font-bold leading-none">{value}</div>
      <div className="mt-1.5 text-sm text-muted">{label}</div>
      {sub && <div className="mt-0.5 text-sm">{sub}</div>}
    </div>
  );
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

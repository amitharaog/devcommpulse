"use client";

import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const INK = "#172033", MUTED = "#5d6880", LINE = "#d6dce6", GHOST = "#b4bdcb", RISE = "#c8364f", EASE = "#1f8a7a";
export const SERIES = ["#2b50d6", "#c8364f", "#1f8a7a", "#b7791f", "#7a4fd1", "#4b5563"];

const axis = { stroke: MUTED, fontSize: 12, tickLine: false, axisLine: false } as const;
const tip = { contentStyle: { borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 13 }, cursor: { fill: "rgba(23,32,51,0.04)" } } as const;

const legend = { wrapperStyle: { fontSize: 12 }, formatter: (v: string) => <span style={{ color: INK }}>{v}</span> };

/** Drops leading weeks with no data (e.g. right after the first backfill), keeping at least two points. */
function trim<T>(rows: T[], has: (r: T) => boolean): T[] {
  const i = rows.findIndex(has);
  return i <= 0 ? rows : rows.slice(Math.min(i, rows.length - 2));
}

const fmtWeek = (w: string) => new Date(w + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Mentions per topic over eight weeks (top topics only, so it stays readable). */
export function TrendLines({ data, keys, names }: { data: Record<string, number | string>[]; keys: string[]; names: Record<string, string> }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={trim(data, (r) => keys.some((k) => Number(r[k]) > 0))} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={LINE} vertical={false} />
        <XAxis dataKey="week" tickFormatter={fmtWeek} {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tip} labelFormatter={(w) => `Week of ${fmtWeek(String(w))}`} />
        <Legend {...legend} iconType="plainline" />
        {keys.map((k, i) => (
          <Line key={k} type="linear" dataKey={k} name={names[k] ?? k} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SourceBars({ data }: { data: { name: string; thisWeek: number; lastWeek: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={LINE} horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...axis} />
        <YAxis type="category" dataKey="name" width={104} {...axis} tick={{ fill: INK, fontSize: 12 }} />
        <Tooltip {...tip} />
        <Legend {...legend} />
        <Bar dataKey="lastWeek" name="Last week" fill={GHOST} radius={[0, 3, 3, 0]} />
        <Bar dataKey="thisWeek" name="This week" fill={INK} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Topic page: weekly mentions (bars) with average sentiment (line, right axis). */
export function TopicTrend({ data }: { data: { week: string; mentions: number; sentiment: number | null; unresolved: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={trim(data, (r) => r.mentions > 0)} margin={{ top: 8, right: 0, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={LINE} vertical={false} />
        <XAxis dataKey="week" tickFormatter={fmtWeek} {...axis} />
        <YAxis yAxisId="m" allowDecimals={false} {...axis} />
        <YAxis yAxisId="s" orientation="right" domain={[-1, 1]} ticks={[-1, 0, 1]} {...axis} />
        <Tooltip {...tip} labelFormatter={(w) => `Week of ${fmtWeek(String(w))}`} />
        <Legend {...legend} />
        <Bar yAxisId="m" dataKey="mentions" name="Mentions" fill={INK} radius={[3, 3, 0, 0]} maxBarSize={34} />
        <Bar yAxisId="m" dataKey="unresolved" name="Unresolved" fill={RISE} radius={[3, 3, 0, 0]} maxBarSize={34} />
        <Line yAxisId="s" type="linear" dataKey="sentiment" name="Mood (−1 to +1)" stroke={EASE} strokeWidth={2} connectNulls dot={{ r: 2.5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function KeywordBars({ data }: { data: { keyword: string; mentions: number; prev: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(150, data.length * 30 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={LINE} horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...axis} />
        <YAxis type="category" dataKey="keyword" width={150} {...axis} tick={{ fill: INK, fontSize: 12 }} />
        <Tooltip {...tip} />
        <Legend {...legend} />
        <Bar dataKey="prev" name="Last week" fill={GHOST} radius={[0, 3, 3, 0]} />
        <Bar dataKey="mentions" name="This week" fill={INK} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

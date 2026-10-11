"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function WeekPicker({ week, options, labels }: { week: string; options: string[]; labels: Record<string, string> }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted">
      Week
      <select
        className="rounded-md border border-line bg-surface px-2 py-1.5 text-ink"
        value={week}
        onChange={(e) => {
          const p = new URLSearchParams(params.toString());
          p.set("week", e.target.value);
          router.push(`${path}?${p.toString()}`);
        }}
      >
        {[...new Set([week, ...options])].sort().reverse().map((w) => (
          <option key={w} value={w}>{labels[w] ?? w}</option>
        ))}
      </select>
    </label>
  );
}

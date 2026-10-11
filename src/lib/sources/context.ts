import type { RawPost, Topic } from "../types";

export type SourceContext = {
  topics: Topic[];
  config: Record<string, unknown>;
  since: Date;
  /** Wall-clock deadline (ms epoch) — adapters stop paging when it passes. */
  deadline: number;
  log: (msg: string) => void;
};

export type Adapter = (ctx: SourceContext) => Promise<RawPost[]>;

export const unix = (d: Date) => Math.floor(d.getTime() / 1000);

export function strList(v: unknown, fallback: string[]): string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string") && v.length ? (v as string[]) : fallback;
}

export function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

import { Fragment } from "react";
import Link from "next/link";
import {
  anchorFor, ASK_TEMPLATE, COST, FIT_LABEL, STRENGTH_LABEL, UNRES_BUILD, UNRES_MODERATE, UNRES_STRONG, VERB_LABEL, ticketMarkdown,
  type Call, type Evidence, type Held, type Strength, type Thresholds, type Verb, type WeekMark,
} from "@/lib/decide";
import { sourceLabel } from "@/lib/labels";
import { SHIPPED } from "@/lib/shipped";
import { shortWeek, weekLabel } from "@/lib/week";
import { CopyButton } from "./CopyButton";

const CHIP: Record<Verb, string> = {
  build: "bg-cobalt text-white ring-cobalt",
  investigate: "bg-amber-soft text-amber ring-amber/20",
  message: "bg-cobalt-soft text-cobalt ring-cobalt/40",
  ignore: "bg-surface text-muted ring-line",
};

export function VerbChip({ verb, small }: { verb: Verb; small?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-semibold uppercase tracking-wide ring-1 ${CHIP[verb]} ${small ? "px-1.5 py-0.5 text-[10.5px]" : "w-[118px] px-2 py-1 text-[11.5px]"}`}>
      {VERB_LABEL[verb]}
    </span>
  );
}

export function StrengthLabel({ strength }: { strength: Strength }) {
  const dots = strength === "strong" ? "●●●" : strength === "moderate" ? "●●○" : "●○○";
  return (
    <span className="whitespace-nowrap text-[12.5px] text-muted">
      <span aria-hidden className={strength === "strong" ? "text-ink" : ""}>{dots}</span> {STRENGTH_LABEL[strength]}
    </span>
  );
}

export function seenLabel(e: Pick<Evidence, "weeksSeen" | "weeksTracked">): string {
  return e.weeksTracked >= 8 ? `seen ${e.weeksSeen} of 8 wks` : `seen ${e.weeksSeen} of ${e.weeksTracked} wks tracked`;
}

/** 8 weeks, oldest first: filled = seen, outline = tracked but quiet, dashed = no data yet. */
export function PersistenceSquares({ marks, label }: { marks: WeekMark[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-[2px] align-middle" role="img" aria-label={label}>
      {marks.map((m, i) => (
        <span key={i} className={`h-2 w-2 rounded-[2px] ${m === "seen" ? "bg-cobalt" : m === "tracked" ? "border border-faint" : "border border-dashed border-line"}`} />
      ))}
    </span>
  );
}

function postsLabel(n: number, p: number) {
  return p === 0 ? `${n} posts (new)` : `${n} posts (${p} last wk)`;
}

function Facts({ e, showTheme }: { e: Evidence; showTheme?: boolean }) {
  const items: React.ReactNode[] = [
    showTheme ? <span key="t" className="font-medium text-ink/80">{e.theme}</span> : null,
    <span key="n">{postsLabel(e.n, e.p)}</span>,
    <span key="u">{e.u} unresolved ({Math.round(e.share * 100)}%)</span>,
    e.blocking != null && e.blocking > 0 ? <span key="b">{e.blocking} block work</span> : null,
    <span key="s" className="inline-flex items-center gap-1.5"><PersistenceSquares marks={e.marks} label={seenLabel(e)} />{seenLabel(e)}</span>,
    e.threads != null ? <span key="r">{e.threads} separate thread{e.threads === 1 ? "" : "s"}</span> : null,
    <span key="f">{FIT_LABEL[e.fit]}</span>,
    e.underserved ? <span key="x" className="font-medium text-amber">Tools don&apos;t solve it</span> : null,
  ].filter(Boolean);
  return (
    <p className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-muted">
      {items.map((x, i) => <span key={i} className="inline-flex items-center gap-1.5">{x}</span>)}
    </p>
  );
}

function QuoteLine({ c }: { c: Call }) {
  if (!c.quote) return null;
  return (
    <p className="text-[13.5px] italic text-ink/80">
      <span className="line-clamp-2">“{c.quote.text}”</span>
      <a href={c.quote.url} target="_blank" rel="noreferrer" className="not-italic text-cobalt hover:underline">— {sourceLabel(c.quote.source)} ↗</a>
    </p>
  );
}

function UseIt({ c, e, week, computed }: { c: Call; e: Evidence; week: string; computed: boolean }) {
  const ask = c.ask_question || (c.verb === "investigate" || c.verb === "build" ? ASK_TEMPLATE : "");
  const rows: [string, React.ReactNode][] = [];
  if (c.pitch) rows.push(["Say", <>“{c.pitch}”</>]);
  if (ask) rows.push(["Ask", <>{c.ask_who && <span>{c.ask_who}: </span>}“{ask}”</>]);
  if (c.metric) rows.push(["Measure", <>{c.metric}<span className="block text-[12.5px] text-muted">Market baseline saved: {e.n} posts, {e.u} unresolved, week of {shortWeek(week)} (market signal, not attribution)</span></>]);
  rows.push(["Cost to act", COST[c.verb]]);
  const ticket = ticketMarkdown(c, e.summary, weekLabel(week), "{{url}}");
  return (
    <details className="group mt-1">
      <summary className="cursor-pointer list-none text-[13px] font-medium text-cobalt hover:underline">
        <span className="group-open:hidden">{[c.pitch && "Say", ask && "Ask", c.metric && "Measure", "Ticket"].filter(Boolean).join(" · ")} ▸</span><span className="hidden group-open:inline">Hide ▾</span>
      </summary>
      <dl className="mt-2 grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 rounded-lg bg-paper px-4 py-3 text-[13.5px]">
        {rows.map(([k, v]) => (<Fragment key={k}><dt className="font-medium text-muted">{k}</dt><dd>{v}</dd></Fragment>))}
      </dl>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
        <CopyButton text={ticket} label="Copy as ticket" path={`/?week=${week}`} />
        <Link href={`/pain-points?week=${week}#${anchorFor(c.theme)}`} className="text-cobalt hover:underline">Read the {e.n} posts →</Link>
        {computed && <span className="text-muted">Pitch and metric are written with the Friday brief.</span>}
      </div>
    </details>
  );
}

export function CallRow({ c, e, week, first, computed }: { c: Call; e: Evidence; week: string; first: boolean; computed: boolean }) {
  const href = e.topic_slug ? `/topic/${e.topic_slug}?week=${week}` : `/pain-points?week=${week}#${anchorFor(c.theme)}`;
  if (c.verb === "ignore") {
    return (
      <li className="space-y-1 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <VerbChip verb="ignore" />
          <Link href={href} className="min-w-0 flex-[1_1_14rem] text-[16px] font-medium leading-snug text-muted hover:text-ink hover:underline">{c.title}</Link>
          <StrengthLabel strength={e.strength} />
        </div>
        <p className="line-clamp-1 text-[13px] text-muted sm:pl-[130px]">{c.why}</p>
        <p className="text-[13.5px] sm:pl-[130px]"><span className="font-semibold">Revisit if:</span> {c.revisit_if}</p>
      </li>
    );
  }
  return (
    <li className="space-y-1.5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <VerbChip verb={c.verb} />
        <Link href={href} className="min-w-0 flex-[1_1_14rem] text-[17px] font-semibold leading-snug hover:text-cobalt hover:underline">{c.title}</Link>
        <StrengthLabel strength={e.strength} />
      </div>
      <div className="space-y-1.5 sm:pl-[130px]">
        <Facts e={e} showTheme={c.title !== c.theme} />
        <p className="text-[14px]"><span className="font-semibold">Next:</span> {c.next_step}</p>
        {(first || c.verb === "message") && <QuoteLine c={c} />}
        <UseIt c={c} e={e} week={week} computed={computed} />
      </div>
    </li>
  );
}

const VERDICT: Record<Held["verdict"], { label: string; cls: string }> = {
  grew: { label: "Grew", cls: "bg-rise-soft text-rise" },
  held: { label: "Held", cls: "bg-paper text-ink ring-1 ring-line" },
  faded: { label: "Faded", cls: "bg-ease-soft text-ease" },
  none: { label: "No match this week", cls: "bg-paper text-muted" },
};

export function HeldList({ held, week }: { held: Held[]; week: string }) {
  return (
    <ul className="divide-y divide-line">
      {held.map((h) => {
        const shipped = SHIPPED.find((s) => s.theme.toLowerCase() === h.theme.toLowerCase());
        return (
          <li key={h.theme} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[14px]">
            <VerbChip verb={h.verb} small />
            <span className="min-w-[10rem] flex-1 leading-snug">{h.title}</span>
            {h.verdict !== "none" && <span className="num whitespace-nowrap text-muted">{h.then} → {h.now} posts</span>}
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ${VERDICT[h.verdict].cls}`}>{VERDICT[h.verdict].label}</span>
            {h.verdict === "none" && <span className="w-full text-[12.5px] text-muted">No matching theme; it may have been renamed.</span>}
            {h.reconsider && <span className="w-full text-[12.5px] font-medium text-amber">Still loud, reconsider.</span>}
            {shipped && <span className="w-full text-[12.5px] text-muted">Shipped {shortWeek(shipped.week)}: {shipped.what}</span>}
          </li>
        );
      })}
      <li className="sr-only">Week of {weekLabel(week)}</li>
    </ul>
  );
}

export function RadarList({ items, week }: { items: Evidence[]; week: string }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((e) => (
        <li key={e.theme} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[14px]">
          <Link href={e.topic_slug ? `/topic/${e.topic_slug}?week=${week}` : `/pain-points?week=${week}#${anchorFor(e.theme)}`} className="min-w-[14rem] flex-1 leading-snug hover:text-cobalt hover:underline">{e.theme}</Link>
          <span className="whitespace-nowrap text-[13px] text-muted">{postsLabel(e.n, e.p)}</span>
          <PersistenceSquares marks={e.marks} label={seenLabel(e)} />
          {e.allowed.includes("build") && <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium text-cobalt ring-1 ring-cobalt/40">Build-ready</span>}
          {e.underserved && <span className="whitespace-nowrap rounded-full bg-amber-soft px-2 py-0.5 text-[12px] font-medium text-amber">Tools don&apos;t solve it</span>}
        </li>
      ))}
    </ul>
  );
}

/** The method in plain words, with thresholds taken from the code so the copy can't drift. */
export function HowCallsAreMade({ th, need, threadsKnown = true, id = "how", open }: { th: Thresholds; need: number; threadsKnown?: boolean; id?: string; open?: boolean }) {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <details id={id} open={open} className="rounded-lg border border-line bg-surface px-4 py-3 text-[13.5px]">
      <summary className="cursor-pointer font-medium">How calls are made</summary>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 leading-relaxed text-ink/90">
        <li>Every pain theme gets an evidence level from its posts, the share still unresolved, the weeks it has been seen and how many separate threads it comes from. <b>Strong</b> means at least {th.minStrong} posts, {pct(UNRES_STRONG)} or more unresolved, seen in {need} or more of the tracked weeks and from at least 3 separate threads. <b>Moderate</b> means at least {th.minModerate} posts, either {pct(UNRES_MODERATE)} unresolved or seen in 2 or more weeks, and at least 2 threads. A one-week spike is never rated strong.{!threadsKnown && " This week's brief was written before thread counts were recorded, so the thread rules are skipped for it."}</li>
        <li><b>Build</b> needs strong evidence, core product fit, at least 2 tracked weeks, no one-week spike, and either &ldquo;tools don&apos;t solve it&rdquo; or {pct(UNRES_BUILD)} or more unresolved.</li>
        <li><b>Investigate</b> needs at least moderate evidence and core or adjacent fit, or a new spike in a core area.</li>
        <li><b>Message</b> is an investigate-level theme that is a trust or perception problem. It is only shown with a word-for-word developer quote.</li>
        <li><b>Ignore for now</b> is for loud themes outside the product, or a one-week spike that developers don&apos;t say is unsolved.</li>
        <li>Gemini words the calls and chooses among the allowed verbs, but cannot override them. Every number it writes must come from the data, or the sentence is replaced.</li>
        <li>This is an opportunity signal, not revenue. It does not claim dollar value, market size, unique people (one person can write several posts), customers, or that shipping something caused a change.</li>
      </ol>
    </details>
  );
}

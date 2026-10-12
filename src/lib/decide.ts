/**
 * Turns a week's pain themes into at most three calls for Sumit: BUILD, INVESTIGATE, MESSAGE or IGNORE FOR NOW.
 *
 * Code decides which verbs each theme has earned from countable evidence (posts, unresolved share, weeks seen,
 * separate threads, product fit). Gemini may only word the calls and choose among the allowed verbs, and every
 * number it writes must come from the data. The evidence bar rises with the cost of acting.
 *
 * Pure module: no I/O and no runtime imports, so it runs under `node --test` as well as in Next.
 */
import type { PainTheme } from "./types";

export type Fit = "high" | "medium" | "low";
export type Verb = "build" | "investigate" | "message" | "ignore";
export type Strength = "strong" | "moderate" | "thin";
export type WeekMark = "seen" | "tracked" | "untracked";
export type ThemeRating = { theme: string; relevance: Fit; why: string };
export type ThemeStat = { theme: string; blocking: number; threads: number; communities: Record<string, number>; engagement: number };

export const VERBS: Verb[] = ["build", "investigate", "message", "ignore"];
export const VERB_LABEL: Record<Verb, string> = { build: "Build", investigate: "Investigate", message: "Message", ignore: "Ignore for now" };
export const FIT_LABEL: Record<Fit, string> = { high: "Core to product", medium: "Next to product", low: "Outside the product" };
export const STRENGTH_LABEL: Record<Strength, string> = { strong: "Strong evidence", moderate: "Moderate evidence", thin: "Thin evidence" };
export const COST: Record<Verb, string> = {
  build: "engineering time",
  investigate: "a few conversations (about a day)",
  message: "a sales/marketing line, no engineering",
  ignore: "none",
};
export const ASK_TEMPLATE = "When did this last happen to your team, and what did you do about it?";

// Used until the weekly brief has rated a theme: how close each seeded topic sits to the product.
export const TOPIC_RELEVANCE: Record<string, Fit> = {
  "automated-review-quality": "high",
  "review-bottlenecks": "high",
  "static-analysis-linters": "high",
  "review-culture": "medium",
  "security-in-prs": "medium",
  "ci-cd-friction": "medium",
  "merge-workflow": "low",
};
export const WEIGHT: Record<Fit, number> = { high: 1, medium: 0.62, low: 0.3 };
export const UNRES_STRONG = 0.5;
export const UNRES_MODERATE = 0.4;
export const UNRES_BUILD = 0.6;
export const UNRES_IGNORE = 0.6;

/** Evidence thresholds scale with the week's pain volume, so more sources don't make everything "strong". */
export function thresholds(painTotal: number) {
  return { painTotal, minStrong: Math.max(8, Math.ceil(0.065 * painTotal)), minModerate: Math.max(5, Math.ceil(0.04 * painTotal)) };
}
export type Thresholds = ReturnType<typeof thresholds>;

export function isRelevance(v: unknown): v is Fit {
  return v === "high" || v === "medium" || v === "low";
}

/** Fit ratings saved by the weekly brief in digests.stats.priorities, if any. */
export function ratingsFrom(stats: unknown): ThemeRating[] {
  const raw = (stats as { priorities?: unknown } | null)?.priorities;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => (r && typeof r.theme === "string" && isRelevance(r.relevance) ? [{ theme: r.theme, relevance: r.relevance, why: String(r.why ?? "") }] : []));
}

/** Exact blocking/thread counts saved by the weekly brief in digests.stats.theme_stats, or null when absent. */
export function themeStatsFrom(stats: unknown): ThemeStat[] | null {
  const raw = (stats as { theme_stats?: unknown } | null)?.theme_stats;
  if (!Array.isArray(raw)) return null;
  return raw.flatMap((r) => (r && typeof r.theme === "string" && Number.isFinite(r.blocking) && Number.isFinite(r.threads)
    ? [{ theme: r.theme, blocking: Number(r.blocking), threads: Number(r.threads), communities: r.communities ?? {}, engagement: Number(r.engagement) || 0 }]
    : []));
}

// ---------- theme identity across weeks ----------

const STOP = new Set(["with", "that", "from", "into", "their", "teams", "developers"]);
export function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)));
}

type Named = { theme: string; topic_slug: string | null };
/** Same theme in another week: same name, or same topic with mostly the same words (Gemini sometimes rewords). */
export function themeMatch(a: Named, b: Named): boolean {
  if (a.theme.toLowerCase() === b.theme.toLowerCase()) return true;
  if (!a.topic_slug || a.topic_slug !== b.topic_slug) return false;
  const x = tokens(a.theme), y = tokens(b.theme);
  if (!x.size || !y.size) return false;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both) >= 0.6;
}

export function anchorFor(theme: string): string {
  return "t-" + theme.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

// ---------- evidence ----------

export type Evidence = {
  theme: string;
  topic_slug: string | null;
  summary: string | null;
  example_ids: string[];
  n: number; // posts this week
  p: number; // posts last week (same clustering)
  u: number; // still unresolved
  share: number; // u / n
  blocking: number | null; // severity 3, exact or unknown
  threads: number | null; // separate threads, exact or unknown
  underserved: boolean;
  fit: Fit;
  weeksSeen: number;
  weeksTracked: number;
  need: number;
  marks: WeekMark[]; // 8 weeks, oldest first
  strength: Strength;
  spike: boolean;
  allowed: Verb[];
  o: number; // internal ranking key, never displayed
};

export type EvidenceInput = {
  week: string;
  weeks: string[]; // 8 weeks, oldest first, ending with `week`
  themes: PainTheme[]; // this week's themes
  history: Pick<PainTheme, "week_start" | "theme" | "topic_slug" | "mentions">[]; // earlier weeks in the window
  ratings?: ThemeRating[];
  themeStats?: ThemeStat[] | null;
  prevTotal: number; // all posts last week; makes last week "tracked" through prev_mentions
  th: Thresholds;
};

export function weeksTrackedIn(input: Pick<EvidenceInput, "week" | "weeks" | "history" | "prevTotal">): boolean[] {
  const prevWeek = input.weeks[input.weeks.length - 2];
  const withThemes = new Set(input.history.map((h) => h.week_start));
  return input.weeks.map((w) => w === input.week || withThemes.has(w) || (w === prevWeek && input.prevTotal > 0));
}

export function strengthOf(e: Pick<Evidence, "n" | "share" | "weeksSeen" | "need" | "threads">, th: Thresholds): Strength {
  if (e.n >= th.minStrong && e.share >= UNRES_STRONG && e.weeksSeen >= e.need && (e.threads == null || e.threads >= 3)) return "strong";
  if (e.n >= th.minModerate && (e.share >= UNRES_MODERATE || e.weeksSeen >= 2) && (e.threads == null || e.threads >= 2)) return "moderate";
  return "thin";
}

export function isSpike(e: Pick<Evidence, "n" | "p" | "weeksSeen">, th: Thresholds): boolean {
  return e.p <= 2 && e.n >= th.minModerate && e.weeksSeen <= 2;
}

export function allowedVerbs(e: Omit<Evidence, "allowed" | "o">, th: Thresholds): Verb[] {
  if (e.n === 0) return [];
  const out: Verb[] = [];
  if (e.strength === "strong" && e.fit === "high" && e.weeksTracked >= 2 && !e.spike && (e.underserved || e.share >= UNRES_BUILD)) out.push("build");
  const investigate = (e.strength !== "thin" && e.fit !== "low") || (e.spike && e.fit === "high");
  if (investigate) out.push("investigate");
  if (investigate && e.fit === "high") out.push("message");
  if (e.n >= th.minModerate && (e.fit === "low" || (e.spike && !e.underserved && e.share < UNRES_IGNORE))) out.push("ignore");
  return out;
}

export function evidenceFor(input: EvidenceInput): Evidence[] {
  const { week, weeks, themes, history, th } = input;
  const prevWeek = weeks[weeks.length - 2];
  const tracked = weeksTrackedIn(input);
  const weeksTracked = Math.min(8, tracked.filter(Boolean).length);
  const need = Math.max(1, Math.min(3, weeksTracked));
  const rated = new Map((input.ratings ?? []).map((r) => [r.theme.toLowerCase(), r.relevance]));
  const stats = input.themeStats ? new Map(input.themeStats.map((s) => [s.theme.toLowerCase(), s])) : null;

  return themes
    .map((t) => {
      const n = t.mentions, p = t.prev_mentions, u = Math.min(t.unresolved, n);
      const marks: WeekMark[] = weeks.map((w, i) => {
        if (!tracked[i]) return "untracked";
        if (w === week) return n > 0 ? "seen" : "tracked";
        if (history.some((h) => h.week_start === w && h.mentions > 0 && themeMatch(h, t))) return "seen";
        return w === prevWeek && p > 0 ? "seen" : "tracked";
      });
      const weeksSeen = Math.max(n > 0 ? 1 : 0, marks.filter((m) => m === "seen").length);
      const st = stats?.get(t.theme.toLowerCase());
      const base = {
        theme: t.theme,
        topic_slug: t.topic_slug,
        summary: t.summary,
        example_ids: t.example_ids ?? [],
        n, p, u,
        share: n > 0 ? u / n : 0,
        blocking: st ? st.blocking : null,
        threads: st ? st.threads : null,
        underserved: !!t.underserved,
        fit: rated.get(t.theme.toLowerCase()) ?? TOPIC_RELEVANCE[t.topic_slug ?? ""] ?? "medium",
        weeksSeen, weeksTracked, need, marks,
      };
      // A spike needs a known last week: with no data for it, "up from 0" would be invented.
      const spike = tracked[weeks.length - 2] && isSpike(base, th);
      const raw = strengthOf(base, th);
      const strength: Strength = spike && raw === "strong" ? "moderate" : raw; // one week of noise is never strong evidence
      const e = { ...base, spike, strength };
      const allowed = allowedVerbs(e, th);
      const o = WEIGHT[e.fit] * (u + (e.blocking ?? 0)) * Math.min(1, weeksSeen / need);
      return { ...e, allowed, o };
    })
    .sort((a, b) => b.o - a.o || b.n - a.n || a.theme.localeCompare(b.theme));
}

// ---------- calls ----------

export type Quote = { text: string; post_id: string; url: string; source: string };
export type Snapshot = {
  week: string; posts: number; last_week: number; unresolved: number; blocking: number | null; weeks_seen: number;
  weeks_tracked: number; threads: number | null; underserved: boolean; fit: Fit; strength: Strength;
};
export type Call = {
  theme: string; topic_slug: string | null; verb: Verb; title: string; why: string; next_step: string; pitch: string;
  ask_who: string; ask_question: string; metric: string; revisit_if: string; quote: Quote | null; evidence: Snapshot;
};

export function snapshot(e: Evidence, week: string): Snapshot {
  return {
    week, posts: e.n, last_week: e.p, unresolved: e.u, blocking: e.blocking, weeks_seen: e.weeksSeen,
    weeks_tracked: e.weeksTracked, threads: e.threads, underserved: e.underserved, fit: e.fit, strength: e.strength,
  };
}

export function whyTemplate(verb: Verb, e: Evidence): string {
  if (verb === "build") return `${e.u} of ${e.n} posts still unresolved, seen in ${e.weeksSeen} of ${e.weeksTracked} weeks${e.underserved ? "; developers say tools don't solve it" : ""}.`;
  if (verb === "ignore") {
    return e.fit === "low" ? `Loud (${e.n} posts) but outside what the product does.` : `Jumped from ${e.p} to ${e.n} posts in one week, and developers don't say tools fail them.`;
  }
  const reason = e.spike ? `it only appeared this week (up from ${e.p})`
    : e.fit === "medium" ? "it sits next to the product, not in it"
    : e.allowed.includes("build") ? "it has a build case too; validate with customers before committing engineering"
    : e.strength === "strong" && e.weeksTracked < 2 ? "there is only one week of history so far"
    : e.strength === "strong" ? "most of it isn't clearly unsolved yet"
    : "the evidence is still moderate";
  if (verb === "message") return `${e.n} posts, ${e.u} unresolved; the doubt is about trust in tools, which proof can answer.`;
  return `${e.n} posts, ${e.u} unresolved, but ${reason}.`;
}

export function nextTemplate(verb: Verb): string {
  if (verb === "build") return "Sumit turns the top 5 posts into a one-page problem brief to size on Monday.";
  if (verb === "ignore") return "";
  if (verb === "message") return "Sales tries the quote below with 3 prospects this week.";
  return "Sumit reads the top 5 posts and asks 3 customers whether they hit this.";
}

export function revisitTemplate(e: Evidence): string {
  return `It stays at ${e.n}+ posts for 2 more weeks.`;
}

function templateCall(e: Evidence, verb: Verb, week: string): Call {
  return {
    theme: e.theme, topic_slug: e.topic_slug, verb, title: e.theme, why: whyTemplate(verb, e), next_step: nextTemplate(verb),
    pitch: "", ask_who: "", ask_question: "", metric: "", revisit_if: verb === "ignore" ? revisitTemplate(e) : "", quote: null,
    evidence: snapshot(e, week),
  };
}

/** Calls made from counts alone: for weeks whose brief predates calls, or when Gemini's calls don't survive validation. */
export function computedCalls(evs: Evidence[], week: string): Call[] {
  const picked: { e: Evidence; verb: Verb }[] = [];
  const taken = (e: Evidence) => picked.some((x) => x.e === e);
  const build = evs.find((e) => e.allowed.includes("build"));
  if (build) picked.push({ e: build, verb: "build" });
  const inv = evs.filter((e) => !taken(e) && e.allowed.includes("investigate"));
  // Prefer a different kind of bet: a second build-ready theme stays on the radar instead.
  const ordered = [...inv.filter((e) => !e.allowed.includes("build")), ...inv.filter((e) => e.allowed.includes("build"))];
  for (const e of ordered.slice(0, build ? 1 : 2)) picked.push({ e, verb: "investigate" });
  const ignore = evs.filter((e) => !taken(e) && e.allowed.includes("ignore")).sort((a, b) => b.n - b.p - (a.n - a.p) || b.n - a.n)[0];
  if (ignore) picked.push({ e: ignore, verb: "ignore" });
  return picked.slice(0, 3).map(({ e, verb }) => templateCall(e, verb, week));
}

// ---------- validating Gemini's words ----------

const BANNED = /[$€£¥]|#1\b|\b(revenue|roi|arr|mrr|pricing|prices?|priced|deal size|market size|guarantee[sd]?|best|fastest|world-class|sales leads?)\b/i;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;

export function numbersIn(s: string): number[] {
  return (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/,/g, "")));
}

// "2x faster", "5k a year", "3 hours a week": claims the data can't support, even when the digit itself is allowed.
const UNIT = /\d(?:\.\d+)?\s*(?:x\b|×|k\b|m\b|bn\b|times\b|million|billion|thousand|hours?\b|hrs?\b|minutes?\b|mins?\b|days?\b)/i;

/** True when text has no money/superlative wording or invented units and (if a set is given) only numbers from that set. */
export function checkText(s: string, allowed: Set<number> | null): boolean {
  if (BANNED.test(s) || UNIT.test(s)) return false;
  return !allowed || numbersIn(s).every((n) => allowed.has(n));
}

/** Every number Gemini may write: those in the evidence/topic tables and totals, simple differences, and small counts. */
export function allowedNumbers(payload: unknown, evs: Evidence[]): Set<number> {
  const out = new Set<number>([0, 1, 2, 3, 5, 8]);
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) out.add(Math.abs(v));
    else if (typeof v === "string") numbersIn(v).forEach((n) => out.add(n));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(payload);
  for (const e of evs) {
    out.add(Math.abs(e.n - e.p));
    out.add(e.n - e.u);
    if (e.p > 0) out.add(Math.round((100 * Math.abs(e.n - e.p)) / e.p));
  }
  return out;
}

function clip(s: unknown, max: number): string {
  const t = String(s ?? "").replace(EMOJI, "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 15)).trim();
}

const FIELDS: Record<Verb, (keyof Call)[]> = {
  build: ["pitch", "ask_who", "ask_question", "metric"],
  investigate: ["ask_who", "ask_question"],
  message: ["pitch"],
  ignore: ["revisit_if"],
};

/**
 * Keeps only calls that use a theme from the table and a verb that theme has earned (build/message fall back to
 * investigate), at most 2 build, 1 message, 1 ignore and 3 in total. Text that cites a number not in the data, or
 * talks money, is replaced by the template. Pass `allowed = null` to skip the number check (stored calls).
 */
export function validateCalls(raw: unknown, evs: Evidence[], allowed: Set<number> | null, week: string): Call[] {
  if (!Array.isArray(raw)) return [];
  const out: Call[] = [];
  const count = (v: Verb) => out.filter((c) => c.verb === v).length;
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== "object" || out.length >= 3) continue;
    const e = evs.find((x) => x.theme.toLowerCase() === String(r.theme ?? "").trim().toLowerCase());
    if (!e || out.some((c) => c.theme === e.theme)) continue;
    let verb = String(r.verb ?? "").toLowerCase() as Verb;
    if (!VERBS.includes(verb)) continue;
    let downgraded = false;
    if (!e.allowed.includes(verb)) {
      if ((verb === "build" || verb === "message") && e.allowed.includes("investigate")) { verb = "investigate"; downgraded = true; }
      else continue;
    }
    if ((verb === "build" && count("build") >= 2) || (verb === "message" && count("message") >= 1) || (verb === "ignore" && count("ignore") >= 1)) continue;

    const t = templateCall(e, verb, week);
    const ok = (s: string) => !!s && checkText(s, allowed);
    // Gemini sometimes repeats the on-page label ("Revisit if: Revisit if posts…"); drop it and re-capitalise.
    const LABEL: Partial<Record<keyof Call, RegExp>> = { revisit_if: /^revisit(?: it)?(?: if| when)?\s*[:,-]?\s*/i, next_step: /^next(?: step)?\s*:\s*/i, pitch: /^say\s*:\s*/i, metric: /^measure\s*:\s*/i };
    const pick = (key: keyof Call, max: number, fallback: string) => {
      let s = clip(r[key], max);
      const label = LABEL[key];
      if (label && label.test(s)) { s = s.replace(label, ""); s = s.charAt(0).toUpperCase() + s.slice(1); }
      return ok(s) ? s : fallback;
    };
    const keep = (key: keyof Call) => FIELDS[verb].includes(key);
    const call: Call = { ...t };
    if (!downgraded) {
      call.title = pick("title", 90, t.title);
      call.why = pick("why", 220, t.why);
      call.next_step = verb === "ignore" ? "" : pick("next_step", 180, t.next_step);
    }
    call.pitch = keep("pitch") ? pick("pitch", 160, "") : "";
    const who = keep("ask_who") ? clip(r.ask_who, 110) : "";
    call.ask_who = !who || !checkText(who, null) || /@|http|www\.|\bu\//i.test(who) ? "" : who;
    const q = keep("ask_question") ? pick("ask_question", 160, "") : "";
    call.ask_question = q.endsWith("?") ? q : "";
    call.metric = keep("metric") ? pick("metric", 110, "") : "";
    call.revisit_if = keep("revisit_if") ? pick("revisit_if", 120, t.revisit_if) : "";
    const qt = r.quote as Quote | null | undefined;
    call.quote = qt && typeof qt.text === "string" && typeof qt.url === "string" ? { text: qt.text, post_id: String(qt.post_id ?? ""), url: qt.url, source: String(qt.source ?? "") } : null;
    out.push(call);
  }
  return out;
}

/** Calls in reading order: build, investigate, message, ignore; within a verb, by evidence rank. */
export function orderCalls(calls: Call[], evs: Evidence[]): Call[] {
  const rank = (c: Call) => evs.findIndex((e) => e.theme === c.theme);
  return [...calls].sort((a, b) => VERBS.indexOf(a.verb) - VERBS.indexOf(b.verb) || rank(a) - rank(b));
}

/** A MESSAGE call is only worth making with a developer's own words behind it. */
export function enforceMessageQuotes(calls: Call[], evs: Evidence[], week: string): Call[] {
  return calls.map((c) => {
    if (c.verb !== "message" || c.quote) return c;
    const e = evs.find((x) => x.theme === c.theme);
    return e && e.allowed.includes("investigate") ? { ...templateCall(e, "investigate", week), quote: null } : null;
  }).filter((c): c is Call => !!c);
}

/** Calls for a week: the stored, validated ones when the brief wrote them, else computed from counts. */
export function callsFrom(stats: unknown, evs: Evidence[], week: string): { calls: Call[]; source: "gemini" | "computed"; stored: boolean } {
  const s = stats as { calls_version?: number; calls?: unknown; calls_source?: string } | null;
  if (s?.calls_version === 1 && Array.isArray(s.calls)) {
    const calls = orderCalls(enforceMessageQuotes(validateCalls(s.calls, evs, null, week), evs, week), evs);
    if (calls.length) return { calls, source: s.calls_source === "gemini" ? "gemini" : "computed", stored: true };
  }
  return { calls: computedCalls(evs, week), source: "computed", stored: false };
}

// ---------- headline and the Monday question ----------

const HEADLINE_STOP = new Set(["about", "their", "these", "which", "while", "teams", "developers", "review"]);
const contentWords = (s: string) => (s.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length >= 5 && !HEADLINE_STOP.has(w));

/** Numbers a sentence about one call may cite: that call's own evidence, simple differences and small counts. */
function ownNumbers(c: Call): Set<number> {
  const e = c.evidence;
  const out = new Set<number>([1, 2, 3, e.posts, e.last_week, e.unresolved, e.posts - e.unresolved, e.weeks_seen, e.weeks_tracked, Math.abs(e.posts - e.last_week)]);
  if (e.blocking != null) out.add(e.blocking);
  if (e.threads != null) out.add(e.threads);
  if (e.posts) out.add(Math.round((100 * e.unresolved) / e.posts));
  if (e.last_week) out.add(Math.round((100 * Math.abs(e.posts - e.last_week)) / e.last_week));
  return out;
}

/**
 * Gemini's headline (or Monday question) is kept only if it is about call #1, cites only call #1's own numbers,
 * and doesn't lead with a theme the page tells Sumit to ignore. Otherwise the computed text is used.
 */
export function headlineOk(h: string, calls: Call[], allowed: Set<number> | null): boolean {
  if (!h || !checkText(h, allowed)) return false;
  const first = calls[0];
  if (!first) return true;
  if (!numbersIn(h).every((n) => ownNumbers(first).has(n))) return false;
  const hw = new Set(contentWords(h));
  const firstWords = new Set([...contentWords(first.theme), ...contentWords(first.title)]);
  if (![...firstWords].some((w) => hw.has(w))) return false;
  const ignored = calls.slice(1).filter((c) => c.verb === "ignore").flatMap((c) => [...contentWords(c.theme), ...contentWords(c.title)]).filter((w) => !firstWords.has(w));
  return !ignored.some((w) => hw.has(w));
}

export function computedHeadline(calls: Call[]): string | null {
  const c = calls[0];
  if (!c) return null;
  const e = c.evidence;
  if (c.verb === "build") return `Strongest build case: ${c.theme}, with ${e.unresolved} of ${e.posts} posts unresolved.`;
  if (c.verb === "investigate" || c.verb === "message") return `Nothing is build-ready yet; worth a closer look: ${c.theme}, ${e.unresolved} of ${e.posts} posts unresolved.`;
  return e.fit === "low"
    ? `No theme is ready to build or test; the loudest, ${c.theme} (${e.posts} posts), sits outside the product.`
    : `No theme is ready to build or test; the loudest change, ${c.theme}, looks like a one-week spike.`;
}

export function computedWatch(calls: Call[]): string | null {
  const c = calls[0];
  if (!c) return null;
  if (c.verb === "build") return `Should '${c.theme}' get a time-boxed prototype next sprint, given ${c.evidence.unresolved} of ${c.evidence.posts} posts are still unresolved?`;
  if (c.verb === "investigate" || c.verb === "message") return `Can we line up 3 customer conversations about '${c.theme}' before next Friday?`;
  return null;
}

// ---------- closing the loop ----------

export type Held = { verb: Verb; title: string; theme: string; then: number; now: number; verdict: "grew" | "held" | "faded" | "none"; reconsider: boolean };

/** Did last week's calls point at durable pain? Compares this week's counts with this week's own last-week counts. */
export function signalHeld(prevCalls: unknown, themes: PainTheme[], th: Thresholds): Held[] {
  if (!Array.isArray(prevCalls)) return [];
  return (prevCalls as Partial<Call>[]).filter((c) => c && typeof c.theme === "string" && VERBS.includes(c.verb as Verb)).slice(0, 3).map((c) => {
    const named = { theme: c.theme!, topic_slug: c.topic_slug ?? null };
    const t = themes.find((x) => x.theme.toLowerCase() === named.theme.toLowerCase()) ?? themes.find((x) => themeMatch(x, named));
    const base = { verb: c.verb as Verb, title: String(c.title || c.theme), theme: named.theme };
    if (!t) return { ...base, then: 0, now: 0, verdict: "none" as const, reconsider: false };
    const then = t.prev_mentions, now = t.mentions, d = now - then;
    const k = Math.max(3, Math.ceil(2 * Math.sqrt(Math.max(then, 1))));
    const verdict = now === 0 ? "faded" : d >= k ? "grew" : d <= -k ? "faded" : "held";
    return { ...base, then, now, verdict, reconsider: base.verb === "ignore" && verdict !== "faded" && now >= th.minModerate };
  });
}

// ---------- quotes ----------

export function normText(s: string): string {
  return s.normalize("NFKC").toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ").trim();
}

/** A quote counts only if it appears word for word in the post and is 8–30 words long. */
export function verifyQuote(quote: string, title: string, body: string | null): boolean {
  const q = normText(quote).replace(/^["']|["']$/g, "").trim();
  const words = q.split(" ").filter(Boolean).length;
  return words >= 8 && words <= 30 && normText(`${title} ${body ?? ""}`).includes(q);
}

/** Many Hacker News comments on one story are one thread, so a single viral thread can't pose as market demand. */
export function threadKey(p: { source: string; title: string }): string {
  const m = p.title.match(/^Comment on “(.+)”$/);
  return `${p.source}:${(m ? m[1] : p.title).toLowerCase().replace(/\s+/g, " ").trim()}`;
}

// ---------- coverage and exports ----------

export function coverageNote(c: {
  total: number; analyzed: number; sources: { source: string; mentions: number }[]; silent: string[]; weeksTracked: number; label: (id: string) => string;
}): string {
  const parts: string[] = [];
  const share = c.total ? c.analyzed / c.total : 1;
  if (share < 0.8) parts.push("Analysis is still running, so numbers may move.");
  parts.push(`Based on ${c.total} posts${share < 0.95 ? ` (${Math.round(share * 100)}% analysed)` : ""}.`);
  const top = [...c.sources].sort((a, b) => b.mentions - a.mentions)[0];
  if (top && c.total && top.mentions / c.total >= 0.6) parts.push(`${Math.round((100 * top.mentions) / c.total)}% come from ${c.label(top.source)}, so this leans toward its audience.`);
  if (c.silent.length) parts.push(`${c.silent.join(" and ")} returned nothing this week.`);
  if (c.weeksTracked < 8) parts.push(`History covers ${c.weeksTracked} week${c.weeksTracked === 1 ? "" : "s"} so far.`);
  parts.push("Signals come from public developer posts, not customer data.");
  return parts.join(" ");
}

export function ticketMarkdown(c: Call, summary: string | null, weekLabel: string, url: string): string {
  const e = c.evidence;
  const ev = [`${e.posts} posts (${e.last_week} last wk)`, `${e.unresolved} unresolved`, e.blocking != null ? `${e.blocking} block work` : "", e.threads != null ? `${e.threads} separate threads` : "", `seen ${e.weeks_seen}/${e.weeks_tracked} weeks`].filter(Boolean).join(", ");
  return [
    `## ${c.title}`,
    `Call: ${VERB_LABEL[c.verb].toUpperCase()} · ${STRENGTH_LABEL[e.strength]} · Fit: ${FIT_LABEL[e.fit]}`,
    `Problem: ${c.theme}${summary ? `: ${summary}` : ""}`,
    `Evidence (week of ${weekLabel}): ${ev}`,
    c.quote ? `Quote: "${c.quote.text}" (${c.quote.source}, ${c.quote.url})` : "",
    c.next_step ? `Next step: ${c.next_step}` : "",
    c.pitch ? `Proposed pitch: ${c.pitch}` : "",
    c.metric ? `Success metric: ${c.metric}; market baseline ${e.posts} posts / ${e.unresolved} unresolved (week of ${weekLabel})` : "",
    c.ask_question ? `Validate with: ${c.ask_who ? `${c.ask_who}: ` : ""}"${c.ask_question}"` : "",
    `Source: ${url}`,
  ].filter(Boolean).join("\n");
}

export function memoText(m: { weekLabel: string; headline: string; calls: Call[]; watch: string | null; lean?: { lean: string; because: string } | null; url: string }): string {
  const line = (c: Call) => {
    if (c.verb === "ignore") return `IGNORE FOR NOW: ${c.title}. Revisit if: ${c.revisit_if}`;
    if (c.verb === "message") return `MESSAGE: ${c.title}.${c.pitch ? ` Say: "${c.pitch}"` : ` Next: ${c.next_step}`}`;
    return `${VERB_LABEL[c.verb].toUpperCase()}: ${c.title}. Next: ${c.next_step}`;
  };
  return [
    `Dev pulse, ${m.weekLabel}`,
    m.headline,
    "",
    ...m.calls.map(line),
    "",
    m.watch ? `Ask Monday: ${m.watch}${m.lean ? ` (Gemini leans ${m.lean.lean}: ${m.lean.because})` : ""}` : "",
    m.url,
  ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== "")).join("\n").trim();
}

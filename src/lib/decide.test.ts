// Run with: npm test   (node --test, TypeScript types are stripped by Node)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedNumbers, callsFrom, checkText, computedCalls, computedHeadline, computedWatch, evidenceFor, headlineOk, orderCalls,
  signalHeld, themeMatch, threadKey, thresholds, validateCalls, verifyQuote, weeksTrackedIn, type Evidence,
} from "./decide.ts";
import type { PainTheme } from "./types.ts";

const WEEKS = ["2026-08-14", "2026-08-21", "2026-08-28", "2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02"];
const W = "2026-10-02";
const theme = (name: string, topic: string, n: number, p: number, u: number, underserved: boolean): PainTheme => ({
  week_start: W, theme: name, topic_slug: topic, mentions: n, prev_mentions: p, unresolved: u, avg_sentiment: -0.4,
  underserved, summary: null, example_ids: [],
});
// Production week 2–8 Oct 2026 (119 pain posts, 228 posts the week before).
const THEMES = [
  theme("Third-party dependency supply chain attacks threaten PRs", "security-in-prs", 13, 10, 10, true),
  theme("Large AI PRs create massive review bottlenecks", "review-bottlenecks", 12, 14, 9, true),
  theme("AI review bots produce noisy false positives", "automated-review-quality", 11, 9, 7, true),
  theme("Static analysis linters trigger excessive false warnings", "static-analysis-linters", 9, 1, 5, false),
  theme("Teams rubber stamp unreviewed PRs for speed", "review-culture", 8, 10, 5, false),
  theme("AI tools miss critical bugs and architecture issues", "automated-review-quality", 6, 10, 6, true),
];
const th = thresholds(119);
const evs = evidenceFor({ week: W, weeks: WEEKS, themes: THEMES, history: [], prevTotal: 228, th });
const by = (name: string) => evs.find((e) => e.theme.startsWith(name)) as Evidence;

test("thresholds scale with pain volume", () => {
  assert.deepEqual([th.minStrong, th.minModerate], [8, 5]);
  assert.deepEqual([thresholds(400).minStrong, thresholds(400).minModerate], [26, 16]);
});

test("evidence on the production week", () => {
  assert.equal(by("Large AI PRs").weeksTracked, 2, "this week + last week (known through prev_mentions)");
  assert.equal(by("Large AI PRs").strength, "strong");
  assert.ok(by("Large AI PRs").allowed.includes("build"));
  assert.ok(by("Static analysis").spike, "1 → 9 is a one-week spike");
  assert.ok(by("Static analysis").allowed.includes("ignore"));
  assert.ok(!by("Static analysis").allowed.includes("build"));
  assert.ok(!by("Third-party").allowed.includes("build"), "security sits next to the product by default");
  assert.ok(by("Third-party").allowed.includes("investigate"));
  assert.equal(by("AI tools miss").strength, "moderate", "6 posts is below the strong bar of 8");
});

test("computed calls: build, a different kind of bet to investigate, and the spike to ignore", () => {
  const calls = computedCalls(evs, W);
  assert.deepEqual(calls.map((c) => [c.verb, c.theme.split(" ")[0]]), [["build", "Large"], ["investigate", "Third-party"], ["ignore", "Static"]]);
  assert.match(calls[0].why, /^9 of 12 posts still unresolved/);
  assert.match(calls[2].revisit_if, /9\+ posts/);
  assert.match(computedHeadline(calls)!, /^Strongest build case: Large AI PRs/);
  assert.match(computedWatch(calls)!, /9 of 12 posts/);
});

test("cold start: no build call with only one tracked week", () => {
  const cold = evidenceFor({ week: W, weeks: WEEKS, themes: THEMES, history: [], prevTotal: 0, th });
  assert.ok(cold.every((e) => !e.allowed.includes("build")));
  assert.ok(computedCalls(cold, W).every((c) => c.verb !== "build"));
});

test("Gemini's ratings change fit, and fit gates build", () => {
  const rated = evidenceFor({
    week: W, weeks: WEEKS, themes: THEMES, history: [], prevTotal: 228, th,
    ratings: [{ theme: THEMES[0].theme, relevance: "high", why: "" }, { theme: THEMES[1].theme, relevance: "low", why: "" }],
  });
  const f = (s: string) => rated.find((e) => e.theme.startsWith(s))!;
  assert.ok(f("Third-party").allowed.includes("build"));
  assert.ok(!f("Large AI PRs").allowed.includes("build"));
  assert.ok(f("Large AI PRs").allowed.includes("ignore"), "loud but outside the product");
});

test("validation: unknown themes dropped, disallowed verbs downgraded, invented numbers and money replaced", () => {
  const nums = allowedNumbers({ rows: [{ posts: 12, last_week: 14, unresolved: 9 }] }, evs);
  const calls = validateCalls([
    { theme: "Not a theme", verb: "build", title: "x", why: "x", next_step: "x" },
    { theme: THEMES[3].theme, verb: "build", title: "Linter noise filter", why: "Up 800%", next_step: "Build it" },
    { theme: THEMES[1].theme, verb: "build", title: "Split AI PRs over 400 lines", why: "9 of 12 posts are unresolved.", next_step: "Boost revenue now", pitch: "Review 12 PRs faster", ask_who: "u/someone", ask_question: "Tell me about it", metric: "Median review time for PRs" },
    { theme: THEMES[2].theme, verb: "ignore", title: "x", why: "x" },
  ], evs, nums, W);
  assert.equal(calls.length, 2);
  const linter = calls.find((c) => c.theme === THEMES[3].theme)!;
  assert.equal(linter.verb, "investigate", "build is not allowed on a spike, so it falls back to investigate");
  assert.equal(linter.title, linter.theme, "downgraded calls use the templates");
  const big = calls.find((c) => c.theme === THEMES[1].theme)!;
  assert.equal(big.title, big.theme, "400 is not in the data");
  assert.equal(big.why, "9 of 12 posts are unresolved.");
  assert.match(big.next_step, /^Sumit turns/, "money talk is replaced");
  assert.equal(big.ask_who, "", "handles are never kept");
  assert.equal(big.ask_question, "", "questions must end with ?");
  assert.equal(big.pitch, "Review 12 PRs faster");
});

test("text checks", () => {
  assert.ok(checkText("9 of 12 posts", new Set([9, 12])));
  assert.ok(!checkText("worth $40k ARR", null));
  assert.ok(!checkText("the best tool", null));
  assert.ok(!checkText("1,200 posts", new Set([12, 1])));
  const calls = computedCalls(evs, W);
  assert.ok(headlineOk("Large AI pull requests stall reviews: 9 of 12 unresolved", calls, new Set([9, 12])));
  assert.ok(!headlineOk("Linter noise jumped 123 percent", calls, new Set([123])), "not about call #1");
  assert.ok(!checkText("Review large AI PRs 2x faster", null), "invented multiplier");
  assert.ok(!checkText("Saves teams 5k a year", null), "money without a currency sign");
  assert.ok(!checkText("save 3 hours a week", null), "invented time saving");
  assert.ok(checkText("It stays at 9+ posts for 2 more weeks.", new Set([9, 2])));
});

test("stored calls are used when present, computed otherwise", () => {
  assert.equal(callsFrom({}, evs, W).source, "computed");
  const stored = { calls_version: 1, calls_source: "gemini", calls: [{ theme: THEMES[1].theme, verb: "build", title: "Reviewer aid for large AI PRs", why: "9 of 12 unresolved.", next_step: "Engineering spikes a PR splitter." }] };
  const r = callsFrom(stored, evs, W);
  assert.equal(r.source, "gemini");
  assert.equal(r.calls[0].title, "Reviewer aid for large AI PRs");
  const msg = callsFrom({ calls_version: 1, calls_source: "gemini", calls: [{ theme: THEMES[2].theme, verb: "message", title: "Prove precision", why: "x", next_step: "x" }] }, evs, W);
  assert.equal(msg.calls[0].verb, "investigate", "a message without a verified quote is downgraded");
});

test("did the signal hold", () => {
  const held = signalHeld([{ verb: "build", theme: THEMES[1].theme, title: "t" }, { verb: "ignore", theme: "Gone theme", title: "g" }], THEMES, th);
  assert.equal(held[0].verdict, "held", "14 → 12 is within noise (k = 8)");
  assert.equal(held[1].verdict, "none");
  const grew = signalHeld([{ verb: "ignore", theme: THEMES[3].theme }], THEMES, th);
  assert.equal(grew[0].verdict, "grew", "1 → 9 is beyond k = 3");
  assert.ok(grew[0].reconsider, "an ignored theme that is still loud is flagged");
});

test("theme identity, threads and quotes", () => {
  assert.ok(themeMatch({ theme: "AI review bots produce noisy false positives", topic_slug: "a" }, { theme: "AI review bots produce too many false positives", topic_slug: "a" }));
  assert.ok(!themeMatch({ theme: "AI review bots produce noisy false positives", topic_slug: "a" }, { theme: "AI review bots produce too many false positives", topic_slug: "b" }), "different topic");
  assert.ok(!themeMatch({ theme: "Flaky tests block merges", topic_slug: "a" }, { theme: "Merge queues are slow", topic_slug: "a" }));
  assert.equal(threadKey({ source: "hackernews", title: "Comment on “Ask HN: Code review”" }), threadKey({ source: "hackernews", title: "Comment on “Ask HN:  code review”" }));
  const body = "Honestly our AI reviewer leaves <b>forty</b> comments per PR and maybe two of them are worth reading at all.";
  assert.ok(verifyQuote("our AI reviewer leaves forty comments per PR and maybe two of them are worth reading", "t", body));
  assert.ok(!verifyQuote("our AI reviewer leaves 40 comments per PR and maybe two are worth reading", "t", body), "paraphrase");
  assert.ok(!verifyQuote("our AI reviewer leaves forty", "t", body), "too short");
});

// ---------- regressions found in review ----------

test("calls are ordered build, investigate, message, ignore, whatever order Gemini used", () => {
  const stored = { calls_version: 1, calls_source: "gemini", calls: [
    { theme: THEMES[3].theme, verb: "ignore", title: "Linter spike", why: "x", revisit_if: "It stays at 9+ posts for 2 more weeks." },
    { theme: THEMES[0].theme, verb: "investigate", title: "Dependency checks in review", why: "13 posts.", next_step: "Sumit asks 3 customers." },
    { theme: THEMES[1].theme, verb: "build", title: "Reviewer aid for large AI PRs", why: "9 of 12 unresolved.", next_step: "Engineering prototypes it." },
  ] };
  const r = callsFrom(stored, evs, W);
  assert.deepEqual(r.calls.map((c) => c.verb), ["build", "investigate", "ignore"]);
  assert.match(computedHeadline(r.calls)!, /^Strongest build case/);
  assert.deepEqual(orderCalls(r.calls.slice().reverse(), evs).map((c) => c.verb), ["build", "investigate", "ignore"]);
});

test("a one-week spike is never strong evidence, and is never 'from 0' without last week's data", () => {
  assert.equal(by("Static analysis").strength, "moderate");
  assert.ok(by("Static analysis").allowed.includes("ignore"), "still ignore-able");
  const cold = evidenceFor({ week: W, weeks: WEEKS, themes: THEMES, history: [], prevTotal: 0, th });
  assert.ok(cold.every((e) => !e.spike), "no data for last week, so no spikes");
  const calls = computedCalls(cold, W);
  assert.ok(calls.every((c) => !/up from 0|Jumped from 0/.test(c.why)));
  assert.match(calls[0].why, /only one week of history/);
});

test("the headline must not lead with the theme the page says to ignore", () => {
  const calls = computedCalls(evs, W); // build Large AI PRs, investigate supply chain, ignore static analysis linters
  const nums = new Set([123, 9, 12]);
  assert.ok(!headlineOk("Static analysis discussions jumped 123 percent while PR bottlenecks rose sharply.", calls, nums));
  assert.ok(!headlineOk("Large AI PR bottlenecks grew to 40 posts", calls, new Set([40])), "40 is not in call #1's own numbers");
  assert.ok(headlineOk("Large AI PRs stall reviews: 9 of 12 posts still unresolved", calls, nums));
});

test("interview profiles may mention team sizes; other fields may not invent numbers", () => {
  const nums = allowedNumbers({ rows: [{ posts: 12, last_week: 14, unresolved: 9 }] }, evs);
  const [c] = validateCalls([{ theme: THEMES[1].theme, verb: "build", title: "Reviewer aid", why: "9 of 12 unresolved.", next_step: "Engineering prototypes it.", ask_who: "Tech leads on 20-50 engineer teams using GitHub", pitch: "Review AI PRs 2x faster" }], evs, nums, W);
  assert.equal(c.ask_who, "Tech leads on 20-50 engineer teams using GitHub");
  assert.equal(c.pitch, "", "a made-up multiplier never reaches the sales line");
});

test("off-product ignores aren't called spikes; weeks tracked doesn't depend on themes", () => {
  const merge = evidenceFor({ week: W, weeks: WEEKS, themes: [theme("Merge queues stall on flaky checks", "merge-workflow", 10, 9, 4, false)], history: [], prevTotal: 228, th });
  const calls = computedCalls(merge, W);
  assert.equal(calls[0].verb, "ignore");
  assert.match(computedHeadline(calls)!, /outside the product/);
  assert.equal(weeksTrackedIn({ week: W, weeks: WEEKS, history: [], prevTotal: 228 }).filter(Boolean).length, 2);
  assert.match(computedWatch(computedCalls(evs, W))!, /time-boxed prototype/);
});

test("a repeated on-page label is removed from Gemini's text", () => {
  const [c] = validateCalls([{ theme: THEMES[3].theme, verb: "ignore", title: "Linter noise", why: "9 posts.", revisit_if: "Revisit if posts exceed 12 in a single week." }], evs, new Set([9, 12]), W);
  assert.equal(c.revisit_if, "Posts exceed 12 in a single week.");
});


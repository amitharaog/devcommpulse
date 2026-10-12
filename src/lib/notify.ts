import "server-only";
import { VERB_LABEL, type Call } from "./decide";

type Brief = {
  weekLabel: string; headline: string; bullets: string[]; watch?: string | null; url: string;
  calls?: Call[]; decision?: { lean: string; because: string } | null;
};

function callLine(c: Call): string {
  const verb = VERB_LABEL[c.verb].toUpperCase();
  if (c.verb === "ignore") return `${verb}: ${c.title}. Revisit if: ${c.revisit_if}`;
  if (c.verb === "message" && c.pitch) return `${verb}: ${c.title}. Say: "${c.pitch}"`;
  return `${verb}: ${c.title}. Next: ${c.next_step}`;
}

/** Optional delivery of the Friday brief to Slack and/or email (Resend). Calls first, then what moved. Silently skipped when not configured. */
export async function deliverBrief(b: Brief) {
  const sent: string[] = [];
  const calls = b.calls ?? [];
  const lean = b.decision ? ` (Gemini leans ${b.decision.lean}: ${b.decision.because})` : "";
  const text = [
    `*Calls for ${b.weekLabel}*`,
    `*${b.headline}*`,
    ...calls.map((c) => `• ${callLine(c)}`),
    b.watch ? `_Ask Monday:_ ${b.watch}${lean}` : "",
    `<${b.url}|Open the memo>`,
    b.bullets.length ? `\nMore this week:\n${b.bullets.map((x) => `• ${x}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  if (process.env.SLACK_WEBHOOK_URL) {
    const r = await fetch(process.env.SLACK_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
    if (r?.ok) sent.push("slack");
  }

  if (process.env.RESEND_API_KEY && process.env.DIGEST_EMAIL_TO) {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#14213D">
      <p style="color:#5C6B82;margin:0 0 4px">Calls for ${esc(b.weekLabel)}</p>
      <h2 style="margin:0 0 12px;font-size:22px;line-height:1.25">${esc(b.headline)}</h2>
      ${calls.length ? `<ul style="padding-left:18px;line-height:1.5">${calls.map((c) => `<li>${esc(callLine(c))}</li>`).join("")}</ul>` : ""}
      ${b.watch ? `<p><strong>Ask Monday:</strong> ${esc(b.watch)}${esc(lean)}</p>` : ""}
      <p><a href="${b.url}">Open the memo</a> for the evidence behind each call.</p>
      ${b.bullets.length ? `<p style="color:#5C6B82;margin:16px 0 4px">More this week</p><ul style="padding-left:18px;line-height:1.5">${b.bullets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>`;
    const first = calls[0];
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.DIGEST_EMAIL_FROM || "Pulse <onboarding@resend.dev>",
        to: process.env.DIGEST_EMAIL_TO.split(",").map((s) => s.trim()),
        subject: first ? `Dev pulse: ${VERB_LABEL[first.verb]}: ${first.title}` : `Dev pulse: ${b.headline}`,
        html,
      }),
    }).catch(() => null);
    if (r?.ok) sent.push("email");
  }
  return sent;
}

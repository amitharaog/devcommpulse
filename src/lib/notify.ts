import "server-only";

/** Optional delivery of the Friday brief to Slack and/or email (Resend). Silently skipped when not configured. */
export async function deliverBrief(b: { weekLabel: string; headline: string; bullets: string[]; watch?: string | null; url: string }) {
  const sent: string[] = [];
  const text = `*Developer pulse — ${b.weekLabel}*\n*${b.headline}*\n${b.bullets.map((x) => `• ${x}`).join("\n")}${b.watch ? `\n_Ask in sprint planning:_ ${b.watch}` : ""}\n<${b.url}|Open the dashboard>`;

  if (process.env.SLACK_WEBHOOK_URL) {
    const r = await fetch(process.env.SLACK_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
    if (r?.ok) sent.push("slack");
  }

  if (process.env.RESEND_API_KEY && process.env.DIGEST_EMAIL_TO) {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#14213D">
      <p style="color:#5C6B82;margin:0 0 4px">Developer pulse, ${esc(b.weekLabel)}</p>
      <h2 style="margin:0 0 12px;font-size:22px;line-height:1.25">${esc(b.headline)}</h2>
      <ul style="padding-left:18px;line-height:1.5">${b.bullets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${b.watch ? `<p><strong>Ask in sprint planning:</strong> ${esc(b.watch)}</p>` : ""}
      <p><a href="${b.url}">Open the dashboard</a> for charts and deep dives.</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.DIGEST_EMAIL_FROM || "Pulse <onboarding@resend.dev>",
        to: process.env.DIGEST_EMAIL_TO.split(",").map((s) => s.trim()),
        subject: `Dev pulse: ${b.headline}`,
        html,
      }),
    }).catch(() => null);
    if (r?.ok) sent.push("email");
  }
  return sent;
}

import "server-only";
import { sleep } from "./http";

/**
 * All AI in devcommpulse runs on Gemini Flash via the Gemini API (generateContent).
 * GEMINI_MODEL is tried first (default gemini-3.6-flash). If that model is not available
 * on the key (404, or a free-tier key with zero quota for it), GEMINI_FALLBACK_MODEL is used.
 */
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

function models(): string[] {
  const list = [process.env.GEMINI_MODEL || "gemini-3.6-flash", process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash"];
  return [...new Set(list.filter(Boolean))];
}

let workingModel: string | null = null;

export function geminiConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

export function currentModel() {
  return workingModel ?? models()[0];
}

type Opts = { system?: string; maxOutputTokens?: number; timeoutMs?: number };

class ModelUnavailable extends Error {}

async function callOnce(model: string, prompt: string, opts: Opts): Promise<string> {
  const thinking = model.startsWith("gemini-3")
    ? { thinkingLevel: "low" }
    : model.includes("2.5-flash")
      ? { thinkingBudget: 0 }
      : undefined;

  const body = {
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
      ...(thinking ? { thinkingConfig: thinking } : {}),
    },
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
      };
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join("");
      if (!text) throw new Error(`Gemini returned no text (${json.promptFeedback?.blockReason ?? json.candidates?.[0]?.finishReason ?? "unknown"})`);
      return text;
    }
    const errText = await res.text();
    const zeroQuota = res.status === 429 && /limit:\s*0\b/.test(errText);
    if (res.status === 404 || zeroQuota || (res.status === 400 && /not found|not supported|unknown name|invalid argument.*thinking/i.test(errText))) {
      throw new ModelUnavailable(`${model}: ${res.status} ${errText.slice(0, 200)}`);
    }
    if (res.status === 429 || res.status >= 500) {
      const retry = /"retryDelay":\s*"(\d+)s"/.exec(errText);
      await sleep(retry ? Math.min(Number(retry[1]) * 1000 + 500, 30_000) : 2000 * 2 ** attempt);
      continue;
    }
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
  }
  throw new Error(`Gemini ${model}: still rate-limited after retries`);
}

export function parseJSON<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error("Gemini response was not valid JSON");
  }
}

export async function geminiJSON<T>(prompt: string, opts: Opts = {}): Promise<T> {
  if (!geminiConfigured()) throw new Error("GEMINI_API_KEY is not set");
  const order = workingModel ? [workingModel, ...models().filter((m) => m !== workingModel)] : models();
  let lastErr: unknown;
  for (const model of order) {
    try {
      const text = await callOnce(model, prompt, opts);
      workingModel = model;
      try {
        return parseJSON<T>(text);
      } catch {
        // One repair attempt: ask the same model to fix its JSON.
        const fixed = await callOnce(model, `Return this as valid JSON only, fixing any syntax errors:\n${text.slice(0, 60_000)}`, opts);
        return parseJSON<T>(fixed);
      }
    } catch (e) {
      lastErr = e;
      if (e instanceof ModelUnavailable) continue;
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("No Gemini model available");
}

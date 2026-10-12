"use client";

import { useState } from "react";

/** Copies text to the clipboard. "{{url}}" in the text becomes the absolute URL of `path` on this site. */
export function CopyButton({ text, label, path, className = "" }: { text: string; label: string; path?: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    const value = text.replace(/\{\{url\}\}/g, path ? `${window.location.origin}${path}` : window.location.href);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }
  return (
    <button type="button" onClick={copy} className={className || "rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium hover:bg-paper"}>
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}

"use client";

/** Jumps to the method and opens it, so the click actually shows the rules. */
export function HowLink() {
  return (
    <a
      href="#how"
      onClick={() => { const d = document.getElementById("how") as HTMLDetailsElement | null; if (d) d.open = true; }}
      className="ml-auto text-[13px] text-cobalt hover:underline"
    >
      How calls are made ↓
    </a>
  );
}

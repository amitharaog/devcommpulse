"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/topics", label: "Topics", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/pain-points", label: "Pain points", icon: "M12 3l9 16H3L12 3zm0 6v4m0 3h.01" },
  { href: "/sources", label: "Sources", icon: "M4 5h16v4H4zM4 11h16v4H4zM4 17h16v3H4z" },
  { href: "/ask", label: "Ask AI", icon: "M4 5h16v11H8l-4 4V5zm4 5h8m-8 3h5" },
];
const SETTINGS = { href: "/settings", label: "Settings", icon: "M12 9a3 3 0 100 6 3 3 0 000-6zm8 3l2-1-2-4-2 1-2-1-1-2h-4L10 6 8 7 6 6 4 10l2 1v2l-2 1 2 4 2-1 2 1 1 2h4l1-2 2-1 2 1 2-4-2-1z" };

function useNav() {
  const path = usePathname();
  const params = useSearchParams();
  const week = params.get("week");
  const href = (h: string) => (week && h !== "/settings" ? `${h}?week=${week}` : h);
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h) || (h === "/topics" && path.startsWith("/topic/")));
  return { href, active };
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className={`flex items-center gap-2 font-display text-[18px] font-bold tracking-tight ${light ? "text-white" : "text-ink"}`}>
      <svg width="24" height="18" viewBox="0 0 22 16" aria-hidden>
        <polyline points="1,9 6,9 8.5,3 12,14 14.5,7 16,9 21,9" fill="none" stroke="#ff6b81" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      devcommpulse
    </span>
  );
}

export function Sidebar() {
  const { href, active } = useNav();
  const item = (n: typeof NAV[number]) => (
    <Link
      key={n.href}
      href={href(n.href)}
      aria-current={active(n.href) ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[14.5px] transition-colors ${
        active(n.href) ? "bg-side-2 font-medium text-white" : "text-[#b9c2d6] hover:bg-side-2/60 hover:text-white"
      }`}
    >
      <Icon d={n.icon} />
      {n.label}
    </Link>
  );
  return (
    <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col bg-side px-3 py-5 lg:flex">
      <Link href={href("/")} className="mb-7 px-3"><Logo light /></Link>
      <nav className="flex flex-col gap-1" aria-label="Main">{NAV.map(item)}</nav>
      <div className="mt-auto flex flex-col gap-4">
        <div className="rounded-lg bg-side-2/70 px-3 py-3 text-[12.5px] leading-relaxed text-[#b9c2d6]">
          <div className="mb-1 font-medium text-white">Schedule</div>
          Collection runs nightly. The brief is written every Friday at 06:00 IST.
        </div>
        <nav aria-label="Admin">{item(SETTINGS)}</nav>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const { href, active } = useNav();
  return (
    <div className="sticky top-0 z-20 bg-side lg:hidden">
      <div className="px-4 pt-3"><Logo light /></div>
      <nav className="flex gap-1 overflow-x-auto px-2 py-2" aria-label="Main">
        {[...NAV, SETTINGS].map((n) => (
          <Link key={n.href} href={href(n.href)} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${active(n.href) ? "bg-side-2 text-white" : "text-[#b9c2d6]"}`}>
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

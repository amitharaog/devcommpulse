import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "devcommpulse — what developers are struggling with this week",
  description: "Weekly digest of developer pain points around code review, CI/CD and workflow, from public communities.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Public+Sans:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-screen">
        <header className="border-b border-line bg-surface/70 backdrop-blur">
          <nav className="mx-auto flex max-w-[1080px] items-center gap-6 px-5 py-3">
            <Link href="/" className="flex items-center gap-2 font-display text-[19px] font-bold tracking-tight">
              <Pulse /> devcommpulse
            </Link>
            <div className="ml-auto flex gap-5 text-sm text-muted">
              <Link href="/" className="hover:text-ink">Brief</Link>
              <Link href="/settings" className="hover:text-ink">Topics &amp; sources</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-[1080px] px-5 pb-24 pt-8">{children}</main>
      </body>
    </html>
  );
}

function Pulse() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
      <polyline points="1,9 6,9 8.5,3 12,14 14.5,7 16,9 21,9" fill="none" stroke="var(--color-rise)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

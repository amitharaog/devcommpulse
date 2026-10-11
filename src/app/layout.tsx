import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "devcommpulse — developer pain points, weekly",
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
        <div className="flex min-h-screen">
          <Suspense><Sidebar /></Suspense>
          <div className="min-w-0 flex-1">
            <Suspense><MobileNav /></Suspense>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}

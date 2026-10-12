import Link from "next/link";
import { Sparkline } from "./bits";

export function PageHeader({ title, subtitle, actions, crumbs }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; crumbs?: { href: string; label: string }[] }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-end gap-4 px-5 py-5 lg:px-8">
        <div className="min-w-0">
          {crumbs && (
            <nav className="mb-1 flex gap-1.5 text-[13px] text-muted" aria-label="Breadcrumb">
              {crumbs.map((c) => (
                <span key={c.href} className="flex gap-1.5"><Link href={c.href} className="hover:text-ink hover:underline">{c.label}</Link><span aria-hidden>/</span></span>
              ))}
            </nav>
          )}
          <h1 className="font-display text-[26px] font-bold leading-tight tracking-[-0.015em]">{title}</h1>
          {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-[1320px] space-y-6 px-5 py-6 lg:px-8">{children}</main>;
}

export function Card({ title, subtitle, action, children, className = "", flush }: { title?: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`card flex flex-col ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-start gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {action && <div className="ml-auto min-w-0 max-w-full text-[13px]">{action}</div>}
        </div>
      )}
      <div className={flush ? "min-w-0 flex-1" : "min-w-0 flex-1 px-5 pb-5"}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, unit, delta, foot, spark, tone = "neutral" }: {
  label: string; value: React.ReactNode; unit?: string; delta?: React.ReactNode; foot?: React.ReactNode; spark?: number[]; tone?: "neutral" | "bad" | "good";
}) {
  const stroke = tone === "bad" ? "var(--color-rise)" : tone === "good" ? "var(--color-ease)" : "var(--color-cobalt)";
  return (
    <div className="card flex flex-col gap-2 px-5 py-4">
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className="flex items-end justify-between gap-3">
        <div className="num text-[30px] font-bold leading-none">{value}{unit && <span className="ml-0.5 text-[18px] text-muted">{unit}</span>}</div>
        {spark && spark.some((v) => v > 0) && <Sparkline values={spark} width={92} height={34} stroke={stroke} area />}
      </div>
      <div className="flex min-h-[20px] items-center gap-2 text-[13px] text-muted">{delta}{foot}</div>
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "rise" | "ease" | "amber" | "cobalt" }) {
  const cls = {
    neutral: "bg-paper text-muted ring-line",
    rise: "bg-rise-soft text-rise ring-rise/15",
    ease: "bg-ease-soft text-ease ring-ease/15",
    amber: "bg-amber-soft text-amber ring-amber/15",
    cobalt: "bg-cobalt-soft text-cobalt ring-cobalt/15",
  }[tone];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ${cls}`}>{children}</span>;
}

export function Tabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="border-b border-line bg-surface">
      <nav className="mx-auto flex max-w-[1320px] gap-1 overflow-x-auto px-5 lg:px-8" aria-label="Sections">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-[14px] ${t.key === active ? "border-cobalt font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 rounded-full bg-paper px-1.5 py-0.5 text-[11.5px] text-muted">{t.count}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[14px] text-muted">{children}</div>;
}

export function Freshness({ iso, label = "Updated" }: { iso?: string | null; label?: string }) {
  if (!iso) return null;
  const s = (Date.now() - Date.parse(iso)) / 1000;
  const ago = s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-[12.5px] text-muted ring-1 ring-line">
      <span className="h-1.5 w-1.5 rounded-full bg-ease" aria-hidden />{label} {ago}
    </span>
  );
}

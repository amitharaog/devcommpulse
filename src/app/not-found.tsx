import Link from "next/link";
export default function NotFound() {
  return (
    <div className="py-16">
      <h1 className="font-display text-3xl font-bold">That topic doesn&apos;t exist</h1>
      <p className="mt-3"><Link href="/" className="text-cobalt underline">Go to the brief</Link> or check <Link href="/settings" className="text-cobalt underline">Topics &amp; sources</Link>.</p>
    </div>
  );
}

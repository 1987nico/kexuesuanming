import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mianba-workspace flex min-h-screen items-center justify-center px-5 py-12 text-ink-900">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm">
        <div className="mb-3 text-xs tracking-[0.35em] text-gold-700">面霸君</div>
        <h1 className="serif text-4xl leading-tight">双手剑系统-面霸君版</h1>
        <Link className="btn-primary mt-8 w-full" href="/mianba">
          进入系统
        </Link>
      </section>
    </main>
  );
}

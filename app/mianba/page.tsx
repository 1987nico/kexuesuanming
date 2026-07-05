import Link from "next/link";

export const dynamic = "force-dynamic";

export default function MianbaHomePage() {
  return (
    <main className="mianba-workspace flex min-h-screen flex-col items-center justify-center px-5 py-16 text-ink-900 md:px-8">
      <h1 className="serif text-center text-4xl leading-tight md:text-5xl">双手剑系统-面霸君版</h1>

      <section className="mt-12 grid w-full max-w-2xl gap-5 md:grid-cols-2">
        <Link
          className="flex min-h-[120px] items-center justify-center rounded-3xl bg-white p-8 text-center text-lg font-semibold text-ink-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          href="/mianba/growth"
        >
          进入小红书笔记系统
        </Link>
        <Link
          className="flex min-h-[120px] items-center justify-center rounded-3xl bg-white p-8 text-center text-lg font-semibold text-ink-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          href="/mianba/reports"
        >
          进入报告交付系统
        </Link>
      </section>
    </main>
  );
}

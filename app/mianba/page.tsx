import Link from "next/link";
import { roleLabel } from "@/lib/auth/constants";
import { requireMianbaPageAuth } from "@/lib/auth/mianba";
import MianbaLogoutButton from "./MianbaLogoutButton";

export const dynamic = "force-dynamic";

export default async function MianbaHomePage() {
  const auth = await requireMianbaPageAuth("/mianba");

  return (
    <main className="mianba-workspace flex min-h-screen flex-col items-center justify-center px-5 py-16 text-ink-900 md:px-8">
      <div className="mb-6 rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm">
        {auth.user.display_name} · {roleLabel(auth.role)}
      </div>
      <h1 className="serif text-center text-4xl leading-tight md:text-5xl">双手剑系统-面霸君版</h1>

      <section className="mt-12 grid w-full max-w-3xl gap-5 md:grid-cols-2">
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
        {auth.role === "admin" && (
          <Link
            className="flex min-h-[120px] items-center justify-center rounded-3xl bg-white p-8 text-center text-lg font-semibold text-ink-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            href="/mianba/orders"
          >
            进入订单后台
          </Link>
        )}
        {auth.role === "admin" && (
          <Link
            className="flex min-h-[120px] items-center justify-center rounded-3xl bg-white p-8 text-center text-lg font-semibold text-ink-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            href="/mianba/dashboard"
          >
            进入管理驾驶舱
          </Link>
        )}
        {auth.role === "admin" && (
          <Link
            className="flex min-h-[120px] items-center justify-center rounded-3xl bg-white p-8 text-center text-lg font-semibold text-ink-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            href="/mianba/admin"
          >
            进入管理员后台
          </Link>
        )}
      </section>
      <div className="mt-8">
        <MianbaLogoutButton />
      </div>
    </main>
  );
}

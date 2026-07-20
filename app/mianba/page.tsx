import Link from "next/link";
import { roleLabel } from "@/lib/auth/constants";
import { requireMianbaPageAuth } from "@/lib/auth/mianba";
import MianbaLogoutButton from "./MianbaLogoutButton";

export const dynamic = "force-dynamic";

export default async function MianbaHomePage() {
  const auth = await requireMianbaPageAuth("/mianba");
  const cards = [
    { href: "/mianba/growth", label: "进入小红书笔记系统", adminOnly: false },
    { href: "/mianba/reports", label: "进入报告交付系统", adminOnly: false },
    { href: "/mianba/orders", label: "进入订单后台", adminOnly: true },
    { href: "/mianba/dashboard", label: "进入管理驾驶舱", adminOnly: true },
    { href: "/mianba/admin", label: "进入管理员后台", adminOnly: true },
  ].filter((card) => !card.adminOnly || auth.role === "admin");

  return (
    <main className="mianba-workspace min-h-screen px-5 pb-16 pt-24 text-ink-900 md:px-10 md:pt-32">
      <header className="mx-auto flex w-full max-w-[1018px] flex-col items-center text-center">
        <div className="rounded-full bg-white px-8 py-4 text-2xl leading-none text-[#5d5545] shadow-[0_2px_10px_rgba(25,23,15,0.08)] md:px-9 md:py-5 md:text-[28px]">
          {auth.user.display_name} · {roleLabel(auth.role)}
        </div>
        <h1 className="serif mt-14 text-center text-[48px] leading-tight tracking-normal text-ink-900 md:mt-16 md:text-[70px]">
          双手剑系统-面霸君版
        </h1>
      </header>

      <section className="mx-auto mt-24 flex w-full max-w-[1018px] flex-col gap-10">
        {cards.map((card) => (
          <Link
            key={card.href}
            className="flex min-h-[180px] items-center justify-center rounded-[36px] bg-white p-8 text-center text-2xl font-semibold leading-tight text-ink-900 shadow-[0_2px_10px_rgba(25,23,15,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(25,23,15,0.08)] md:min-h-[240px] md:rounded-[48px] md:text-[34px]"
            href={card.href}
          >
            {card.label}
          </Link>
        ))}
      </section>
      <div className="mt-12 flex justify-center">
        <MianbaLogoutButton />
      </div>
    </main>
  );
}

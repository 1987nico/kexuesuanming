import Link from "next/link";

export const dynamic = "force-dynamic";

export default function MianbaHomePage() {
  return (
    <main className="mianba-workspace min-h-screen px-5 py-8 text-ink-900 md:px-8">
      <header className="mb-10">
        <div className="mb-3 text-xs uppercase tracking-[0.35em] text-gold-700">Mianba OS</div>
        <h1 className="serif text-4xl leading-tight md:text-5xl">面霸君系统</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
          两套独立系统：增长系统负责小红书内容生产，报告交付系统负责测评报告交付。共用一个账号与后台。
        </p>
      </header>

      <section className="grid gap-5 md:grid-cols-2">
        <PortalCard
          eyebrow="Growth"
          title="增长系统"
          desc="小红书内容工厂：账号定位卡 → 选题 → 正文 → 封面 → 复盘。商家 / 买家 / 专家三种视角。"
          href="/mianba/growth"
          cta="进入增长系统"
          points={["账号定位卡可编辑", "每次生成 2 个不重复选题", "正文 2 选 1、封面 2 幅", "发布后复盘与建议"]}
        />
        <PortalCard
          eyebrow="Delivery"
          title="报告交付系统"
          desc="职场测评报告：测试链接 → 客户答题 → 生成底稿 → 交付小报告 / 大报告 → 订单管理。"
          href="/mianba/reports"
          cta="进入报告交付系统"
          points={["252 题站内测评", "PrinciplesYou 真实同步 + 本地兜底", "小报告 / 大报告一致", "报告订单与状态"]}
        />
      </section>

      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">其他入口</h2>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-full bg-ink-50 px-4 py-2 text-sm text-ink-700" href="/mianba/orders">报告订单后台</Link>
          <Link className="rounded-full bg-ink-50 px-4 py-2 text-sm text-ink-700" href="/mianba/reports/new">客户测评页（测试链接）</Link>
        </div>
      </section>
    </main>
  );
}

function PortalCard({
  eyebrow,
  title,
  desc,
  href,
  cta,
  points,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  href: string;
  cta: string;
  points: string[];
}) {
  return (
    <div className="flex flex-col rounded-3xl bg-white p-6 shadow-sm">
      <div className="text-xs uppercase tracking-[0.25em] text-gold-700">{eyebrow}</div>
      <h2 className="serif mt-2 text-2xl">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-ink-600">{desc}</p>
      <ul className="mt-4 space-y-2 text-sm text-ink-700">
        {points.map((point) => (
          <li key={point} className="flex gap-2">
            <span className="text-gold-600">·</span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <Link className="btn-primary mt-6 inline-block text-center" href={href}>
        {cta}
      </Link>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    try {
      const r = await fetch("/api/runs", { method: "POST" });
      const { run } = await r.json();
      router.push(`/run/${run.id}/survey`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 px-7 pt-20 pb-8">
        <div className="text-xs text-ink-400 tracking-[0.3em] uppercase mb-6">Methodology 5 + 1</div>
        <h1 className="serif text-[44px] leading-[1.1] text-ink-900 mb-6">
          科学算命
          <br />
          <span className="text-ink-500">五步漏斗</span>
        </h1>
        <p className="text-ink-600 leading-relaxed mb-4 text-[15px]">
          把职业/事业选择做成一个漏斗：从「喜欢的范围」里发散，再用感性、市场、资源三层验证，
          最后用「失败验尸」把可能的输法先想清楚。
        </p>
        <div className="divider-ink my-7" />
        <div className="space-y-4 text-[15px] text-ink-700">
          <Step n="1" title="圈定边界" desc="价值观双三圈：喜欢区 × 排除带" />
          <Step n="2" title="机会发散" desc="行业 × 角色 × 模式 三维拼出 30 个候选" />
          <Step n="3" title="感性验证" desc="逐条 0–10 分，只有 ≥7 进下一步" highlight />
          <Step n="4" title="市场验证" desc="PEST + 波特五力 现状/演化双评分，收敛到 ~6" />
          <Step n="5" title="资源验证" desc="VRIN 四维 + 决策矩阵，收口到 Top 3" />
          <Step n="6" title="失败验尸" desc="12 个月后写复盘：如果输了，怎么输？" highlight />
        </div>
      </div>
      <div className="px-7 pb-10">
        <Button size="lg" className="w-full" onClick={start} disabled={loading}>
          {loading ? "准备中…" : "开始一次完整诊断"}
        </Button>
        <p className="text-center text-xs text-ink-400 mt-4">
          全程约 35–60 分钟 · Step 3 需本人逐条打分
        </p>
      </div>
    </main>
  );
}

function Step({
  n,
  title,
  desc,
  highlight,
}: {
  n: string;
  title: string;
  desc: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div
        className={
          "shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold " +
          (highlight ? "bg-gold-500 text-white" : "bg-ink-100 text-ink-700")
        }
      >
        {n}
      </div>
      <div className="flex-1 -mt-0.5">
        <div className="text-ink-900 font-medium">{title}</div>
        <div className="text-ink-500 text-sm mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

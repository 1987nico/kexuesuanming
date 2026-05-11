"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ThinkingDots } from "@/components/ui/Loading";
import type { Step2Output } from "@/lib/llm/prompts/step2";

export default function Step2Page({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<Step2Output | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await (await fetch(`/api/runs/${params.id}`)).json();
        if (snap?.step2?.opportunities?.length) {
          setData(snap.step2);
          setLoading(false);
          return;
        }
        const r = await fetch(`/api/runs/${params.id}/step2/generate`, { method: "POST" });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "生成失败");
        setData(json.data);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  return (
    <main>
      <PageHeader step="Step 2 · 机会发散" title="30 个画面化候选" subtitle="行业 × 角色 × 商业模式 三维拼接" />
      <div className="px-5 pt-6 pb-32">
        {loading && <ThinkingDots label="正在发散 30 条候选并抓外部佐证…（约需 1–3 分钟）" />}
        {err && (
          <div className="p-4 rounded-xl border border-danger-400/50 bg-danger-400/5 text-danger-600 text-sm">
            生成失败：{err}
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                重试
              </Button>
            </div>
          </div>
        )}
        {data && (
          <div>
            <p className="text-sm text-ink-500 mb-5">
              已生成 <b className="text-ink-900">{data.opportunities.length}</b> 条候选。下一步逐条打分，让身体替你判断。
            </p>
            <div className="space-y-2.5">
              {data.opportunities.slice(0, 6).map((o) => (
                <div key={o.idx} className="card-soft p-4">
                  <div className="text-xs text-ink-400 mb-1">#{o.idx} · {o.category}</div>
                  <div className="text-ink-900 font-medium">{o.title}</div>
                  <div className="text-ink-500 text-sm mt-1">{o.oneLiner}</div>
                </div>
              ))}
              <div className="text-center text-xs text-ink-400 py-3">… 还有 {Math.max(0, data.opportunities.length - 6)} 条，进入 Step 3 逐条查看</div>
            </div>
          </div>
        )}
      </div>
      {data && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto p-5 bg-gradient-to-t from-ink-50 via-ink-50/95 to-transparent">
          <Button size="lg" className="w-full" onClick={() => router.push(`/run/${params.id}/step3`)}>
            Step 3 · 开始感性验证
          </Button>
        </div>
      )}
    </main>
  );
}

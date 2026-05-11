"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ThinkingDots } from "@/components/ui/Loading";
import { cn } from "@/lib/utils";
import type { Step5Output } from "@/lib/llm/prompts/step5";
import type { Step2Opportunity } from "@/lib/llm/prompts/step2";

export default function Step5Page({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<Step5Output | null>(null);
  const [opps, setOpps] = useState<Step2Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await (await fetch(`/api/runs/${params.id}`)).json();
        setOpps(snap?.step2?.opportunities ?? []);
        if (snap?.step5) {
          setData(snap.step5);
          setLoading(false);
          return;
        }
        const r = await fetch(`/api/runs/${params.id}/step5/generate`, { method: "POST" });
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

  const oppMap = new Map(opps.map((o) => [o.idx, o]));

  return (
    <main>
      <PageHeader step="Step 5 · 资源验证" title="VRIN + Top 3" subtitle="我，能不能赢？" />
      <div className="px-5 pt-6 pb-32">
        {loading && <ThinkingDots label="对 shortlist 跑 VRIN 评分 + 决策矩阵…" />}
        {err && <p className="text-danger-600 text-sm">{err}</p>}
        {data && (
          <div className="space-y-7">
            {/* Top 3 决策矩阵 */}
            <section>
              <h3 className="serif text-lg text-ink-900 mb-3">决策矩阵 · Top 3</h3>
              <div className="space-y-3">
                {data.decisionMatrix
                  .filter((d) => data.top3.includes(d.idx))
                  .sort((a, b) => a.rank - b.rank)
                  .map((d, i) => {
                    const opp = oppMap.get(d.idx);
                    return (
                      <div key={d.idx} className="card-soft p-5 relative overflow-hidden">
                        <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full bg-gold-400/15" />
                        <div className="flex items-baseline gap-2 mb-2 relative">
                          <div className="serif text-3xl text-gold-600 leading-none">No.{d.rank}</div>
                          <div className="text-xs text-ink-400">#{d.idx}</div>
                        </div>
                        <div className="serif text-xl text-ink-900 leading-tight relative">{opp?.title ?? d.title}</div>
                        <div className="text-ink-500 text-sm mt-1.5 relative">{opp?.oneLiner}</div>
                        <div className="grid grid-cols-3 gap-3 mt-4 relative">
                          <Metric label="机会大小" value={d.opportunitySize} unit="/20" />
                          <Metric label="个人胜算" value={d.personalEdge} unit="/20" />
                          <Metric label="综合分" value={Math.round(d.composite * 10) / 10} unit="" />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>

            {/* VRIN 详细 */}
            <section>
              <h3 className="serif text-lg text-ink-900 mb-3">VRIN 详细评分</h3>
              <div className="space-y-3">
                {data.vrins.map((v) => {
                  const opp = oppMap.get(v.idx);
                  const isTop = data.top3.includes(v.idx);
                  return (
                    <div key={v.idx} className={cn("card-soft p-4", isTop && "ring-1 ring-gold-400")}>
                      <div className="flex items-start gap-3">
                        <div className="text-center w-14 shrink-0">
                          <div className="serif text-2xl text-ink-900">{v.total}</div>
                          <div className="text-[10px] text-ink-400">/20</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-ink-400 mb-0.5">#{v.idx}</div>
                          <div className="text-ink-900 font-medium">{opp?.title ?? v.title}</div>
                          <div className="grid grid-cols-4 gap-1.5 mt-2.5 text-center">
                            <Vrin label="V" score={v.v} />
                            <Vrin label="R" score={v.r} />
                            <Vrin label="I" score={v.i} />
                            <Vrin label="N" score={v.n} />
                          </div>
                          <details className="mt-3 group">
                            <summary className="text-xs text-ink-500 cursor-pointer hover:text-ink-900">
                              展开凭证 / 90 天动作
                            </summary>
                            <div className="mt-3 space-y-2 text-[13px] text-ink-700">
                              <div><b>V:</b> {v.evidence?.v}</div>
                              <div><b>R:</b> {v.evidence?.r}</div>
                              <div><b>I:</b> {v.evidence?.i}</div>
                              <div><b>N:</b> {v.evidence?.n}</div>
                              <div className="pt-2 border-t border-ink-100">
                                <div className="text-xs text-ink-400 mb-1.5">90 天动作</div>
                                <ul className="space-y-1.5">
                                  {v.ninetyDayActions?.map((a, i) => (
                                    <li key={i} className="text-[13px]">
                                      <span className="text-xs text-gold-600 mr-2">{a.day}</span>
                                      {a.action}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </details>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
      {data && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto p-5 bg-gradient-to-t from-ink-50 via-ink-50/95 to-transparent">
          <Button size="lg" className="w-full" variant="danger" onClick={() => router.push(`/run/${params.id}/step6`)}>
            Step 6 · 失败验尸：如果输了，怎么输？
          </Button>
        </div>
      )}
    </main>
  );
}

function Metric({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-ink-400 uppercase tracking-wider">{label}</div>
      <div className="text-ink-900 mt-1 serif">
        <span className="text-2xl">{value}</span>
        <span className="text-xs text-ink-400 ml-0.5">{unit}</span>
      </div>
    </div>
  );
}

function Vrin({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-lg bg-ink-100/60 py-2">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="font-semibold text-ink-900">{score}<span className="text-xs text-ink-300 font-normal">/5</span></div>
    </div>
  );
}

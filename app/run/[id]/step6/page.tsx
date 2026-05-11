"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ThinkingDots } from "@/components/ui/Loading";
import { cn } from "@/lib/utils";
import type { Step2Opportunity } from "@/lib/llm/prompts/step2";
import type { Step5VRINItem } from "@/lib/llm/prompts/step5";
import type { Step6Output, PremortemLayer } from "@/lib/llm/prompts/step6";
import { PREMORTEM_LAYER_LABELS } from "@/lib/llm/prompts/step6";

const LAYER_SHORT: Record<PremortemLayer, string> = {
  market: "市场",
  moat: "壁垒",
  capability: "能力",
  motivation: "动机",
  reality: "现实",
};

export default function Step6Page({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<Step6Output | null>(null);
  const [opps, setOpps] = useState<Step2Opportunity[]>([]);
  const [vrins, setVrins] = useState<Step5VRINItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [fearFlags, setFearFlags] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const snap = await (await fetch(`/api/runs/${params.id}`)).json();
        setOpps(snap?.step2?.opportunities ?? []);
        setVrins(snap?.step5?.vrins ?? []);
        if (snap?.step6) {
          setData(snap.step6);
          setLoading(false);
          return;
        }
        const r = await fetch(`/api/runs/${params.id}/step6/generate`, { method: "POST" });
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

  function toggleFear(key: string) {
    setFearFlags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const oppMap = new Map(opps.map((o) => [o.idx, o]));
  const vrinMap = new Map(vrins.map((v) => [v.idx, v]));

  return (
    <main className="bg-ink-900 min-h-screen text-ink-50">
      <header className="sticky top-0 z-30 bg-ink-900/90 backdrop-blur border-b border-ink-800">
        <div className="px-5 pt-6 pb-4">
          <div className="text-xs text-danger-400 tracking-[0.3em] uppercase mb-2">Step 6 · Pre-mortem</div>
          <h1 className="serif text-2xl text-ink-50">如果输了，会怎么输？</h1>
          <p className="text-sm text-ink-300 mt-1.5">把 12 个月后的复盘先写出来，把 90 天动作变成「证伪假设」。</p>
        </div>
      </header>

      <div className="px-5 pt-6 pb-32 space-y-10">
        {loading && (
          <div className="text-ink-300">
            <ThinkingDots label="正在反向推演每条 Top 3 的输的剧本…" />
          </div>
        )}
        {err && <p className="text-danger-400 text-sm">{err}</p>}
        {data &&
          data.premortems.map((pm) => {
            const opp = oppMap.get(pm.idx);
            const vrin = vrinMap.get(pm.idx);
            return (
              <section key={pm.idx} className="space-y-5">
                {/* 标题 */}
                <div>
                  <div className="text-xs text-danger-400 tracking-widest uppercase mb-1">候选 #{pm.idx}</div>
                  <h2 className="serif text-2xl text-ink-50 leading-tight">{opp?.title ?? pm.title}</h2>
                </div>

                {/* 输的剧本 - 第一人称叙事，占满首屏视觉重量 */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="relative p-6 rounded-2xl bg-gradient-to-br from-danger-600/30 to-ink-800 border border-danger-500/30"
                >
                  <div className="text-xs text-danger-400 tracking-wider uppercase mb-3">输的剧本 · 12 个月后</div>
                  <p className="serif text-[16px] leading-[1.85] text-ink-50/95 whitespace-pre-line">
                    {pm.narrative}
                  </p>
                </motion.div>

                {/* 5 层鱼骨 */}
                <div>
                  <h3 className="text-sm text-ink-300 mb-3 tracking-wider uppercase">5 层失败因</h3>
                  <div className="space-y-3">
                    {pm.findings.map((f, i) => {
                      const fearKey = `${pm.idx}-${f.layer}`;
                      const fear = fearFlags.has(fearKey);
                      return (
                        <div
                          key={i}
                          className={cn(
                            "p-4 rounded-xl border bg-ink-800/60 transition-all",
                            fear ? "border-danger-500" : "border-ink-700"
                          )}
                        >
                          <div className="flex items-start gap-2 mb-2">
                            <div className="text-[10px] px-2 py-0.5 rounded-full bg-danger-500/20 text-danger-400 uppercase tracking-wider shrink-0">
                              {LAYER_SHORT[f.layer]}
                            </div>
                            <div className="flex-1 text-[13px] text-ink-200">{PREMORTEM_LAYER_LABELS[f.layer]}</div>
                            <button
                              onClick={() => toggleFear(fearKey)}
                              className={cn(
                                "text-[11px] px-2 py-1 rounded-full border transition-all shrink-0",
                                fear ? "border-danger-500 bg-danger-500 text-white" : "border-ink-600 text-ink-400 hover:text-ink-100"
                              )}
                            >
                              {fear ? "✓ 最害怕" : "标记最害怕"}
                            </button>
                          </div>
                          <div className="text-ink-50 text-[15px] leading-relaxed mb-3">{f.failureReason}</div>
                          <div className="grid grid-cols-1 gap-1.5 mt-3 pt-3 border-t border-ink-700">
                            <Signal label="30 天预警" value={f.earlySignal30d} />
                            <Signal label="90 天预警" value={f.earlySignal90d} />
                            <Signal label="6 月预警" value={f.earlySignal6m} />
                          </div>
                          <div className="mt-3 pt-3 border-t border-ink-700 space-y-2">
                            <Signal label="退出红线" value={f.exitCondition} danger />
                            <Signal label="缓解动作" value={f.mitigation} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 90 天动作 ↔ 失败假设挂钩 */}
                {vrin?.ninetyDayActions && pm.actionLinks && (
                  <div>
                    <h3 className="text-sm text-ink-300 mb-3 tracking-wider uppercase">90 天动作 = 证伪假设</h3>
                    <div className="space-y-2">
                      {vrin.ninetyDayActions.map((a, i) => {
                        const links = pm.actionLinks.filter((l) => l.actionDay === a.day);
                        return (
                          <div key={i} className="p-3.5 rounded-xl bg-ink-800/60 border border-ink-700">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="text-xs text-gold-400 font-medium">{a.day}</div>
                              <div className="flex gap-1">
                                {links.map((l, j) => (
                                  <span
                                    key={j}
                                    className={cn(
                                      "text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider",
                                      fearFlags.has(`${pm.idx}-${l.failureLayer}`)
                                        ? "bg-danger-500 text-white"
                                        : "bg-danger-500/15 text-danger-400"
                                    )}
                                  >
                                    {LAYER_SHORT[l.failureLayer]}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="text-[14px] text-ink-100 leading-relaxed">{a.action}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
      </div>

      {data && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto p-5 bg-gradient-to-t from-ink-900 via-ink-900/95 to-transparent">
          <Button size="lg" className="w-full bg-ink-50 text-ink-900 hover:bg-white" onClick={() => router.push(`/run/${params.id}/report`)}>
            查看完整报告 + 反馈
          </Button>
        </div>
      )}
    </main>
  );
}

function Signal({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex gap-3 text-[13px]">
      <div className={cn("shrink-0 w-20 text-xs pt-0.5", danger ? "text-danger-400" : "text-ink-400")}>{label}</div>
      <div className={cn("flex-1", danger ? "text-danger-300" : "text-ink-200")}>{value}</div>
    </div>
  );
}

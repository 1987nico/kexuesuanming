"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ThinkingDots } from "@/components/ui/Loading";
import { cn } from "@/lib/utils";
import type { Step2Opportunity } from "@/lib/llm/prompts/step2";

interface ScoreItem {
  opp_idx: number;
  score: number;
  reason: string;
}

const SCORE_ANCHORS: { score: number; label: string; sub: string; tone: "red" | "neutral" | "gold" }[] = [
  { score: 0, label: "抵触", sub: "不想做", tone: "red" },
  { score: 3, label: "没感觉", sub: "无所谓", tone: "red" },
  { score: 5, label: "不期待", sub: "不讨厌但不期待", tone: "neutral" },
  { score: 7, label: "想试试", sub: "被点亮", tone: "gold" },
  { score: 9, label: "来劲", sub: "一想起就有劲", tone: "gold" },
  { score: 10, label: "这就是我", sub: "完全契合", tone: "gold" },
];

export default function Step3Page({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [opps, setOpps] = useState<Step2Opportunity[] | null>(null);
  const [scores, setScores] = useState<ScoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0); // 当前卡片 idx in opps
  const [expanded, setExpanded] = useState(false);
  const [showScoreDialog, setShowScoreDialog] = useState<number | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const startTimeRef = useRef<number>(Date.now());

  // 抽屉式：滑动手势
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-12, 0, 12]);
  const opacity = useTransform(x, [-200, -120, 0, 120, 200], [0.2, 1, 1, 1, 0.2]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await (await fetch(`/api/runs/${params.id}`)).json();
        if (!snap?.step2?.opportunities?.length) {
          // 还没生成，回 Step 2
          router.replace(`/run/${params.id}/step2`);
          return;
        }
        setOpps(snap.step2.opportunities);
        const existing = snap.step3Scores ?? [];
        setScores(existing);
        // 跳到第一个未评分的
        const firstUnscored = snap.step2.opportunities.findIndex(
          (o: Step2Opportunity) => !existing.find((s: ScoreItem) => s.opp_idx === o.idx)
        );
        setCursor(firstUnscored === -1 ? snap.step2.opportunities.length : firstUnscored);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id, router]);

  const current = opps?.[cursor];
  const total = opps?.length ?? 0;
  const completed = scores.length;
  const allDone = total > 0 && cursor >= total;

  const qualified = useMemo(() => scores.filter((s) => s.score >= 7).length, [scores]);

  function chooseScore(score: number) {
    setShowScoreDialog(score);
    setReasonText("");
  }

  async function submitScore() {
    if (!current || showScoreDialog == null) return;
    if (reasonText.trim().length < 2) return;
    const item: ScoreItem = { opp_idx: current.idx, score: showScoreDialog, reason: reasonText.trim() };
    setScores((prev) => {
      const next = prev.filter((p) => p.opp_idx !== current.idx);
      next.push(item);
      return next;
    });
    setShowScoreDialog(null);
    setReasonText("");
    setExpanded(false);
    // 提交到后端
    await fetch(`/api/runs/${params.id}/step3/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores: [item] }),
    });
    x.set(0);
    setCursor((c) => c + 1);
  }

  async function finalize() {
    if (qualified === 0) {
      alert("没有任何机会拿到 ≥7 分，无法进入 Step 4。建议回看几条搁置的再重打一次分。");
      return;
    }
    setAdvancing(true);
    const elapsedSec = Math.round((Date.now() - startTimeRef.current) / 1000);
    await fetch(`/api/runs/${params.id}/step3/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores: [], finalize: true }),
    });
    await fetch(`/api/runs/${params.id}/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step3_completion_rate: completed / total,
        step3_total_time_sec: elapsedSec,
      }),
    });
    router.push(`/run/${params.id}/step4`);
  }

  if (loading) {
    return (
      <main>
        <PageHeader step="Step 3 · 感性验证" title="逐条打分" />
        <ThinkingDots />
      </main>
    );
  }
  if (err) {
    return (
      <main className="p-5">
        <PageHeader step="Step 3" title="出了点问题" />
        <p className="text-danger-600">{err}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* 进度条 */}
      <div className="sticky top-0 z-30 bg-ink-50/85 backdrop-blur border-b border-ink-100">
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-ink-400 tracking-wider uppercase">Step 3 · 感性验证</div>
            <div className="text-xs text-ink-500">
              {Math.min(cursor + (allDone ? 0 : 1), total)}/{total} · 已亮 <b className="text-gold-600">{qualified}</b>
            </div>
          </div>
          <div className="h-1 bg-ink-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-ink-900"
              animate={{ width: `${(completed / total) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      </div>

      {/* 卡片区域 */}
      <div className="flex-1 px-5 pt-6 pb-40 relative">
        {!allDone && current && (
          <motion.div
            key={current.idx}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="relative"
          >
            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.5}
              style={{ x, rotate, opacity }}
              className="card-soft p-6"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] text-ink-400 tracking-widest uppercase">#{current.idx} · {current.category}</div>
                <div className="text-[11px] text-ink-300">滑动查看下一张</div>
              </div>

              <h2 className="serif text-2xl text-ink-900 leading-tight">{current.title}</h2>
              <p className="text-ink-600 mt-2 leading-relaxed text-[15px]">{current.oneLiner}</p>

              {/* 典型一天 - 展开/折叠 */}
              <div className="mt-5">
                <button
                  className="flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-800"
                  onClick={() => setExpanded((e) => !e)}
                >
                  {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {expanded ? "收起细节" : "展开 典型一天 / 工作内容 / 方法"}
                </button>
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 space-y-3 text-[14px] text-ink-700 leading-relaxed">
                        <DetailLine label="典型一天" text={current.dayInLife} />
                        <DetailLine label="工作内容" text={current.workContent} />
                        <DetailLine label="工作方法" text={current.workMethods} />
                        {current.evidence?.length > 0 && (
                          <div>
                            <div className="text-xs text-ink-400 mb-1">外部佐证</div>
                            <ul className="space-y-1">
                              {current.evidence.map((e, i) => (
                                <li key={i} className="text-xs text-ink-500">
                                  · {e.label}{e.url ? ` (${new URL(e.url).hostname})` : ""}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* 评分锚点 */}
            <div className="mt-7">
              <div className="text-center text-sm text-ink-600 mb-3">
                想到我自己每天过这种日子，我有多被点亮？
              </div>
              <div className="grid grid-cols-3 gap-2">
                {SCORE_ANCHORS.map((a) => (
                  <button
                    key={a.score}
                    onClick={() => chooseScore(a.score)}
                    className={cn(
                      "rounded-2xl py-3 px-2 border text-center transition-all active:scale-[0.97]",
                      "bg-white hover:bg-ink-50",
                      a.tone === "gold" && "border-gold-400 hover:border-gold-500",
                      a.tone === "neutral" && "border-ink-200",
                      a.tone === "red" && "border-danger-400/50"
                    )}
                  >
                    <div className={cn("text-2xl font-semibold serif", a.tone === "gold" && "text-gold-600", a.tone === "red" && "text-danger-500")}>
                      {a.score}
                    </div>
                    <div className="text-[12px] text-ink-700 mt-0.5">{a.label}</div>
                    <div className="text-[10px] text-ink-400 mt-0.5">{a.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {allDone && (
          <div className="mt-12 text-center">
            <div className="serif text-3xl text-ink-900 mb-3">30 张打完了</div>
            <p className="text-ink-600 mb-1">
              有 <b className="text-gold-600">{qualified}</b> 条进入了亮区（≥7 分）
            </p>
            <p className="text-ink-400 text-sm mb-7">下一步：用 PEST + 波特五力筛掉「想做但市场不够大」的</p>
            <ScoresOverview opps={opps ?? []} scores={scores} />
            <div className="mt-7">
              <Button size="lg" className="w-full" onClick={finalize} disabled={advancing}>
                {advancing ? "处理中…" : "进入 Step 4 · 市场验证"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 底部跳转条（已评分时显示） */}
      {!allDone && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto p-3 bg-ink-50/95 backdrop-blur border-t border-ink-100">
          <div className="flex items-center justify-between text-sm">
            <button
              className="text-ink-500 hover:text-ink-900 px-3 py-2"
              onClick={() => setCursor((c) => Math.max(0, c - 1))}
              disabled={cursor === 0}
            >
              上一张
            </button>
            <div className="text-xs text-ink-400">
              已评 <b className="text-ink-900">{completed}</b> / 共 {total}
            </div>
            <button
              className="text-ink-500 hover:text-ink-900 px-3 py-2"
              onClick={() => setCursor((c) => Math.min(total, c + 1))}
            >
              跳过
            </button>
          </div>
        </div>
      )}

      {/* 评分理由对话框 */}
      <AnimatePresence>
        {showScoreDialog !== null && current && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center"
            onClick={() => setShowScoreDialog(null)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              transition={{ type: "spring", damping: 25 }}
              className="w-full max-w-[480px] bg-white rounded-t-3xl sm:rounded-3xl p-6 mx-0 sm:mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs text-ink-400 mb-1">你给「{current.title}」打了</div>
                  <div className="serif text-3xl text-ink-900">
                    {showScoreDialog} 分
                    <span className="text-sm text-ink-500 ml-2">
                      · {SCORE_ANCHORS.find((a) => a.score === showScoreDialog)?.label}
                    </span>
                  </div>
                </div>
                <button className="p-2 text-ink-400 hover:text-ink-700" onClick={() => setShowScoreDialog(null)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <label className="text-sm text-ink-600 block mb-2">为什么这样打？一句话</label>
              <textarea
                rows={3}
                maxLength={140}
                autoFocus
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="例：跨时差跑代理太消耗，但我想做就想做"
                className="w-full px-4 py-3 rounded-xl bg-ink-50 border border-ink-200 text-ink-900 placeholder:text-ink-300 resize-none focus:outline-none focus:border-ink-700"
              />
              <div className="flex justify-between items-center mt-2 text-xs text-ink-400">
                <span>≥ 2 字，强制输入用于事后回看是否被一时情绪绑架</span>
                <span>{reasonText.length}/140</span>
              </div>
              <Button
                size="lg"
                className="w-full mt-5"
                disabled={reasonText.trim().length < 2}
                onClick={submitScore}
              >
                <Check className="w-4 h-4 mr-2" /> 提交并看下一条
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function DetailLine({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-xs text-ink-400 mb-1">{label}</div>
      <div>{text}</div>
    </div>
  );
}

function ScoresOverview({ opps, scores }: { opps: Step2Opportunity[]; scores: ScoreItem[] }) {
  const map = new Map(scores.map((s) => [s.opp_idx, s]));
  return (
    <div className="space-y-1.5 text-left">
      {opps.map((o) => {
        const s = map.get(o.idx);
        if (!s) return null;
        const pass = s.score >= 7;
        return (
          <div
            key={o.idx}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg",
              pass ? "bg-gold-400/10" : "bg-ink-100/60"
            )}
          >
            <div className={cn("w-9 text-center font-semibold serif", pass ? "text-gold-600" : "text-ink-400")}>
              {s.score}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn("text-sm truncate", pass ? "text-ink-900" : "text-ink-500")}>
                #{o.idx} {o.title}
              </div>
              <div className="text-xs text-ink-400 truncate">{s.reason}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

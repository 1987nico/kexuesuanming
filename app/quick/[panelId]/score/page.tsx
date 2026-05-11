"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThinkingDots } from "@/components/ui/Loading";
import { cn } from "@/lib/utils";
import type { QuickItem, QuickScore } from "@/lib/quickScore/types";

const LS_KEY = (panelId: string) => `kxsm_quick_respondent_${panelId}`;

const SCORE_ANCHORS: { score: number; label: string; sub: string; tone: "red" | "neutral" | "gold" }[] = [
  { score: 0, label: "抵触", sub: "不想做", tone: "red" },
  { score: 3, label: "没感觉", sub: "无所谓", tone: "red" },
  { score: 5, label: "不期待", sub: "不讨厌但不期待", tone: "neutral" },
  { score: 7, label: "想试试", sub: "被点亮", tone: "gold" },
  { score: 9, label: "来劲", sub: "一想起就有劲", tone: "gold" },
  { score: 10, label: "这就是我", sub: "完全契合", tone: "gold" },
];

interface LocalScore {
  opp_idx: number;
  score: number;
  reason?: string;
}

export default function QuickScorePage({ params }: { params: { panelId: string } }) {
  const router = useRouter();
  const [respondentId, setRespondentId] = useState<string | null>(null);
  const [respondentName, setRespondentName] = useState<string>("");
  const [items, setItems] = useState<QuickItem[] | null>(null);
  const [scores, setScores] = useState<LocalScore[]>([]);
  const [cursor, setCursor] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showScoreDialog, setShowScoreDialog] = useState<number | null>(null);
  const [reasonText, setReasonText] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // 从 localStorage 拿 respondent
        let cached: { id: string; name: string } | null = null;
        try {
          const raw = localStorage.getItem(LS_KEY(params.panelId));
          if (raw) cached = JSON.parse(raw);
        } catch {}
        if (!cached) {
          router.replace(`/quick/${params.panelId}`);
          return;
        }
        setRespondentId(cached.id);
        setRespondentName(cached.name);

        const res = await fetch(
          `/api/quick/panels/${params.panelId}?respondent_id=${cached.id}`
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `加载失败 (${res.status})`);
        }
        const data = await res.json();
        if (!data.respondent) {
          // 后端不认这个 respondent（可能 memory store 重启），清掉
          localStorage.removeItem(LS_KEY(params.panelId));
          router.replace(`/quick/${params.panelId}`);
          return;
        }
        setItems(data.panel.items as QuickItem[]);
        const existing = (data.scores as QuickScore[]).map<LocalScore>((s) => ({
          opp_idx: s.opp_idx,
          score: s.score,
          reason: s.reason ?? undefined,
        }));
        setScores(existing);
        // 跳到第一个未评分的
        const firstUnscored = (data.panel.items as QuickItem[]).findIndex(
          (it) => !existing.find((s) => s.opp_idx === it.idx)
        );
        setCursor(firstUnscored === -1 ? data.panel.items.length : firstUnscored);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.panelId, router]);

  const total = items?.length ?? 0;
  const current = items?.[cursor];
  const allDone = total > 0 && cursor >= total;
  const completed = scores.length;
  const qualified = useMemo(() => scores.filter((s) => s.score >= 7).length, [scores]);

  function chooseScore(score: number) {
    setShowScoreDialog(score);
    const existing = scores.find((s) => s.opp_idx === current?.idx);
    setReasonText(existing?.reason ?? "");
  }

  async function submitScore() {
    if (!current || showScoreDialog == null || !respondentId) return;
    const score = showScoreDialog;
    const reason = reasonText.trim() || undefined;
    const item: LocalScore = { opp_idx: current.idx, score, reason };

    setScores((prev) => {
      const next = prev.filter((p) => p.opp_idx !== current.idx);
      next.push(item);
      return next;
    });
    setShowScoreDialog(null);
    setReasonText("");
    setExpanded(false);

    try {
      await fetch(`/api/quick/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respondentId,
          oppIdx: current.idx,
          score,
          reason: reason ?? null,
        }),
      });
    } catch (e) {
      // 失败时不阻塞，但提示一下
      console.warn("save score failed", e);
    }

    setCursor((c) => c + 1);
  }

  function goToResult() {
    router.push(`/quick/${params.panelId}/result`);
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <ThinkingDots />
      </main>
    );
  }
  if (err) {
    return (
      <main className="p-7">
        <h1 className="serif text-2xl text-ink-900 mb-3">出了点问题</h1>
        <p className="text-danger-600 text-sm">{err}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* 进度条 */}
      <div className="sticky top-0 z-30 bg-ink-50/85 backdrop-blur border-b border-ink-100">
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-ink-400 tracking-wider uppercase">
              {respondentName} · {Math.min(cursor + (allDone ? 0 : 1), total)}/{total}
            </div>
            <div className="text-xs text-ink-500">
              已亮 <b className="text-gold-600">{qualified}</b>
            </div>
          </div>
          <div className="h-1 bg-ink-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-ink-900"
              animate={{ width: `${(completed / Math.max(total, 1)) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      </div>

      {/* 卡片区域 */}
      <div className="flex-1 px-5 pt-6 pb-32">
        {!allDone && current && (
          <motion.div
            key={current.idx}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="card-soft p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] text-ink-400 tracking-widest uppercase">
                  #{current.idx} · {current.category}
                </div>
              </div>

              <h2 className="serif text-2xl text-ink-900 leading-tight">
                {current.title}
              </h2>
              <p className="text-ink-600 mt-2 leading-relaxed text-[15px]">
                {current.oneLiner}
              </p>

              <div className="mt-5">
                <button
                  className="flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-800"
                  onClick={() => setExpanded((e) => !e)}
                >
                  {expanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  {expanded ? "收起细节" : "展开 典型一天 / 工作内容 / 方法 / 外部佐证"}
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
                                <li key={i} className="text-xs text-ink-500 leading-relaxed">
                                  · {e.label}
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
            </div>

            {/* 评分锚点 */}
            <div className="mt-7">
              <div className="text-center text-sm text-ink-600 mb-3">
                想到我自己每天过这种日子，我有多被点亮？
              </div>
              <div className="grid grid-cols-3 gap-2">
                {SCORE_ANCHORS.map((a) => {
                  const existing = scores.find((s) => s.opp_idx === current.idx);
                  const isCurrent = existing?.score === a.score;
                  return (
                    <button
                      key={a.score}
                      onClick={() => chooseScore(a.score)}
                      className={cn(
                        "rounded-2xl py-3 px-2 border text-center transition-all active:scale-[0.97] bg-white hover:bg-ink-50",
                        a.tone === "gold" && "border-gold-400 hover:border-gold-500",
                        a.tone === "neutral" && "border-ink-200",
                        a.tone === "red" && "border-danger-400/50",
                        isCurrent && "ring-2 ring-ink-900"
                      )}
                    >
                      <div
                        className={cn(
                          "text-2xl font-semibold serif",
                          a.tone === "gold" && "text-gold-600",
                          a.tone === "red" && "text-danger-500"
                        )}
                      >
                        {a.score}
                      </div>
                      <div className="text-[12px] text-ink-700 mt-0.5">{a.label}</div>
                      <div className="text-[10px] text-ink-400 mt-0.5">{a.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {allDone && (
          <div className="mt-12 text-center">
            <div className="serif text-3xl text-ink-900 mb-3">
              {total} 张打完了
            </div>
            <p className="text-ink-600 mb-1">
              有 <b className="text-gold-600">{qualified}</b> 条进入了亮区（≥7 分）
            </p>
            <p className="text-ink-400 text-sm mb-7">
              点下面看你自己完整的清单
            </p>
            <Button size="lg" className="w-full" onClick={goToResult}>
              查看我的结果
            </Button>
          </div>
        )}
      </div>

      {/* 底部跳转条 */}
      {!allDone && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto p-3 bg-ink-50/95 backdrop-blur border-t border-ink-100">
          <div className="flex items-center justify-between text-sm">
            <button
              className="text-ink-500 hover:text-ink-900 px-3 py-2 disabled:text-ink-300"
              onClick={() => setCursor((c) => Math.max(0, c - 1))}
              disabled={cursor === 0}
            >
              上一张
            </button>
            <button
              className="text-ink-500 hover:text-ink-900 px-3 py-2 text-xs"
              onClick={goToResult}
            >
              先看进度
            </button>
            <button
              className="text-ink-500 hover:text-ink-900 px-3 py-2"
              onClick={() => setCursor((c) => Math.min(total, c + 1))}
            >
              跳过
            </button>
          </div>
        </div>
      )}

      {/* 评分对话框 */}
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
                  <div className="text-xs text-ink-400 mb-1">
                    你给「{current.title}」打了
                  </div>
                  <div className="serif text-3xl text-ink-900">
                    {showScoreDialog} 分
                    <span className="text-sm text-ink-500 ml-2">
                      · {SCORE_ANCHORS.find((a) => a.score === showScoreDialog)?.label}
                    </span>
                  </div>
                </div>
                <button
                  className="p-2 text-ink-400 hover:text-ink-700"
                  onClick={() => setShowScoreDialog(null)}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <label className="text-sm text-ink-600 block mb-2">
                想加一句直觉理由吗？<span className="text-ink-400">（可选）</span>
              </label>
              <textarea
                rows={3}
                maxLength={140}
                autoFocus
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder={
                  showScoreDialog >= 7
                    ? "例：跨时差跑代理太消耗，但我想做就想做"
                    : "例：没兴趣 / 我做不来这种"
                }
                className="w-full px-4 py-3 rounded-xl bg-ink-50 border border-ink-200 text-ink-900 placeholder:text-ink-300 resize-none focus:outline-none focus:border-ink-700"
              />
              <div className="flex justify-between items-center mt-2 text-xs text-ink-400">
                <span>不写也能提交</span>
                <span>{reasonText.length}/140</span>
              </div>
              <Button size="lg" className="w-full mt-5" onClick={submitScore}>
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

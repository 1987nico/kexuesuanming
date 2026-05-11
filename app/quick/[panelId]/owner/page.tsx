"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ThinkingDots } from "@/components/ui/Loading";
import { cn } from "@/lib/utils";
import type { QuickItem, QuickRespondent, QuickScore } from "@/lib/quickScore/types";

interface AggregateData {
  panel: { id: string; title: string; items: QuickItem[] };
  respondents: QuickRespondent[];
  scores: QuickScore[];
}

export default function QuickOwnerPage({ params }: { params: { panelId: string } }) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <ThinkingDots />
        </main>
      }
    >
      <OwnerView panelId={params.panelId} />
    </Suspense>
  );
}

function OwnerView({ panelId }: { panelId: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [data, setData] = useState<AggregateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setErr("missing_token");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/quick/panels/${panelId}/aggregate?token=${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );
        if (res.status === 401) {
          setErr("unauthorized");
          return;
        }
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `加载失败 (${res.status})`);
        }
        setData((await res.json()) as AggregateData);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [panelId, token]);

  // 每条机会被多少人打 ≥7
  const ranking = useMemo(() => {
    if (!data) return [];
    const byOpp = new Map<number, { score: number; respondentId: string }[]>();
    for (const s of data.scores) {
      if (!byOpp.has(s.opp_idx)) byOpp.set(s.opp_idx, []);
      byOpp.get(s.opp_idx)!.push({ score: s.score, respondentId: s.respondent_id });
    }
    return data.panel.items
      .map((it) => {
        const arr = byOpp.get(it.idx) ?? [];
        const high = arr.filter((x) => x.score >= 7).length;
        const avg = arr.length ? arr.reduce((a, b) => a + b.score, 0) / arr.length : null;
        return { item: it, high, avg, total: arr.length };
      })
      .sort((a, b) => {
        if (b.high !== a.high) return b.high - a.high;
        return (b.avg ?? -1) - (a.avg ?? -1);
      });
  }, [data]);

  // 矩阵：行 = 30 项，列 = 受访者
  const matrix = useMemo(() => {
    if (!data) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const s of data.scores) {
      m.set(`${s.opp_idx}:${s.respondent_id}`, s.score);
    }
    return m;
  }, [data]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <ThinkingDots />
      </main>
    );
  }
  if (err === "missing_token" || err === "unauthorized") {
    return (
      <main className="p-7">
        <h1 className="serif text-2xl text-ink-900 mb-3">需要 owner token</h1>
        <p className="text-ink-600 text-sm">
          这个页面只给面板所有者。请在 URL 后加 <code className="bg-ink-100 px-1 rounded">?token=你设的密钥</code>。
        </p>
      </main>
    );
  }
  if (err) {
    return (
      <main className="p-7">
        <p className="text-danger-600 text-sm">{err}</p>
      </main>
    );
  }
  if (!data) return null;

  const respondents = data.respondents;
  const items = data.panel.items;

  return (
    <main className="min-h-screen">
      <div className="px-5 pt-10 pb-4">
        <div className="text-xs text-ink-400 tracking-[0.3em] uppercase mb-3">Owner View</div>
        <h1 className="serif text-2xl text-ink-900 leading-tight">{data.panel.title}</h1>
        <p className="text-ink-600 text-sm mt-2">
          {respondents.length} 位受访者 · 共 {data.scores.length} 条打分
        </p>
      </div>

      <div className="divider-ink mx-5" />

      {/* 排行榜 */}
      <section className="px-5 pt-6 pb-2">
        <div className="text-sm font-semibold text-ink-900 mb-1">被点亮排行（≥7 分人数降序）</div>
        <div className="text-xs text-ink-400 mb-4">看哪些机会在你身边的人眼里最被认可</div>
        <div className="space-y-2">
          {ranking.map((r, i) => (
            <div
              key={r.item.idx}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl",
                r.high > 0 ? "bg-gold-400/10" : "bg-ink-100/40"
              )}
            >
              <div className="w-6 text-center text-xs text-ink-400 serif shrink-0">
                {i + 1}
              </div>
              <div
                className={cn(
                  "shrink-0 w-9 text-center text-lg font-semibold serif",
                  r.high > 0 ? "text-gold-600" : "text-ink-300"
                )}
              >
                {r.high}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-900 truncate">
                  #{r.item.idx} {r.item.title}
                </div>
                <div className="text-[11px] text-ink-400 mt-0.5">
                  {r.total} 人打分 · 均分 {r.avg !== null ? r.avg.toFixed(1) : "—"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="divider-ink mx-5 my-8" />

      {/* 矩阵 */}
      <section className="pb-12">
        <div className="px-5 mb-3">
          <div className="text-sm font-semibold text-ink-900">全员 × 30 项 矩阵</div>
          <div className="text-xs text-ink-400 mt-1">
            横向滑动查看每位受访者的逐项打分；金色=≥7、灰=5–6、淡红=&lt;5
          </div>
        </div>
        <div className="overflow-x-auto px-2">
          <table className="border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-ink-50 px-3 py-2 text-left text-ink-500 font-medium border-b border-ink-200 min-w-[200px]">
                  机会
                </th>
                {respondents.map((r) => (
                  <th
                    key={r.id}
                    className="px-2 py-2 text-center text-ink-500 font-medium border-b border-ink-200"
                  >
                    <div className="w-12 truncate" title={r.name}>
                      {r.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.idx}>
                  <td className="sticky left-0 z-10 bg-ink-50 px-3 py-1.5 text-ink-700 border-b border-ink-100">
                    <div className="truncate max-w-[200px]" title={it.title}>
                      <span className="text-ink-400 mr-1">#{it.idx}</span>
                      {it.title}
                    </div>
                  </td>
                  {respondents.map((r) => {
                    const s = matrix.get(`${it.idx}:${r.id}`);
                    let bg = "bg-white";
                    let textCls = "text-ink-300";
                    if (s !== undefined) {
                      if (s >= 7) {
                        bg = "bg-gold-400/25";
                        textCls = "text-gold-700 font-semibold";
                      } else if (s >= 5) {
                        bg = "bg-ink-100";
                        textCls = "text-ink-700";
                      } else {
                        bg = "bg-danger-500/10";
                        textCls = "text-danger-500";
                      }
                    }
                    return (
                      <td
                        key={r.id}
                        className={cn("text-center border-b border-ink-100", bg)}
                      >
                        <div className={cn("w-12 h-9 flex items-center justify-center", textCls)}>
                          {s ?? "—"}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 各人原话（≥7 的理由集锦） */}
      <section className="px-5 pb-20">
        <div className="text-sm font-semibold text-ink-900 mb-1">
          ≥7 分原话（朋友 / 家人写的直觉理由）
        </div>
        <div className="text-xs text-ink-400 mb-4">最有信息量的部分，注意捕捉重复出现的关键词</div>
        <div className="space-y-3">
          {data.scores
            .filter((s) => s.score >= 7 && s.reason)
            .sort((a, b) => b.score - a.score)
            .map((s, i) => {
              const item = items.find((it) => it.idx === s.opp_idx);
              const respondent = respondents.find((r) => r.id === s.respondent_id);
              return (
                <div key={i} className="card-soft px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs text-ink-500">
                      <b className="text-ink-900">{respondent?.name ?? "?"}</b> ·{" "}
                      <span className="text-gold-600 font-semibold serif">{s.score} 分</span>
                    </div>
                    <div className="text-[11px] text-ink-400">
                      #{s.opp_idx} {item?.title.slice(0, 14)}
                      {item && item.title.length > 14 ? "…" : ""}
                    </div>
                  </div>
                  <div className="text-sm text-ink-800 leading-relaxed">「{s.reason}」</div>
                </div>
              );
            })}
          {data.scores.filter((s) => s.score >= 7 && s.reason).length === 0 && (
            <div className="text-sm text-ink-400">还没有 ≥7 分的原话，等大家继续打分。</div>
          )}
        </div>
      </section>
    </main>
  );
}

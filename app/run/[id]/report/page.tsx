"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ThinkingDots } from "@/components/ui/Loading";
import type { RunSnapshot } from "@/lib/db/store";
import { cn } from "@/lib/utils";

export default function ReportPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [snap, setSnap] = useState<RunSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/runs/${params.id}`);
      const json = await r.json();
      setSnap(json);
      setLoading(false);
    })();
  }, [params.id]);

  if (loading || !snap) {
    return (
      <main>
        <PageHeader title="加载报告" />
        <ThinkingDots />
      </main>
    );
  }

  function printPdf() {
    window.print();
  }

  return (
    <main>
      <PageHeader step="完整报告" title="科学算命 · 个人版" subtitle={snap.survey?.name ? `${snap.survey.name} · ${new Date(snap.run.created_at).toLocaleDateString("zh-CN")}` : undefined} />

      <div className="px-5 pt-6 pb-32 space-y-8 print:space-y-6">
        {/* 摘要 */}
        <SummaryBlock snap={snap} />

        {/* Step 1 */}
        {snap.step1 && (
          <ReportSection title="Step 1 · 圈定边界">
            <div className="space-y-3">
              <KV k="喜欢区" v={snap.step1.likeProfile} />
              <KV k="排除带" v={snap.step1.dislikeProfile} />
              <div>
                <div className="text-xs text-ink-400 mb-1.5 tracking-wider uppercase">主题</div>
                <ul className="space-y-2">
                  {snap.step1.themes.map((t, i) => (
                    <li key={i} className="text-sm">
                      <b>{t.title}</b>
                      <span className="text-ink-500"> — {t.rationale}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </ReportSection>
        )}

        {/* Step 3 评分（亮区） */}
        {snap.step3Scores && snap.step2 && (
          <ReportSection title="Step 3 · 感性验证 亮区">
            <p className="text-xs text-ink-400 mb-3">
              共评 {snap.step3Scores.length} 项，
              亮区 ≥7 分 {snap.step3Scores.filter((s) => s.score >= 7).length} 项
            </p>
            <div className="space-y-2">
              {snap.step3Scores
                .filter((s) => s.score >= 7)
                .sort((a, b) => b.score - a.score)
                .map((s) => {
                  const opp = snap.step2!.opportunities.find((o) => o.idx === s.opp_idx);
                  return (
                    <div key={s.opp_idx} className="flex gap-3 text-sm py-1">
                      <div className="w-10 text-center serif text-gold-600 font-medium shrink-0">{s.score}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-ink-900">#{s.opp_idx} {opp?.title}</div>
                        <div className="text-ink-500 text-xs italic">「{s.reason}」</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </ReportSection>
        )}

        {/* Top 3 */}
        {snap.step5 && (
          <ReportSection title="最终 Top 3">
            <div className="space-y-4">
              {snap.step5.decisionMatrix
                .filter((d) => snap.step5!.top3.includes(d.idx))
                .sort((a, b) => a.rank - b.rank)
                .map((d) => {
                  const opp = snap.step2?.opportunities.find((o) => o.idx === d.idx);
                  const vrin = snap.step5!.vrins.find((v) => v.idx === d.idx);
                  return (
                    <div key={d.idx} className="border-l-2 border-gold-500 pl-4">
                      <div className="text-gold-600 serif text-lg">No.{d.rank}</div>
                      <div className="font-medium text-ink-900">#{d.idx} {opp?.title}</div>
                      <div className="text-xs text-ink-500 mt-1">{opp?.oneLiner}</div>
                      <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                        <div><span className="text-ink-400">机会:</span> {d.opportunitySize}/20</div>
                        <div><span className="text-ink-400">胜算:</span> {d.personalEdge}/20</div>
                        <div><span className="text-ink-400">综合:</span> {Math.round(d.composite * 10) / 10}</div>
                      </div>
                      {vrin?.ninetyDayActions && (
                        <div className="mt-3">
                          <div className="text-xs text-ink-400 mb-1">90 天动作</div>
                          <ul className="space-y-1 text-xs text-ink-700">
                            {vrin.ninetyDayActions.map((a, i) => (
                              <li key={i}>
                                <b className="text-gold-600">{a.day}</b> {a.action}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </ReportSection>
        )}

        {/* Step 6 失败验尸摘要 */}
        {snap.step6 && (
          <ReportSection title="Step 6 · 失败验尸（摘要）">
            <div className="space-y-5">
              {snap.step6.premortems.map((pm) => {
                const opp = snap.step2?.opportunities.find((o) => o.idx === pm.idx);
                return (
                  <div key={pm.idx}>
                    <div className="font-medium text-ink-900 mb-1.5">#{pm.idx} {opp?.title}</div>
                    <div className="p-3 rounded-lg bg-danger-400/5 border border-danger-400/30 mb-2.5">
                      <div className="text-xs text-danger-500 mb-1 tracking-wider uppercase">输的剧本</div>
                      <p className="text-[13px] text-ink-700 leading-relaxed whitespace-pre-line">{pm.narrative}</p>
                    </div>
                    <div className="text-xs text-ink-400 mb-1">最致命的 3 条失败原因</div>
                    <ul className="space-y-1 text-[13px] text-ink-700">
                      {pm.findings.slice(0, 3).map((f, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-danger-500 shrink-0">·</span>
                          <span><b className="text-ink-900">[{f.layer}]</b> {f.failureReason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </ReportSection>
        )}

        {/* 完成 / 反馈 */}
        <div className="card-soft p-5 print:hidden">
          <h3 className="serif text-lg text-ink-900 mb-2">最后一步</h3>
          <p className="text-sm text-ink-600 mb-4">
            这份报告有没有帮你看到你没看到的东西？花 1 分钟告诉我们，我们用这个数据迭代。
          </p>
          <div className="flex gap-3">
            <Button className="flex-1" variant="outline" onClick={printPdf}>导出 PDF</Button>
            <Link href={`/run/${params.id}/feedback`} className="flex-1">
              <Button className="w-full">填反馈</Button>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function SummaryBlock({ snap }: { snap: RunSnapshot }) {
  const top3Count = snap.step5?.top3.length ?? 0;
  const qualified = snap.step3Scores?.filter((s) => s.score >= 7).length ?? 0;
  return (
    <div className="card-soft p-5 bg-ink-900 text-ink-50">
      <div className="text-xs text-ink-400 mb-2 tracking-wider uppercase">本次诊断</div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Big label="发散" value={snap.step2?.opportunities.length ?? 0} unit="条" />
        <Big label="亮区 (≥7)" value={qualified} unit="条" />
        <Big label="最终 Top" value={top3Count} unit="条" />
      </div>
    </div>
  );
}

function Big({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div>
      <div className="text-[10px] text-ink-400 tracking-wider uppercase">{label}</div>
      <div className="serif text-3xl mt-1">
        {value}
        <span className="text-xs text-ink-400 ml-1">{unit}</span>
      </div>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-soft p-5">
      <h3 className="serif text-lg text-ink-900 mb-4 pb-2 border-b border-ink-100">{title}</h3>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-ink-400 mb-1 tracking-wider uppercase">{k}</div>
      <div className="text-sm text-ink-700 leading-relaxed">{v}</div>
    </div>
  );
}

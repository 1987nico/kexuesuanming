"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ThinkingDots } from "@/components/ui/Loading";
import { cn } from "@/lib/utils";
import type { Step4Output } from "@/lib/llm/prompts/step4";
import type { Step2Opportunity } from "@/lib/llm/prompts/step2";

export default function Step4Page({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<Step4Output | null>(null);
  const [opps, setOpps] = useState<Step2Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await (await fetch(`/api/runs/${params.id}`)).json();
        setOpps(snap?.step2?.opportunities ?? []);
        if (snap?.step4) {
          setData(snap.step4);
          setLoading(false);
          return;
        }
        const r = await fetch(`/api/runs/${params.id}/step4/generate`, { method: "POST" });
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
      <PageHeader step="Step 4 · 市场验证" title="PEST + 波特五力" subtitle="筛掉「想做但市场不够大」的" />
      <div className="px-5 pt-6 pb-32">
        {loading && <ThinkingDots label="抓取行业数据 · 跑 PEST + 五力双评分…" />}
        {err && <p className="text-danger-600 text-sm">{err}</p>}
        {data && (
          <div className="space-y-3">
            <p className="text-sm text-ink-500 mb-3">
              对 ≥7 分机会跑 PEST + 五力，综合分 ≥13 进入 shortlist。
              共 <b className="text-ink-900">{data.shortlist.length}</b> 条进入 Step 5。
            </p>
            {data.analyses.map((a) => {
              const opp = oppMap.get(a.idx);
              const inList = data.shortlist.includes(a.idx);
              const open = openIdx === a.idx;
              return (
                <div
                  key={a.idx}
                  className={cn(
                    "card-soft overflow-hidden",
                    inList ? "ring-1 ring-gold-400" : "opacity-80"
                  )}
                >
                  <button
                    className="w-full p-4 text-left flex items-center gap-3"
                    onClick={() => setOpenIdx(open ? null : a.idx)}
                  >
                    <div className="flex flex-col items-center w-14 shrink-0">
                      <div className="text-[10px] text-ink-400 uppercase tracking-wider">现状</div>
                      <div className={cn("serif text-2xl", inList ? "text-gold-600" : "text-ink-400")}>
                        {a.scoreNow}
                      </div>
                      <div className="text-[10px] text-ink-400 mt-1">演化</div>
                      <div className={cn("text-sm", inList ? "text-gold-600" : "text-ink-400")}>{a.scoreFuture}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-ink-400 mb-0.5">#{a.idx}</div>
                      <div className="text-ink-900 font-medium truncate">{opp?.title ?? a.title}</div>
                      <div className="text-xs text-ink-500 mt-1 line-clamp-2">{a.conclusion}</div>
                    </div>
                    {inList && (
                      <div className="text-xs px-2 py-1 rounded-full bg-gold-400/15 text-gold-600 shrink-0">入围</div>
                    )}
                  </button>
                  {open && (
                    <div className="px-4 pb-4 pt-1 border-t border-ink-100 space-y-3 text-sm">
                      <PEST pest={a.pest} />
                      <FiveForces now={a.fiveForcesNow} future={a.fiveForcesFuture} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {data && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto p-5 bg-gradient-to-t from-ink-50 via-ink-50/95 to-transparent">
          <Button size="lg" className="w-full" onClick={() => router.push(`/run/${params.id}/step5`)}>
            Step 5 · 资源验证 VRIN
          </Button>
        </div>
      )}
    </main>
  );
}

function PEST({ pest }: { pest: { P: string; E: string; S: string; T: string } }) {
  const items = [
    { k: "P · Political", v: pest.P },
    { k: "E · Economic", v: pest.E },
    { k: "S · Social", v: pest.S },
    { k: "T · Technological", v: pest.T },
  ];
  return (
    <div className="space-y-2">
      <div className="text-xs text-ink-400 tracking-wider uppercase">PEST 扫描</div>
      {items.map((i) => (
        <div key={i.k}>
          <div className="text-xs text-ink-500 font-medium">{i.k}</div>
          <div className="text-ink-700 text-[13px] mt-0.5 leading-relaxed">{i.v}</div>
        </div>
      ))}
    </div>
  );
}

function FiveForces({
  now,
  future,
}: {
  now: any;
  future: any;
}) {
  const rows = [
    { k: "现有竞争者", n: now.competitorIntensity, f: future.competitorIntensity },
    { k: "潜在进入者", n: now.newEntrantThreat, f: future.newEntrantThreat },
    { k: "替代品", n: now.substituteThreat, f: future.substituteThreat },
    { k: "供应商议价", n: now.supplierPower, f: future.supplierPower },
    { k: "买方议价", n: now.buyerPower, f: future.buyerPower },
  ];
  return (
    <div>
      <div className="text-xs text-ink-400 tracking-wider uppercase mb-2">波特五力 现状 / 演化（1=弱 5=强）</div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center gap-2 text-[13px]">
            <div className="w-24 text-ink-700">{r.k}</div>
            <Bar val={r.n} />
            <div className="w-7 text-right text-ink-500">{r.n}</div>
            <div className="text-ink-300">→</div>
            <Bar val={r.f} />
            <div className="w-7 text-right text-ink-700 font-medium">{r.f}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ val }: { val: number }) {
  return (
    <div className="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
      <div
        className={cn("h-full", val >= 4 ? "bg-danger-500" : val >= 3 ? "bg-gold-500" : "bg-ink-400")}
        style={{ width: `${(val / 5) * 100}%` }}
      />
    </div>
  );
}

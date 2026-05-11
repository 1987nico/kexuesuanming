"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ThinkingDots } from "@/components/ui/Loading";
import type { Step1Output } from "@/lib/llm/prompts/step1";

export default function Step1Page({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<Step1Output | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // 先看缓存
        const snap = await (await fetch(`/api/runs/${params.id}`)).json();
        if (snap?.step1) {
          setData(snap.step1);
          setLoading(false);
          return;
        }
        const r = await fetch(`/api/runs/${params.id}/step1/generate`, { method: "POST" });
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

  async function nextStep() {
    setAdvancing(true);
    router.push(`/run/${params.id}/step2`);
  }

  return (
    <main>
      <PageHeader step="Step 1 · 圈定边界" title="价值观双三圈" subtitle="把你的喜欢区与排除带画清楚" />
      <div className="px-5 pt-6 pb-32">
        {loading && <ThinkingDots label="AI 正在用你的价值观 + PrinciplesYou 推理…" />}
        {err && <ErrorBlock msg={err} />}
        {data && (
          <div className="space-y-7">
            <Card title="喜欢区（Top 3 三圈交集）" tone="like">
              <p className="text-ink-700 leading-relaxed text-[15px]">{data.likeProfile}</p>
            </Card>
            <Card title="排除带（Bottom 3 三圈交集）" tone="dislike">
              <p className="text-ink-700 leading-relaxed text-[15px]">{data.dislikeProfile}</p>
            </Card>
            <div>
              <h3 className="serif text-lg text-ink-900 mb-3">具体形态主题（Step 2 发散的种子）</h3>
              <div className="space-y-3">
                {data.themes.map((t, i) => (
                  <div key={i} className="card-soft p-4">
                    <div className="text-ink-900 font-medium">{t.title}</div>
                    <div className="text-ink-500 text-sm mt-1.5 leading-relaxed">{t.rationale}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="serif text-lg text-ink-900 mb-3">PrinciplesYou 反向校验</h3>
              <ul className="space-y-2">
                {data.principlesCrossCheck.map((c, i) => (
                  <li key={i} className="text-ink-700 text-[14px] leading-relaxed pl-4 relative before:content-['·'] before:absolute before:left-0 before:text-ink-400">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card-soft p-4 bg-ink-100/40">
              <div className="text-xs text-ink-400 mb-1.5 tracking-wider uppercase">冲突优先序</div>
              <p className="text-ink-700 text-[14px]">{data.conflictNote}</p>
            </div>
          </div>
        )}
      </div>
      {data && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto p-5 bg-gradient-to-t from-ink-50 via-ink-50/95 to-transparent">
          <Button size="lg" className="w-full" onClick={nextStep} disabled={advancing}>
            {advancing ? "前往…" : "Step 2 · 发散 30 个机会"}
          </Button>
        </div>
      )}
    </main>
  );
}

function Card({ title, tone, children }: { title: string; tone: "like" | "dislike"; children: React.ReactNode }) {
  return (
    <div className="card-soft p-5">
      <div className={"text-xs tracking-wider uppercase mb-2 " + (tone === "like" ? "text-gold-600" : "text-danger-500")}>
        {title}
      </div>
      {children}
    </div>
  );
}

function ErrorBlock({ msg }: { msg: string }) {
  return (
    <div className="p-4 rounded-xl border border-danger-400/50 bg-danger-400/5 text-danger-600 text-sm">
      生成失败：{msg}
      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          重试
        </Button>
      </div>
    </div>
  );
}

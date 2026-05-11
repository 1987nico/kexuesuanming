"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThinkingDots } from "@/components/ui/Loading";
import { cn } from "@/lib/utils";
import type { QuickItem, QuickScore } from "@/lib/quickScore/types";

const LS_KEY = (panelId: string) => `kxsm_quick_respondent_${panelId}`;

export default function QuickResultPage({ params }: { params: { panelId: string } }) {
  const router = useRouter();
  const [items, setItems] = useState<QuickItem[]>([]);
  const [scores, setScores] = useState<QuickScore[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLow, setShowLow] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        let cached: { id: string; name: string } | null = null;
        try {
          const raw = localStorage.getItem(LS_KEY(params.panelId));
          if (raw) cached = JSON.parse(raw);
        } catch {}
        if (!cached) {
          router.replace(`/quick/${params.panelId}`);
          return;
        }
        setName(cached.name);
        const res = await fetch(
          `/api/quick/panels/${params.panelId}?respondent_id=${cached.id}`
        );
        if (!res.ok) {
          throw new Error(`加载失败 (${res.status})`);
        }
        const data = await res.json();
        if (!data.respondent) {
          localStorage.removeItem(LS_KEY(params.panelId));
          router.replace(`/quick/${params.panelId}`);
          return;
        }
        setItems(data.panel.items as QuickItem[]);
        setScores(data.scores as QuickScore[]);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.panelId, router]);

  const scoreMap = useMemo(() => new Map(scores.map((s) => [s.opp_idx, s])), [scores]);

  const sorted = useMemo(() => {
    return [...items]
      .map((it) => ({ item: it, score: scoreMap.get(it.idx) }))
      .sort((a, b) => {
        const av = a.score?.score ?? -1;
        const bv = b.score?.score ?? -1;
        if (bv !== av) return bv - av;
        return a.item.idx - b.item.idx;
      });
  }, [items, scoreMap]);

  const total = items.length;
  const completed = scores.length;
  const high = sorted.filter((r) => (r.score?.score ?? -1) >= 7);
  const mid = sorted.filter((r) => {
    const s = r.score?.score;
    return s !== undefined && s >= 5 && s < 7;
  });
  const low = sorted.filter((r) => {
    const s = r.score?.score;
    return s !== undefined && s < 5;
  });
  const unrated = sorted.filter((r) => r.score === undefined);

  async function copyInviteLink() {
    const url = `${window.location.origin}/quick/${params.panelId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("复制这个链接发给朋友：", url);
    }
  }

  function continueScoring() {
    router.push(`/quick/${params.panelId}/score`);
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
        <p className="text-danger-600 text-sm">{err}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      <div className="px-7 pt-12 pb-6">
        <div className="text-xs text-ink-400 tracking-[0.3em] uppercase mb-4">
          {name} · 你的打分结果
        </div>
        <div className="serif text-3xl text-ink-900 leading-tight mb-3">
          {completed === total ? (
            <>30 项全部打完</>
          ) : (
            <>
              已完成 {completed} / {total}
            </>
          )}
        </div>
        <div className="flex gap-3 text-sm text-ink-600">
          <Badge tone="gold" count={high.length} label="≥7 亮区" />
          <Badge tone="neutral" count={mid.length} label="5–6 中区" />
          <Badge tone="red" count={low.length} label="<5 灰区" />
        </div>
        {completed < total && (
          <div className="mt-5">
            <Button variant="outline" size="md" onClick={continueScoring}>
              继续打剩下 {total - completed} 张
            </Button>
          </div>
        )}
      </div>

      <div className="divider-ink mx-7" />

      <div className="flex-1 px-5 pt-5 pb-32">
        {high.length > 0 && (
          <Section title="≥7 亮区" subtitle="你直觉里被点亮的">
            {high.map((r) => (
              <ResultRow key={r.item.idx} item={r.item} score={r.score!} tone="gold" />
            ))}
          </Section>
        )}

        {mid.length > 0 && (
          <Section title="5–6 中区" subtitle="不讨厌、不期待">
            {mid.map((r) => (
              <ResultRow key={r.item.idx} item={r.item} score={r.score!} tone="neutral" />
            ))}
          </Section>
        )}

        {unrated.length > 0 && (
          <Section title={`还没打分（${unrated.length}）`} subtitle="打完会自动归档">
            {unrated.map((r) => (
              <ResultRow key={r.item.idx} item={r.item} score={undefined} tone="muted" />
            ))}
          </Section>
        )}

        {low.length > 0 && (
          <div className="mt-6">
            <button
              className="text-xs text-ink-500 hover:text-ink-900 underline-offset-4 hover:underline"
              onClick={() => setShowLow((v) => !v)}
            >
              {showLow ? "收起" : `展开`} &lt;5 灰区（{low.length} 项）
            </button>
            {showLow && (
              <div className="mt-3">
                {low.map((r) => (
                  <ResultRow key={r.item.idx} item={r.item} score={r.score!} tone="red" />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto p-4 bg-ink-50/95 backdrop-blur border-t border-ink-100">
        <Button size="lg" className="w-full" variant="outline" onClick={copyInviteLink}>
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-2" /> 已复制邀请链接
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" /> 复制链接邀请下一位
            </>
          )}
        </Button>
      </div>
    </main>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <div className="flex items-baseline justify-between px-2 mb-3">
        <div className="text-sm font-semibold text-ink-900">{title}</div>
        <div className="text-xs text-ink-400">{subtitle}</div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Badge({
  tone,
  count,
  label,
}: {
  tone: "gold" | "neutral" | "red";
  count: number;
  label: string;
}) {
  return (
    <div
      className={cn(
        "px-3 py-1.5 rounded-full text-xs",
        tone === "gold" && "bg-gold-400/15 text-gold-600",
        tone === "neutral" && "bg-ink-100 text-ink-700",
        tone === "red" && "bg-danger-500/10 text-danger-500"
      )}
    >
      <b className="serif text-sm mr-1">{count}</b>
      {label}
    </div>
  );
}

function ResultRow({
  item,
  score,
  tone,
}: {
  item: QuickItem;
  score?: QuickScore;
  tone: "gold" | "neutral" | "red" | "muted";
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-3 rounded-xl",
        tone === "gold" && "bg-gold-400/10",
        tone === "neutral" && "bg-ink-100/60",
        tone === "red" && "bg-danger-500/5",
        tone === "muted" && "bg-ink-100/30"
      )}
    >
      <div
        className={cn(
          "w-10 text-center font-semibold serif text-xl shrink-0",
          tone === "gold" && "text-gold-600",
          tone === "neutral" && "text-ink-600",
          tone === "red" && "text-danger-500",
          tone === "muted" && "text-ink-300"
        )}
      >
        {score?.score ?? "—"}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-sm leading-snug",
            tone === "gold" ? "text-ink-900 font-medium" : "text-ink-700"
          )}
        >
          #{item.idx} {item.title}
        </div>
        {score?.reason && (
          <div className="text-xs text-ink-500 mt-1 leading-relaxed">
            「{score.reason}」
          </div>
        )}
      </div>
    </div>
  );
}

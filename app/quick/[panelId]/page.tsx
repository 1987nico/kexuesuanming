"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ThinkingDots } from "@/components/ui/Loading";

interface PanelInfo {
  id: string;
  title: string;
  items: { idx: number }[];
}

interface RespondentInfo {
  id: string;
  name: string;
}

interface ExistingScore {
  opp_idx: number;
  score: number;
}

const LS_KEY = (panelId: string) => `kxsm_quick_respondent_${panelId}`;

export default function QuickEntryPage({ params }: { params: { panelId: string } }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [panel, setPanel] = useState<PanelInfo | null>(null);
  const [existing, setExisting] = useState<{ respondent: RespondentInfo; doneCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // 先看本地有没有续接的受访者
        let cached: { id: string; name: string } | null = null;
        try {
          const raw = localStorage.getItem(LS_KEY(params.panelId));
          if (raw) cached = JSON.parse(raw);
        } catch {}

        const url = cached
          ? `/api/quick/panels/${params.panelId}?respondent_id=${cached.id}`
          : `/api/quick/panels/${params.panelId}`;
        const res = await fetch(url);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `加载失败 (${res.status})`);
        }
        const data = await res.json();
        setPanel(data.panel);
        if (data.respondent) {
          const doneCount = (data.scores as ExistingScore[]).length;
          setExisting({ respondent: data.respondent, doneCount });
        } else if (cached) {
          // 缓存失效，清掉
          localStorage.removeItem(LS_KEY(params.panelId));
        }
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.panelId]);

  async function startAsNew() {
    if (name.trim().length < 1) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quick/respondents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panelId: params.panelId, name: name.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `创建失败 (${res.status})`);
      }
      const { respondent } = await res.json();
      localStorage.setItem(
        LS_KEY(params.panelId),
        JSON.stringify({ id: respondent.id, name: respondent.name })
      );
      router.push(`/quick/${params.panelId}/score`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function continueExisting() {
    router.push(`/quick/${params.panelId}/score`);
  }

  function startFresh() {
    localStorage.removeItem(LS_KEY(params.panelId));
    setExisting(null);
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <ThinkingDots />
      </main>
    );
  }

  if (err && !panel) {
    return (
      <main className="p-7">
        <h1 className="serif text-2xl text-ink-900 mb-3">链接打不开</h1>
        <p className="text-danger-600 text-sm">{err}</p>
      </main>
    );
  }

  const total = panel?.items.length ?? 0;

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 px-7 pt-16 pb-8">
        <div className="text-xs text-ink-400 tracking-[0.3em] uppercase mb-6">Quick Score · 30 项</div>
        <h1 className="serif text-[36px] leading-[1.15] text-ink-900 mb-4">
          {panel?.title || "感性验证打分"}
        </h1>
        <p className="text-ink-600 leading-relaxed text-[15px] mb-6">
          这是一份「<b className="text-ink-900">想到我自己每天过这种日子，我有多被点亮</b>」的快速打分清单，共 {total} 项。
          你的答案会被独立记录，便于我事后对比不同人的真实直觉。
        </p>

        <div className="divider-ink my-7" />

        <div className="space-y-4 text-[14px] text-ink-700 mb-2">
          <Anchor n="0" label="抵触" sub="不想做" tone="red" />
          <Anchor n="3" label="没感觉" sub="无所谓" tone="red" />
          <Anchor n="5" label="不期待" sub="不讨厌但不期待" tone="neutral" />
          <Anchor n="7" label="想试试" sub="被点亮" tone="gold" />
          <Anchor n="9" label="来劲" sub="一想起就有劲" tone="gold" />
          <Anchor n="10" label="这就是我" sub="完全契合" tone="gold" />
        </div>

        <div className="divider-ink my-7" />

        <p className="text-xs text-ink-400 leading-relaxed">
          全程约 8–15 分钟。可随时关掉页面，下次打开自动续上。
          不需要每张都写理由，但 7 分以上建议写一句你的真实反应（凭直觉，不必字斟句酌）。
        </p>
      </div>

      <div className="px-7 pb-10 space-y-3">
        {existing ? (
          <>
            <div className="rounded-2xl bg-ink-100/60 px-5 py-4 mb-2">
              <div className="text-xs text-ink-500 mb-1">检测到你之前以「<b className="text-ink-900">{existing.respondent.name}</b>」打过</div>
              <div className="text-sm text-ink-700">
                已完成 <b>{existing.doneCount}</b> / {total} 项
              </div>
            </div>
            <Button size="lg" className="w-full" onClick={continueExisting}>
              继续打分
            </Button>
            <button
              className="w-full text-center text-sm text-ink-400 hover:text-ink-700 py-2"
              onClick={startFresh}
            >
              不是我，换个名字重打
            </button>
          </>
        ) : (
          <>
            <label className="text-sm text-ink-700 block">称呼（方便我事后区分你的答卷）</label>
            <input
              type="text"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="比如：刘畅 / 老王 / 妈妈"
              className="w-full px-5 py-4 rounded-2xl bg-white border border-ink-200 text-ink-900 placeholder:text-ink-300 focus:outline-none focus:border-ink-700"
              autoFocus
            />
            <Button
              size="lg"
              className="w-full mt-2"
              onClick={startAsNew}
              disabled={submitting || name.trim().length < 1}
            >
              {submitting ? "创建中…" : "开始打分"}
            </Button>
            {err && <p className="text-danger-600 text-xs text-center">{err}</p>}
          </>
        )}
      </div>
    </main>
  );
}

function Anchor({
  n,
  label,
  sub,
  tone,
}: {
  n: string;
  label: string;
  sub: string;
  tone: "red" | "neutral" | "gold";
}) {
  return (
    <div className="flex items-center gap-4">
      <div
        className={
          "shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-base font-semibold serif " +
          (tone === "gold"
            ? "bg-gold-400/20 text-gold-600 border border-gold-400/60"
            : tone === "neutral"
              ? "bg-ink-100 text-ink-700"
              : "bg-danger-500/10 text-danger-500 border border-danger-400/40")
        }
      >
        {n}
      </div>
      <div className="flex-1">
        <div className="text-ink-900 font-medium">{label}</div>
        <div className="text-ink-500 text-sm">{sub}</div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Chip, FieldLabel, Section, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";

export default function FeedbackPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [shocking, setShocking] = useState<number | null>(null);
  const [nps, setNps] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await fetch(`/api/runs/${params.id}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          satisfaction_score: satisfaction ?? undefined,
          shocking_count: shocking ?? undefined,
          would_recommend: nps ?? undefined,
          feedback_text: text || undefined,
        }),
      });
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main>
        <PageHeader title="收到，谢谢" />
        <div className="px-7 pt-20 pb-20 text-center">
          <div className="serif text-3xl text-ink-900 mb-3">你的反馈我看到了</div>
          <p className="text-ink-500 mb-10">每一份反馈我都会亲自读，然后用来迭代下一版。</p>
          <Button size="lg" onClick={() => router.push("/")}>回到首页</Button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <PageHeader step="价值验证" title="1 分钟反馈" subtitle="这是产品价值验证阶段的核心数据来源" back={`/run/${params.id}/report`} />
      <div className="px-5 pt-6 pb-32 space-y-7">
        <Section title="这份报告帮你看到了你没看到的东西吗" hint="1=完全没有，5=帮我看到了很多新东西">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Chip key={n} selected={satisfaction === n} onClick={() => setSatisfaction(n)}>
                {n}
              </Chip>
            ))}
          </div>
        </Section>
        <Section title="「输的剧本」里有几条让你脊背发凉" hint="价值验证阶段我们最在乎的指标">
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <Chip key={n} selected={shocking === n} onClick={() => setShocking(n)}>
                {n}
              </Chip>
            ))}
          </div>
        </Section>
        <Section title="你会推荐给身边正在职业关口的朋友吗" hint="0=完全不会，10=一定会">
          <div className="flex gap-2 flex-wrap">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <Chip key={n} selected={nps === n} onClick={() => setNps(n)}>
                {n}
              </Chip>
            ))}
          </div>
        </Section>
        <Section title="还有什么想说的">
          <Textarea
            rows={5}
            placeholder="哪一步最有用？哪里没看见你？AI 在哪打偏了？任何吐槽都欢迎。"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Section>
      </div>
      <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto p-5 bg-gradient-to-t from-ink-50 via-ink-50/95 to-transparent">
        <Button size="lg" className="w-full" onClick={submit} disabled={submitting}>
          {submitting ? "提交…" : "提交反馈"}
        </Button>
      </div>
    </main>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function HomeStartButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    try {
      const r = await fetch("/api/runs", { method: "POST" });
      const { run } = await r.json();
      router.push(`/run/${run.id}/survey`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="lg" className="w-full" onClick={start} disabled={loading}>
        {loading ? "准备中…" : "开始一次完整诊断"}
      </Button>
      <p className="text-center text-xs text-ink-400 mt-4">
        全程约 35–60 分钟 · Step 3 需本人逐条打分
      </p>
    </>
  );
}

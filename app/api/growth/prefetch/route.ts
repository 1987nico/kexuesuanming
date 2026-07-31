import { NextResponse } from "next/server";
import { growthStore } from "@/lib/growth/store";
import {
  queuedTopicRuns,
  TOPIC_PREFETCH_MAX,
  topicPrefetchEnabled,
} from "@/lib/growth/performanceCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_TENANT_ID = "mianbajun";
const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

function authorized(req: Request) {
  return Boolean(
    process.env.CRON_SECRET
    && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`,
  );
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!topicPrefetchEnabled()) {
    return NextResponse.json({ status: "disabled", processed: 0 });
  }

  const store = growthStore();
  const accounts = await store.listAccounts(DEFAULT_TENANT_ID);
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  const perOwner = new Map<string, typeof accounts>();
  for (const account of accounts) {
    if (!account.owner_user_id || !account.business_line || account.profile_status === "archived") continue;
    const lastUsedAt = Date.parse(account.last_used_at ?? account.updated_at ?? account.created_at);
    if (!Number.isFinite(lastUsedAt) || lastUsedAt < cutoff) continue;
    const bucket = perOwner.get(account.owner_user_id) ?? [];
    bucket.push(account);
    perOwner.set(account.owner_user_id, bucket);
  }

  const candidates = [...perOwner.values()].flatMap((items) =>
    items
      .sort((left, right) => (
        Date.parse(right.last_used_at ?? right.updated_at)
        - Date.parse(left.last_used_at ?? left.updated_at)
      ))
      .slice(0, 5)
  );
  const target = Math.min(
    Math.max(Number(process.env.GROWTH_NIGHTLY_PREFETCH_TARGET ?? 4), 1),
    TOPIC_PREFETCH_MAX,
  );
  // 单个标题批次仍可能花费接近实时接口的完整时限。定时任务如果一次串行
  // 处理十几个账号，会在 Vercel 结束请求前来不及返回。每个时间片只处理
  // 两个最缺库存的账号，四次夜间任务轮转补齐，质量门禁保持完全一致。
  const limit = Math.min(Math.max(Number(process.env.GROWTH_PREFETCH_ACCOUNT_LIMIT ?? 2), 1), 4);
  const pending: Array<{ account: (typeof accounts)[number]; queuedCount: number }> = [];
  for (const account of candidates) {
    const runs = await store.listRuns(account.id);
    const queuedCount = queuedTopicRuns(runs, account, "default").length;
    if (queuedCount >= target) continue;
    pending.push({ account, queuedCount });
  }
  pending.sort((left, right) => (
    left.queuedCount - right.queuedCount
    || Date.parse(right.account.last_used_at ?? right.account.updated_at)
      - Date.parse(left.account.last_used_at ?? left.account.updated_at)
  ));
  const selected = pending.slice(0, limit).map((item) => item.account);

  const origin = new URL(req.url).origin;
  const results: Array<{ accountId: string; ok: boolean; status: number }> = [];
  // 只开两个并发，避免同一时段把模型和数据库推到峰值；每次定时任务每个
  // 活跃账号补一批，03:00—05:00 的四次任务共同补足默认4批。
  for (let index = 0; index < selected.length; index += 2) {
    const slice = selected.slice(index, index + 2);
    const settled = await Promise.all(slice.map(async (account) => {
      const response = await fetch(`${origin}/api/growth/topics`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          accountId: account.id,
          businessLine: account.business_line,
          persona: account.persona,
          generationMode: "default",
          action: "regenerate_titles",
          requestMode: "prefetch",
          prefetchTarget: target,
          requestId: crypto.randomUUID(),
        }),
      });
      return { accountId: account.id, ok: response.ok, status: response.status };
    }));
    results.push(...settled);
  }

  return NextResponse.json({
    status: results.every((item) => item.ok) ? "completed" : "partial",
    activeAccounts: candidates.length,
    processed: results.length,
    succeeded: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok),
    target,
  });
}

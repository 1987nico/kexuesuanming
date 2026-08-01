import { NextResponse } from "next/server";
import { growthStore } from "@/lib/growth/store";
import {
  queuedTopicRuns,
  TOPIC_PREFETCH_LOW_WATERMARK,
  TOPIC_PREFETCH_MAX,
  TOPIC_PREFETCH_TARGET,
  topicPrefetchEnabled,
} from "@/lib/growth/performanceCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_TENANT_ID = "mianbajun";
const ACTIVE_WINDOW_MS = 3 * 24 * 60 * 60 * 1_000;
const HOT_WINDOW_MS = 24 * 60 * 60 * 1_000;

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
    Math.max(Number(process.env.GROWTH_NIGHTLY_PREFETCH_TARGET ?? TOPIC_PREFETCH_TARGET), 1),
    TOPIC_PREFETCH_MAX,
  );
  // 单个标题批次仍可能花费接近实时接口的完整时限。定时任务如果一次串行
  // 处理十几个账号，会在 Vercel 结束请求前来不及返回。每个时间片只处理
  // 两个最缺库存的账号，四次夜间任务轮转补齐，质量门禁保持完全一致。
  const limit = Math.min(Math.max(Number(process.env.GROWTH_PREFETCH_ACCOUNT_LIMIT ?? 3), 1), 4);
  const pending: Array<{
    account: (typeof accounts)[number];
    queuedCount: number;
    lastAttemptAt: number;
    lastUsedAt: number;
    accountTarget: number;
  }> = [];
  for (const account of candidates) {
    const runs = await store.listRuns(account.id);
    const queuedCount = queuedTopicRuns(runs, account, "default").length;
    const lastUsedAt = Date.parse(account.last_used_at ?? account.updated_at ?? account.created_at);
    const accountTarget = Date.now() - lastUsedAt <= HOT_WINDOW_MS
      ? target
      : Math.min(2, target);
    if (queuedCount >= accountTarget) continue;
    const lastAttemptAt = runs.reduce((latest, run) => {
      if (!run.generation_request_id) return latest;
      const attemptedAt = Date.parse(run.updated_at || run.created_at);
      return Number.isFinite(attemptedAt) ? Math.max(latest, attemptedAt) : latest;
    }, 0);
    pending.push({ account, queuedCount, lastAttemptAt, lastUsedAt, accountTarget });
  }
  pending.sort((left, right) => (
    // 先保护刚刚使用、且已经低于3批安全水位的账号；用户继续换批时最容易
    // 在这些账号上撞到实时生成。温账号保留2批即可，不与热账号争抢预算。
    Number(!(left.lastUsedAt >= Date.now() - HOT_WINDOW_MS && left.queuedCount < TOPIC_PREFETCH_LOW_WATERMARK))
      - Number(!(right.lastUsedAt >= Date.now() - HOT_WINDOW_MS && right.queuedCount < TOPIC_PREFETCH_LOW_WATERMARK))
    || right.lastUsedAt - left.lastUsedAt
    || left.queuedCount - right.queuedCount
    || left.lastAttemptAt - right.lastAttemptAt
  ));
  const selected = pending.slice(0, limit);

  const origin = new URL(req.url).origin;
  const results: Array<{ accountId: string; ok: boolean; status: number; attempts: number }> = [];
  // 只开两个并发，避免同一时段把模型和数据库推到峰值；每次定时任务每个
  // 热账号最多补3批，03:00—05:00 的四个窗口共同维持6批库存。
  for (let index = 0; index < selected.length; index += 2) {
    const slice = selected.slice(index, index + 2);
    const settled = await Promise.all(slice.map(async ({ account, queuedCount, accountTarget }) => {
      // 一个夜间时间片最多连续补3批；四个时间片足以把热账号推至6批，且不会
      // 因单个账号耗尽整个Vercel函数时限。
      const refillBudget = Math.min(Math.max(accountTarget - queuedCount, 1), 3);
      let status = 200;
      let attempts = 0;
      for (; attempts < refillBudget; attempts += 1) {
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
            prefetchTarget: accountTarget,
            requestId: crypto.randomUUID(),
          }),
        });
        status = response.status;
        if (!response.ok) break;
        const payload = await response.json().catch(() => ({})) as { cacheHit?: boolean };
        if (payload.cacheHit) break;
      }
      return {
        accountId: account.id,
        ok: status >= 200 && status < 300,
        status,
        attempts: Math.min(attempts + 1, refillBudget),
      };
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

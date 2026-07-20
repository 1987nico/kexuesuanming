import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { generateDraftVariants } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import { accountForBusinessGeneration } from "@/lib/growth/businessCompatibility";
import { buildThreeDayLearningBrief } from "@/lib/growth/threeDayLearning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  runId: z.string().min(1),
  topicId: z.string().min(1),
  count: z.number().int().min(1).max(3).optional(),
  excludeBodies: z.array(z.string()).max(6).optional(),
});

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const run = await store.getRun(parsed.data.runId);
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  const account = await store.getAccount(run.account_id);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const topic = run.topic_pool.find((candidate) => candidate.id === parsed.data.topicId);
  if (!topic) return NextResponse.json({ error: "topic_not_found" }, { status: 404 });

  const notes = await store.listDrafts(account.id);
  const learningBrief = buildThreeDayLearningBrief({
    account,
    drafts: notes,
    methodId: topic.method_id,
    generationMode: topic.generation_mode,
  });

  const { drafts, usage } = await generateDraftVariants({
    tenantId: DEFAULT_TENANT_ID,
    account: accountForBusinessGeneration(account),
    run,
    topic,
    count: parsed.data.count ?? 2,
    excludeBodies: parsed.data.excludeBodies,
    learningBrief,
  });

  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      ...usage,
      metadata: { action: "draft_variants", runId: run.id, topicId: topic.id },
    });
  }

  return NextResponse.json({ drafts, topic, learningTrace: learningBrief.trace });
}

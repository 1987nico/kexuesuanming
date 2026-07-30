import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore, inferGrowthBusinessLine } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["archive", "restore", "make_default"]) }),
  z.object({
    action: z.literal("resolve_attribution"),
    resolution: z.enum(["confirm", "reassign"]),
    businessLine: z.enum(["executive", "overseas_student"]),
    persona: z.enum(["merchant", "buyer", "expert"]),
  }),
  z.object({
    action: z.literal("archive_pending"),
    businessLine: z.enum(["executive", "overseas_student"]),
    persona: z.enum(["merchant", "buyer", "expert"]),
  }),
]);

export async function PATCH(
  req: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", message: "账号人设操作无效。" }, { status: 400 });
  }
  const { accountId } = await context.params;
  const store = growthStore();
  const account = await store.getAccount(accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const attributionAction = parsed.data.action === "resolve_attribution"
    || parsed.data.action === "archive_pending";
  if (
    (attributionAction && account.owner_user_id !== guard.auth.user.id)
    || (!attributionAction && guard.auth.role !== "admin" && account.owner_user_id !== guard.auth.user.id)
  ) {
    return NextResponse.json({ error: "forbidden", message: "不能操作其他用户的账号人设。" }, { status: 403 });
  }

  const now = new Date().toISOString();
  if (parsed.data.action === "resolve_attribution") {
    const attributionRequest = parsed.data;
    const unchanged = account.profile_attribution_confirmation?.business_line === attributionRequest.businessLine
      && account.profile_attribution_confirmation?.persona === attributionRequest.persona
      && account.business_line === attributionRequest.businessLine
      && account.persona === attributionRequest.persona
      && account.profile_status !== "archived";
    if (unchanged) {
      return NextResponse.json({ account, unchanged: true });
    }
    const fromBusinessLine = account.business_line;
    const fromPersona = account.persona;
    const targetSiblings = (await store.listAccounts(
      account.tenant_id,
      account.owner_user_id ?? undefined,
    )).filter((candidate) =>
      candidate.id !== account.id
      && candidate.business_line === attributionRequest.businessLine
      && candidate.persona === attributionRequest.persona
      && candidate.profile_status !== "archived");
    account.business_line = attributionRequest.businessLine;
    account.persona = attributionRequest.persona;
    account.profile_status = "active";
    account.is_default_profile = targetSiblings.length === 0;
    account.display_order = targetSiblings.length;
    account.profile_attribution_confirmation = {
      business_line: attributionRequest.businessLine,
      persona: attributionRequest.persona,
      confirmed_at: now,
      confirmed_by: guard.auth.user.id,
    };
    account.profile_attribution_history = [
      ...(account.profile_attribution_history ?? []),
      {
        action: attributionRequest.resolution,
        from_business_line: fromBusinessLine,
        from_persona: fromPersona,
        to_business_line: attributionRequest.businessLine,
        to_persona: attributionRequest.persona,
        operated_at: now,
        operated_by: guard.auth.user.id,
      },
    ];
  } else if (parsed.data.action === "archive_pending") {
    if (account.profile_status === "archived") {
      return NextResponse.json({ account, unchanged: true });
    }
    const archiveRequest = parsed.data;
    const fromBusinessLine = account.business_line;
    const fromPersona = account.persona;
    account.business_line = archiveRequest.businessLine;
    account.persona = archiveRequest.persona;
    account.profile_status = "archived";
    account.is_default_profile = false;
    account.profile_attribution_confirmation = {
      business_line: archiveRequest.businessLine,
      persona: archiveRequest.persona,
      confirmed_at: now,
      confirmed_by: guard.auth.user.id,
    };
    account.profile_attribution_history = [
      ...(account.profile_attribution_history ?? []),
      {
        action: "archive",
        from_business_line: fromBusinessLine,
        from_persona: fromPersona,
        to_business_line: archiveRequest.businessLine,
        to_persona: archiveRequest.persona,
        operated_at: now,
        operated_by: guard.auth.user.id,
      },
    ];
  } else if (parsed.data.action === "archive") {
    const siblings = (await store.listAccounts(
      account.tenant_id,
      account.owner_user_id ?? undefined,
      inferGrowthBusinessLine(account),
    )).filter((candidate) =>
      candidate.id !== account.id
      && candidate.persona === account.persona
      && candidate.profile_status !== "archived");
    if (!siblings.length) {
      return NextResponse.json({
        error: "last_active_profile",
        message: "当前视角至少要保留一个账号人设，请先新建另一个再归档。",
      }, { status: 409 });
    }
    account.profile_status = "archived";
    account.is_default_profile = false;
  } else if (parsed.data.action === "restore") {
    account.profile_status = "active";
  } else {
    const siblings = await store.listAccounts(
      account.tenant_id,
      account.owner_user_id ?? undefined,
      inferGrowthBusinessLine(account),
    );
    await Promise.all(siblings
      .filter((candidate) => candidate.persona === account.persona && candidate.id !== account.id)
      .map(async (candidate) => {
        if (!candidate.is_default_profile) return;
        candidate.is_default_profile = false;
        candidate.updated_at = now;
        await store.saveAccount(candidate);
      }));
    account.is_default_profile = true;
  }
  account.last_used_at = now;
  account.updated_at = now;
  await store.saveAccount(account);
  return NextResponse.json({ account });
}

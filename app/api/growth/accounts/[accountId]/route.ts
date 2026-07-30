import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore, inferGrowthBusinessLine } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["archive", "restore", "make_default"]),
});

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
  if (guard.auth.role !== "admin" && account.owner_user_id !== guard.auth.user.id) {
    return NextResponse.json({ error: "forbidden", message: "不能操作其他用户的账号人设。" }, { status: 403 });
  }

  const now = new Date().toISOString();
  if (parsed.data.action === "archive") {
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

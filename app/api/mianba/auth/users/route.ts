import { NextResponse } from "next/server";
import { z } from "zod";
import { MIANBA_ROLES, type MianbaRole } from "@/lib/auth/constants";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { mianbaAuthStore, type MianbaTenantUser } from "@/lib/auth/mianbaStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  account: z.string().min(2).max(80),
  display_name: z.string().max(80).optional(),
  displayName: z.string().max(80).optional(),
  role: z.enum(MIANBA_ROLES).default("operator"),
  password: z.string().min(8).max(200),
});

const patchSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().max(80).optional(),
  displayName: z.string().max(80).optional(),
  role: z.enum(MIANBA_ROLES).optional(),
  password: z.string().min(8).max(200).optional(),
  disabled: z.boolean().optional(),
});

function safeUser(user: MianbaTenantUser) {
  const rest = { ...user };
  delete (rest as Partial<MianbaTenantUser>).password_hash;
  return rest;
}

export async function GET() {
  const guard = await requireMianbaApiAuth(["admin"]);
  if ("response" in guard) return guard.response;

  const users = await mianbaAuthStore().listUsers(guard.auth.tenantId);
  return NextResponse.json({ users: users.map(safeUser) });
}

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth(["admin"]);
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await mianbaAuthStore().createUser({
      tenant_id: guard.auth.tenantId,
      account: parsed.data.account,
      display_name: parsed.data.display_name ?? parsed.data.displayName,
      role: parsed.data.role as MianbaRole,
      password: parsed.data.password,
    });
    return NextResponse.json({ user: safeUser(user) }, { status: 201 });
  } catch (error) {
    if ((error as Error).message === "account_exists") {
      return NextResponse.json({ error: "account_exists", message: "这个账号已经存在。" }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(req: Request) {
  const guard = await requireMianbaApiAuth(["admin"]);
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.id === guard.auth.user.id) {
    if (parsed.data.disabled === true) {
      return NextResponse.json({ error: "self_disable_forbidden", message: "不能禁用当前登录的管理员账号。" }, { status: 400 });
    }
    if (parsed.data.role === "operator") {
      return NextResponse.json({ error: "self_demote_forbidden", message: "不能把当前登录账号改成操作者。" }, { status: 400 });
    }
  }

  const user = await mianbaAuthStore().updateUser(parsed.data.id, {
    display_name: parsed.data.display_name ?? parsed.data.displayName,
    role: parsed.data.role,
    password: parsed.data.password,
    disabled: parsed.data.disabled,
  });
  if (!user || user.tenant_id !== guard.auth.tenantId) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  return NextResponse.json({ user: safeUser(user) });
}

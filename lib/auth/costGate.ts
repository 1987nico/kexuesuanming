import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { isProductionRuntime } from "@/lib/db/supabase";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requestToken(req: Request) {
  const url = new URL(req.url);
  return url.searchParams.get("run_token") || req.headers.get("x-run-generation-token");
}

export async function requireRunGenerationAccess(req: Request) {
  if (!isProductionRuntime()) return null;

  const authGuard = await requireMianbaApiAuth();
  if (!("response" in authGuard)) return null;

  const configuredToken = process.env.RUN_GENERATION_TOKEN;
  const token = requestToken(req);
  if (configuredToken && token && safeEqual(configuredToken, token)) return null;

  console.warn("[run-generation] blocked public generation request", { path: new URL(req.url).pathname });
  return NextResponse.json(
    {
      error: "run_generation_locked",
      message: "生产环境已关闭公开 AI 生成入口，请登录后台或配置 RUN_GENERATION_TOKEN 后再调用。",
    },
    { status: 403 },
  );
}

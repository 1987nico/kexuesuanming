/**
 * Supabase 客户端封装 —— 服务端用 service_role key 绕过 RLS（仅在 API 路由中调用）。
 * MVP 价值验证阶段先不启用 RLS（数据少，运维简单），后续视情况再加。
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _server: SupabaseClient | null = null;

export function supabaseServer(): SupabaseClient {
  if (_server) return _server;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("[supabase] 缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  }
  _server = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _server;
}

/**
 * 价值验证阶段：可选的开关 —— 没配 Supabase 时使用内存 fallback，方便本地起跑。
 */
export function isDBConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

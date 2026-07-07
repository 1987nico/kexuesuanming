import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDBConfigured, supabaseServer } from "@/lib/db/supabase";

/**
 * 操作流水（阶段0）：记录"谁在什么时候干了什么"。
 * 管理者驾驶舱的人员工作状态直接读 activity_log，不需要扫业务表。
 * 写入永不抛错——审计失败不能影响业务主流程。
 */

export type ActivityAction =
  | "login"
  | "order_created"
  | "order_status_updated"
  | "draft_published"
  | "profile_submitted"
  | (string & {});

export interface ActivityInput {
  tenantId: string;
  /** 操作人（tenant_users.id）；客户公开链接触发的动作为 null */
  userId?: string | null;
  action: ActivityAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

function activityFilePath() {
  return path.join(process.cwd(), ".data", "activity-log.json");
}

function appendToFile(entry: Record<string, unknown>) {
  const filePath = activityFilePath();
  let entries: Record<string, unknown>[] = [];
  if (existsSync(filePath)) {
    try {
      entries = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>[];
    } catch {
      entries = [];
    }
  }
  entries.push(entry);
  // 本地文件模式只保留最近 5000 条，防止无限膨胀
  if (entries.length > 5000) entries = entries.slice(-5000);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(entries, null, 2));
}

export interface ActivityEntry {
  id?: string;
  tenant_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** 读取最近的操作流水（新→旧）。读取失败返回空数组，不抛错。 */
export async function listActivity(tenantId: string, limit = 200): Promise<ActivityEntry[]> {
  try {
    if (isDBConfigured()) {
      const { data, error } = await supabaseServer()
        .from("activity_log")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as ActivityEntry[];
    }
    const filePath = activityFilePath();
    if (!existsSync(filePath)) return [];
    const entries = JSON.parse(readFileSync(filePath, "utf8")) as ActivityEntry[];
    return entries
      .filter((entry) => entry.tenant_id === tenantId)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .slice(0, limit);
  } catch (error) {
    console.warn("[activity] 操作流水读取失败：", (error as Error)?.message);
    return [];
  }
}

export async function logActivity(input: ActivityInput): Promise<void> {
  const entry = {
    tenant_id: input.tenantId,
    user_id: input.userId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  };

  try {
    if (isDBConfigured()) {
      const { error } = await supabaseServer().from("activity_log").insert(entry);
      if (error) throw error;
    } else {
      appendToFile({ ...entry, created_at: new Date().toISOString() });
    }
  } catch (error) {
    console.warn("[activity] 操作流水写入失败：", (error as Error)?.message);
  }
}

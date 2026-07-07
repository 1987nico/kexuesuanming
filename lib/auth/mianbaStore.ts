import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertCloudDatabaseConfigured, isDBConfigured, supabaseServer } from "@/lib/db/supabase";
import { DEFAULT_MIANBA_TENANT_ID, type MianbaRole } from "./constants";
import { hashPassword, normalizeAccount } from "./password";

export interface MianbaTenantUser {
  id: string;
  tenant_id: string;
  account: string;
  display_name: string;
  role: MianbaRole;
  password_hash: string;
  disabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface MianbaAuthSession {
  id: string;
  tenant_id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string;
}

export interface CreateTenantUserInput {
  tenant_id?: string;
  account: string;
  display_name?: string;
  role: MianbaRole;
  password: string;
  disabled?: boolean;
}

export interface UpdateTenantUserInput {
  display_name?: string;
  role?: MianbaRole;
  password?: string;
  disabled?: boolean;
}

export interface MianbaAuthStore {
  ensureInitialUsers(env?: NodeJS.ProcessEnv): Promise<void>;
  listUsers(tenantId: string): Promise<MianbaTenantUser[]>;
  findUserByAccount(tenantId: string, account: string): Promise<MianbaTenantUser | null>;
  getUserById(id: string): Promise<MianbaTenantUser | null>;
  createUser(input: CreateTenantUserInput): Promise<MianbaTenantUser>;
  updateUser(id: string, input: UpdateTenantUserInput): Promise<MianbaTenantUser | null>;
  createSession(input: {
    tenant_id: string;
    user_id: string;
    token_hash: string;
    expires_at: string;
  }): Promise<MianbaAuthSession>;
  getSessionByTokenHash(tokenHash: string): Promise<MianbaAuthSession | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
  touchSession(id: string): Promise<void>;
}

interface FileAuthState {
  users: MianbaTenantUser[];
  sessions: MianbaAuthSession[];
}

function authStoreFilePath() {
  return path.join(process.cwd(), ".data", "mianba-auth.json");
}

function readFileState(): FileAuthState {
  const filePath = authStoreFilePath();
  if (!existsSync(filePath)) return { users: [], sessions: [] };
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as FileAuthState;
  } catch {
    return { users: [], sessions: [] };
  }
}

function writeFileState(state: FileAuthState) {
  const filePath = authStoreFilePath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function publicUserFields(user: MianbaTenantUser): MianbaTenantUser {
  return { ...user };
}

function localDefaultPassword(role: MianbaRole, env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV === "production") return "";
  return role === "admin" ? "admin123456" : "operator123456";
}

function initialUsersFromEnv(env: NodeJS.ProcessEnv = process.env): CreateTenantUserInput[] {
  const adminPassword = env.MIANBA_ADMIN_PASSWORD || localDefaultPassword("admin", env);
  const operatorPassword = env.MIANBA_OPERATOR_PASSWORD || localDefaultPassword("operator", env);
  const users: CreateTenantUserInput[] = [];

  if (adminPassword) {
    users.push({
      tenant_id: DEFAULT_MIANBA_TENANT_ID,
      account: env.MIANBA_ADMIN_ACCOUNT || "admin",
      display_name: "面霸君管理员",
      role: "admin",
      password: adminPassword,
    });
  }

  if (operatorPassword) {
    users.push({
      tenant_id: DEFAULT_MIANBA_TENANT_ID,
      account: env.MIANBA_OPERATOR_ACCOUNT || "operator",
      display_name: "面霸君操作者",
      role: "operator",
      password: operatorPassword,
    });
  }

  return users;
}

class FileMianbaAuthStore implements MianbaAuthStore {
  private state: FileAuthState;

  constructor() {
    this.state = readFileState();
  }

  private persist() {
    writeFileState(this.state);
  }

  async ensureInitialUsers(env: NodeJS.ProcessEnv = process.env) {
    for (const seed of initialUsersFromEnv(env)) {
      const existing = await this.findUserByAccount(seed.tenant_id ?? DEFAULT_MIANBA_TENANT_ID, seed.account);
      if (!existing) await this.createUser(seed);
    }
  }

  async listUsers(tenantId: string) {
    return this.state.users
      .filter((user) => user.tenant_id === tenantId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(publicUserFields);
  }

  async findUserByAccount(tenantId: string, account: string) {
    const normalized = normalizeAccount(account);
    return this.state.users.find((user) => user.tenant_id === tenantId && user.account === normalized) ?? null;
  }

  async getUserById(id: string) {
    return this.state.users.find((user) => user.id === id) ?? null;
  }

  async createUser(input: CreateTenantUserInput) {
    const tenantId = input.tenant_id ?? DEFAULT_MIANBA_TENANT_ID;
    const account = normalizeAccount(input.account);
    const existing = await this.findUserByAccount(tenantId, account);
    if (existing) throw new Error("account_exists");
    const timestamp = new Date().toISOString();
    const user: MianbaTenantUser = {
      id: randomUUID(),
      tenant_id: tenantId,
      account,
      display_name: input.display_name?.trim() || account,
      role: input.role,
      password_hash: hashPassword(input.password),
      disabled: input.disabled ?? false,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.state.users.push(user);
    this.persist();
    return publicUserFields(user);
  }

  async updateUser(id: string, input: UpdateTenantUserInput) {
    const existing = this.state.users.find((user) => user.id === id);
    if (!existing) return null;
    const updated: MianbaTenantUser = {
      ...existing,
      display_name: input.display_name?.trim() || existing.display_name,
      role: input.role ?? existing.role,
      disabled: input.disabled ?? existing.disabled,
      password_hash: input.password ? hashPassword(input.password) : existing.password_hash,
      updated_at: new Date().toISOString(),
    };
    this.state.users = this.state.users.map((user) => (user.id === id ? updated : user));
    this.persist();
    return publicUserFields(updated);
  }

  async createSession(input: {
    tenant_id: string;
    user_id: string;
    token_hash: string;
    expires_at: string;
  }) {
    const timestamp = new Date().toISOString();
    const session: MianbaAuthSession = {
      id: randomUUID(),
      tenant_id: input.tenant_id,
      user_id: input.user_id,
      token_hash: input.token_hash,
      expires_at: input.expires_at,
      created_at: timestamp,
      last_seen_at: timestamp,
    };
    this.state.sessions.push(session);
    this.persist();
    return session;
  }

  async getSessionByTokenHash(tokenHash: string) {
    return this.state.sessions.find((session) => session.token_hash === tokenHash) ?? null;
  }

  async deleteSessionByTokenHash(tokenHash: string) {
    this.state.sessions = this.state.sessions.filter((session) => session.token_hash !== tokenHash);
    this.persist();
  }

  async touchSession(id: string) {
    this.state.sessions = this.state.sessions.map((session) =>
      session.id === id ? { ...session, last_seen_at: new Date().toISOString() } : session,
    );
    this.persist();
  }
}

class SupabaseMianbaAuthStore implements MianbaAuthStore {
  private get db() {
    return supabaseServer();
  }

  async ensureInitialUsers(env: NodeJS.ProcessEnv = process.env) {
    await this.db.from("tenants").upsert({ id: DEFAULT_MIANBA_TENANT_ID, name: "面霸君" });
    for (const seed of initialUsersFromEnv(env)) {
      const existing = await this.findUserByAccount(seed.tenant_id ?? DEFAULT_MIANBA_TENANT_ID, seed.account);
      if (!existing) await this.createUser(seed);
    }
  }

  async listUsers(tenantId: string) {
    const { data, error } = await this.db
      .from("tenant_users")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as MianbaTenantUser[];
  }

  async findUserByAccount(tenantId: string, account: string) {
    const { data, error } = await this.db
      .from("tenant_users")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("account", normalizeAccount(account))
      .maybeSingle();
    if (error) throw error;
    return (data as MianbaTenantUser | null) ?? null;
  }

  async getUserById(id: string) {
    const { data, error } = await this.db.from("tenant_users").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as MianbaTenantUser | null) ?? null;
  }

  async createUser(input: CreateTenantUserInput) {
    const tenantId = input.tenant_id ?? DEFAULT_MIANBA_TENANT_ID;
    const account = normalizeAccount(input.account);
    const { data, error } = await this.db
      .from("tenant_users")
      .insert({
        id: randomUUID(),
        tenant_id: tenantId,
        account,
        display_name: input.display_name?.trim() || account,
        role: input.role,
        password_hash: hashPassword(input.password),
        disabled: input.disabled ?? false,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as MianbaTenantUser;
  }

  async updateUser(id: string, input: UpdateTenantUserInput) {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.display_name !== undefined) patch.display_name = input.display_name.trim();
    if (input.role !== undefined) patch.role = input.role;
    if (input.disabled !== undefined) patch.disabled = input.disabled;
    if (input.password) patch.password_hash = hashPassword(input.password);

    const { data, error } = await this.db.from("tenant_users").update(patch).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    return (data as MianbaTenantUser | null) ?? null;
  }

  async createSession(input: {
    tenant_id: string;
    user_id: string;
    token_hash: string;
    expires_at: string;
  }) {
    const { data, error } = await this.db
      .from("auth_sessions")
      .insert({
        tenant_id: input.tenant_id,
        user_id: input.user_id,
        token_hash: input.token_hash,
        expires_at: input.expires_at,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as MianbaAuthSession;
  }

  async getSessionByTokenHash(tokenHash: string) {
    const { data, error } = await this.db
      .from("auth_sessions")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    return (data as MianbaAuthSession | null) ?? null;
  }

  async deleteSessionByTokenHash(tokenHash: string) {
    const { error } = await this.db.from("auth_sessions").delete().eq("token_hash", tokenHash);
    if (error) throw error;
  }

  async touchSession(id: string) {
    const { error } = await this.db
      .from("auth_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __MIANBA_AUTH_STORE__: MianbaAuthStore | undefined;
}

export function mianbaAuthStore(): MianbaAuthStore {
  if (!globalThis.__MIANBA_AUTH_STORE__) {
    assertCloudDatabaseConfigured("mianbaAuthStore");
    globalThis.__MIANBA_AUTH_STORE__ = isDBConfigured() ? new SupabaseMianbaAuthStore() : new FileMianbaAuthStore();
    if (!isDBConfigured()) {
      console.warn("[mianbaAuthStore] 未配置 Supabase，已启用账号系统本地文件存储。");
    }
  }
  return globalThis.__MIANBA_AUTH_STORE__;
}

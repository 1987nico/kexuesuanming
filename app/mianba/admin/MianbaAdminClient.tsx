"use client";

import { useCallback, useEffect, useState } from "react";
import MianbaLogoutButton from "../MianbaLogoutButton";

type AdminRole = "admin" | "operator";

interface TenantUser {
  id: string;
  account: string;
  display_name: string;
  role: AdminRole;
  disabled: boolean;
  created_at: string;
  updated_at: string;
}

function formatPriceLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "未设置价格";
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `¥${trimmed}`;
  return trimmed;
}

const roleLabels: Record<AdminRole, string> = {
  admin: "管理员",
  operator: "操作者",
};

export default function MianbaAdminClient({
  currentUserName,
  currentRoleLabel,
}: {
  currentUserName: string;
  currentRoleLabel: string;
}) {
  const [settingsForm, setSettingsForm] = useState({ report_lite_price: "199", report_deep_price: "6999" });
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [usersMessage, setUsersMessage] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    account: "",
    display_name: "",
    role: "operator" as AdminRole,
    password: "",
  });
  const [passwordByUser, setPasswordByUser] = useState<Record<string, string>>({});
  const accountReady = createForm.account.trim().length > 0;
  const passwordReady = createForm.password.length >= 8;
  const canCreateUser = accountReady && passwordReady;
  const createHint = !accountReady
    ? "请先填写账号。"
    : !passwordReady
      ? `初始密码至少 8 位，当前 ${createForm.password.length} 位。`
      : "";
  const createButtonLabel = !accountReady ? "填写账号后创建" : !passwordReady ? "密码至少 8 位" : "创建";

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/mianba/auth/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "账号列表加载失败");
      setUsers(data.users || []);
      setUsersMessage("");
    } catch (error) {
      setUsersMessage((error as Error).message);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/growth/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setSettingsForm({
            report_lite_price: data.settings.report_lite_price ?? "199",
            report_deep_price: data.settings.report_deep_price ?? "6999",
          });
        }
      })
      .catch(() => setSettingsMessage("价格设置加载失败，请刷新重试。"));
    loadUsers();
  }, [loadUsers]);

  async function saveSettings() {
    setSettingsLoading(true);
    setSettingsMessage("保存价格中...");
    try {
      const res = await fetch("/api/growth/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "保存价格失败");
      setSettingsForm({
        report_lite_price: data.settings.report_lite_price ?? settingsForm.report_lite_price,
        report_deep_price: data.settings.report_deep_price ?? settingsForm.report_deep_price,
      });
      setSettingsMessage("价格已保存。");
    } catch (error) {
      setSettingsMessage((error as Error).message);
    } finally {
      setSettingsLoading(false);
    }
  }

  async function createUser() {
    setUsersMessage("创建账号中...");
    try {
      const res = await fetch("/api/mianba/auth/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "创建账号失败");
      setUsers((current) => [...current, data.user]);
      setCreateForm({ account: "", display_name: "", role: "operator", password: "" });
      setUsersMessage("账号已创建。");
    } catch (error) {
      setUsersMessage((error as Error).message);
    }
  }

  async function patchUser(id: string, payload: Partial<Pick<TenantUser, "display_name" | "role" | "disabled">> & { password?: string }) {
    setUsersMessage("更新账号中...");
    try {
      const res = await fetch("/api/mianba/auth/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "更新账号失败");
      setUsers((current) => current.map((user) => (user.id === id ? data.user : user)));
      setPasswordByUser((current) => ({ ...current, [id]: "" }));
      setUsersMessage("账号已更新。");
    } catch (error) {
      setUsersMessage((error as Error).message);
    }
  }

  return (
    <main className="mianba-workspace min-h-screen px-5 py-8 text-ink-900 md:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 text-xs tracking-[0.35em] text-gold-700">管理员</div>
          <h1 className="serif text-4xl leading-tight md:text-5xl">管理员后台</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
            当前登录：{currentUserName} · {currentRoleLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba">返回首页</a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/reports">报告交付系统</a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/orders">订单后台</a>
          <MianbaLogoutButton />
        </div>
      </header>

      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm">
        <div className="mb-4 text-xs tracking-[0.25em] text-gold-700">01 · 业务设置</div>
        <h2 className="mb-2 font-semibold">报告价格</h2>
        <p className="mb-4 text-sm leading-6 text-ink-600">
          初步诊断报告（{formatPriceLabel(settingsForm.report_lite_price)}）和深度诊断报告（{formatPriceLabel(settingsForm.report_deep_price)}）。
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-ink-500">初步诊断报告价格</label>
            <input
              value={settingsForm.report_lite_price}
              onChange={(e) => setSettingsForm({ ...settingsForm, report_lite_price: e.target.value })}
              className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
              placeholder="例如：199、199 元、免费体验"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-500">深度诊断报告价格</label>
            <input
              value={settingsForm.report_deep_price}
              onChange={(e) => setSettingsForm({ ...settingsForm, report_deep_price: e.target.value })}
              className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
              placeholder="例如：6999、6999 元"
            />
          </div>
        </div>
        <button className="btn-primary mt-4" disabled={settingsLoading} onClick={saveSettings}>
          {settingsLoading ? "保存中..." : "保存价格"}
        </button>
        {settingsMessage && <p className="mt-3 text-sm text-ink-600">{settingsMessage}</p>}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-4 text-xs tracking-[0.25em] text-gold-700">02 · 账号管理</div>
            <h2 className="font-semibold">管理员与操作者</h2>
          </div>
          <button className="rounded-full bg-ink-50 px-4 py-2 text-sm text-ink-700" disabled={usersLoading} onClick={loadUsers}>
            {usersLoading ? "刷新中..." : "刷新账号"}
          </button>
        </div>

        <div className="mb-5 grid gap-3 rounded-2xl bg-ink-50 p-4 md:grid-cols-[1fr_1fr_10rem_1fr_auto]">
          <input
            value={createForm.account}
            onChange={(e) => setCreateForm({ ...createForm, account: e.target.value })}
            className="rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
            placeholder="账号"
          />
          <input
            value={createForm.display_name}
            onChange={(e) => setCreateForm({ ...createForm, display_name: e.target.value })}
            className="rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
            placeholder="显示名称"
          />
          <select
            value={createForm.role}
            onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as AdminRole })}
            className="rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
          >
            <option value="operator">操作者</option>
            <option value="admin">管理员</option>
          </select>
          <input
            value={createForm.password}
            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            type="password"
            className="rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
            placeholder="初始密码，至少 8 位"
          />
          <button className="btn-primary" disabled={!canCreateUser} title={createHint || "创建账号"} onClick={createUser}>
            {createButtonLabel}
          </button>
          {createHint && <p className="text-xs leading-5 text-amber-700 md:col-span-5">{createHint}</p>}
        </div>

        {usersMessage && <p className="mb-4 rounded-2xl bg-gold-50 px-4 py-3 text-sm text-ink-700">{usersMessage}</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs text-ink-400">
              <tr>
                <th className="px-3 py-2 font-medium">账号</th>
                <th className="px-3 py-2 font-medium">名称</th>
                <th className="px-3 py-2 font-medium">角色</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">重置密码</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="bg-ink-50/70">
                  <td className="rounded-l-2xl px-3 py-3 font-mono text-xs text-ink-600">{user.account}</td>
                  <td className="px-3 py-3">
                    <input
                      value={user.display_name}
                      onChange={(e) =>
                        setUsers((current) =>
                          current.map((item) => (item.id === user.id ? { ...item, display_name: e.target.value } : item)),
                        )
                      }
                      className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => patchUser(user.id, { role: e.target.value as AdminRole })}
                      className="rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
                    >
                      <option value="operator">操作者</option>
                      <option value="admin">管理员</option>
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-ink-700 shadow-sm">
                      {user.disabled ? "已禁用" : "启用中"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <input
                        value={passwordByUser[user.id] ?? ""}
                        onChange={(e) => setPasswordByUser((current) => ({ ...current, [user.id]: e.target.value }))}
                        type="password"
                        className="w-40 rounded-xl border border-ink-100 bg-white px-3 py-2 text-xs"
                        placeholder="新密码"
                      />
                      <button
                        className="rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-sm disabled:opacity-40"
                        disabled={(passwordByUser[user.id] ?? "").length < 8}
                        onClick={() => patchUser(user.id, { password: passwordByUser[user.id] })}
                      >
                        重置
                      </button>
                    </div>
                  </td>
                  <td className="rounded-r-2xl px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-sm"
                        onClick={() => patchUser(user.id, { display_name: user.display_name })}
                      >
                        保存名称
                      </button>
                      <button
                        className="rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-sm"
                        onClick={() => patchUser(user.id, { disabled: !user.disabled })}
                      >
                        {user.disabled ? "启用" : "禁用"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

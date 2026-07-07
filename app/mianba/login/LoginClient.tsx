"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginClient({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("登录中...");
    try {
      const res = await fetch("/api/mianba/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account, password, next: nextPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "登录失败");
      router.push(data.next || "/mianba");
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mianba-workspace flex min-h-screen items-center justify-center px-5 py-12 text-ink-900">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm md:p-8">
        <div className="mb-3 text-xs tracking-[0.35em] text-gold-700">面霸君</div>
        <h1 className="serif text-4xl leading-tight">账号登录</h1>
        <p className="mt-3 text-sm leading-6 text-ink-600">管理员和操作者从这里进入工作台。</p>

        <label className="mt-6 block text-xs text-ink-500">账号</label>
        <input
          value={account}
          onChange={(event) => setAccount(event.target.value)}
          autoComplete="username"
          className="mt-2 w-full rounded-2xl border border-ink-100 bg-ink-50 px-4 py-3 text-sm outline-none focus:border-gold-300"
          placeholder="admin / operator"
        />

        <label className="mt-4 block text-xs text-ink-500">密码</label>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
          className="mt-2 w-full rounded-2xl border border-ink-100 bg-ink-50 px-4 py-3 text-sm outline-none focus:border-gold-300"
          placeholder="请输入密码"
        />

        <button className="btn-primary mt-6 w-full" disabled={loading || !account.trim() || !password}>
          {loading ? "登录中..." : "登录"}
        </button>
        {message && <p className="mt-4 rounded-2xl bg-gold-50 px-4 py-3 text-sm text-ink-700">{message}</p>}
      </form>
    </main>
  );
}

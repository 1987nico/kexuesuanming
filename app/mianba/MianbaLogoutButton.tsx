"use client";

import { useState } from "react";

export default function MianbaLogoutButton({ className = "" }: { className?: string }) {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/mianba/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/mianba/login";
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={logout}
      className={
        className ||
        "rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm transition hover:text-ink-900 disabled:opacity-50"
      }
    >
      {loading ? "退出中..." : "退出登录"}
    </button>
  );
}

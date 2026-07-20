"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        color: "#19170f",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>页面渲染出错</p>
      <p style={{ fontSize: 14, color: "#564f3c", textAlign: "center", maxWidth: 320, marginBottom: 20 }}>
        请点下面重试。系统已记录这次异常，若仍无法打开请联系管理员处理。
      </p>
      <button
        type="button"
        onClick={() => reset()}
        style={{
          padding: "12px 24px",
          borderRadius: 999,
          border: "none",
          background: "#19170f",
          color: "#f8f7f4",
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        重试
      </button>
    </div>
  );
}

"use client";

/**
 * 根级错误：必须带 html/body。全站崩溃时至少露出这几行字。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: "#f8f7f4", color: "#19170f", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ padding: 24, maxWidth: 420, margin: "48px auto" }}>
          <h1 style={{ fontSize: 20, marginBottom: 12 }}>站点遇到严重错误</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#564f3c", marginBottom: 20 }}>
            请点重试。若反复白屏，请换 4G/5G、关闭广告拦截，或换 Chrome 再访问同一链接。
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
      </body>
    </html>
  );
}

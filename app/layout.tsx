import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "科学算命 · 5 步漏斗",
  description: "把职业/事业选择做成一个漏斗：从喜欢的范围里发散，再用感性、市场、资源三层验证收敛到 3 个最终选项。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f8f7f4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        {/* 外链 CSS/JS 失败时，仍保证有底色和正文色，避免「纯白啥也没有」 */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
html,body{margin:0;min-height:100%;background:#f8f7f4;color:#19170f}
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue","Segoe UI","Microsoft YaHei",sans-serif}
            `.trim(),
          }}
        />
      </head>
      <body>
        <noscript>
          <div
            style={{
              padding: "24px",
              fontFamily: "system-ui, sans-serif",
              lineHeight: 1.6,
              color: "#19170f",
              background: "#f8f7f4",
              minHeight: "100vh",
            }}
          >
            <p style={{ marginBottom: "12px", fontWeight: 600 }}>需要启用 JavaScript</p>
            <p style={{ marginBottom: "8px", fontSize: "14px", color: "#564f3c" }}>
              本页依赖脚本才能交互。请在浏览器设置里关闭对本站的脚本拦截，或换用 Chrome / Edge 再试。
            </p>
            <p style={{ fontSize: "14px", color: "#564f3c" }}>
              快速打分直达：将地址改为 <code>/quick/xuenian-30</code>
            </p>
          </div>
        </noscript>
        <div className="mobile-frame">{children}</div>
      </body>
    </html>
  );
}

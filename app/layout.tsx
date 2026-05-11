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
      <body>
        <div className="mobile-frame">{children}</div>
      </body>
    </html>
  );
}

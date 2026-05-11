import type { ReactNode } from "react";

/**
 * quick 打分路径专用：服务器直出一段「inline 样式」提示，
 * 即使 Tailwind、主 JS chunk 挂了，用户也能看到字，而不是纯白白屏。
 */
export default function QuickLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        style={{
          maxWidth: 480,
          margin: "0 auto",
          padding: "12px 16px",
          fontSize: 13,
          lineHeight: 1.55,
          color: "#564f3c",
          background: "#efece6",
          borderBottom: "1px solid #d9d4c8",
        }}
      >
        <strong style={{ color: "#19170f" }}>若整页一直纯白/一直转圈：</strong>
        国内访问海外站点有时拉不动脚本。请试——换手机 <strong>4G/5G</strong>、关掉
        <strong> 广告拦截 </strong>
        、换 <strong>Chrome</strong> / <strong>微信内置浏览器</strong>，或稍后再开同一链接。站点托管在
        Vercel（美国），与您的电脑是否开机无关。
      </div>
      {children}
    </>
  );
}

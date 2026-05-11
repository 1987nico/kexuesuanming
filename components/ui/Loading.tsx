"use client";

/**
 * 纯 CSS 动画，不依赖 framer-motion。
 * 在脚本分包失败 / 弱网时，避免「加载组件」本身把页面拖死成白屏。
 */
export function ThinkingDots({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="thinking-dots" aria-hidden>
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </div>
      {label && <p className="text-sm text-ink-500">{label}</p>}
    </div>
  );
}

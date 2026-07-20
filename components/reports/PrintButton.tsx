"use client";

export function PrintButton({ label = "打印 / 导出 PDF" }: { label?: string }) {
  return (
    <button className="report-print-button" onClick={() => window.print()}>
      {label}
    </button>
  );
}

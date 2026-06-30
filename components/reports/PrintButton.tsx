"use client";

export function PrintButton() {
  return (
    <button className="report-print-button" onClick={() => window.print()}>
      打印 / 导出 PDF
    </button>
  );
}

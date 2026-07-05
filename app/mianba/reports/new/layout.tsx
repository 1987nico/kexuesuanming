import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "职业/事业方向测评",
  description: "完成关键问题与倾向测评，生成后续报告所需的测评底稿。",
};

export default function NewReportProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}

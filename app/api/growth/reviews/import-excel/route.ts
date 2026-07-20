import { NextResponse } from "next/server";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { parseReviewExcel, REVIEW_EXCEL_MAX_BYTES } from "@/lib/growth/reviewExcel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file_required", message: "请选择单篇笔记Excel。" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "unsupported_file", message: "仅支持小红书导出的.xlsx文件。" }, { status: 400 });
  }
  if (file.size > REVIEW_EXCEL_MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large", message: "Excel文件不能超过5MB。" }, { status: 400 });
  }
  try {
    const result = await parseReviewExcel(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ...result, file_name: file.name });
  } catch (error) {
    return NextResponse.json(
      { error: "excel_parse_failed", message: error instanceof Error ? error.message : "Excel解析失败。" },
      { status: 400 },
    );
  }
}

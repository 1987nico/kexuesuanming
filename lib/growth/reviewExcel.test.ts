import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseReviewExcel } from "./reviewExcel";

async function workbookBuffer(rows: Array<Array<string | number>>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("单篇笔记");
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("单篇笔记Excel解析", () => {
  it("识别小红书横向导出表和中文指标名", async () => {
    const buffer = await workbookBuffer([
      ["小红书单篇笔记数据"],
      ["笔记标题", "曝光量", "阅读量", "平均阅读时长", "点赞数", "收藏数", "评论数", "分享数", "主页访问量", "新增关注"],
      ["测试笔记", "1.2万", 1860, "00:01:08", 92, 71, 18, 23, 54, 9],
    ]);

    const result = await parseReviewExcel(buffer);

    expect(result.prefill).toMatchObject({
      impressions: 12_000,
      reads: 1860,
      average_view_seconds: 68,
      likes: 92,
      saves: 71,
      comments: 18,
      shares: 23,
      profile_visits: 54,
      follows: 9,
      input_source: "excel",
    });
    expect(result.header_row).toBe(2);
    expect(result.data_row).toBe(3);
    expect(result.warnings).toEqual([]);
  });

  it("支持纵向指标表，缺失字段保持未检查", async () => {
    const buffer = await workbookBuffer([
      ["曝光", 800],
      ["观看量", 120],
      ["收藏", 16],
    ]);

    const result = await parseReviewExcel(buffer);

    expect(result.prefill).toMatchObject({ impressions: 800, reads: 120, saves: 16 });
    expect(result.prefill.likes).toBeUndefined();
    expect(result.warnings[0]).toContain("点赞");
  });

  it("缺少曝光或阅读时拒绝导入", async () => {
    const buffer = await workbookBuffer([["点赞", "收藏"], [8, 12]]);
    await expect(parseReviewExcel(buffer)).rejects.toThrow("没有识别到曝光和阅读数据");
  });
});

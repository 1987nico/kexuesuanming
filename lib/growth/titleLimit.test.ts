import { describe, expect, it } from "vitest";
import { enforceTitleLimit } from "./runner";

const len = (s: string) => Array.from(s).length;

describe("enforceTitleLimit（小红书选题标题 ≤ 20 字，含标点）", () => {
  it("短标题原样返回", () => {
    const title = "中高层做内容，先写目标客户判断表";
    expect(enforceTitleLimit(title)).toBe(title);
    expect(len(enforceTitleLimit(title))).toBeLessThanOrEqual(20);
  });

  it("剥离用分隔符外挂的副标题", () => {
    expect(enforceTitleLimit("你的经验换不成钱？| 市场定价诊断")).toBe("你的经验换不成钱？");
    expect(enforceTitleLimit("经验资产化工具 ｜ 附自测清单")).toBe("经验资产化工具");
    expect(enforceTitleLimit("从公司到市场——我先改了这件事")).toBe("从公司到市场");
  });

  it("超过 20 字一律裁剪到 20 字以内", () => {
    const long = "做了10年行业高管为什么你的经验根本换不成真金白银呢";
    const out = enforceTitleLimit(long);
    expect(len(out)).toBeLessThanOrEqual(20);
  });

  it("裁剪后不以孤立标点结尾", () => {
    const long = "这是一个非常非常非常非常非常长的标题，会被裁掉";
    const out = enforceTitleLimit(long);
    expect(len(out)).toBeLessThanOrEqual(20);
    expect(/[，。、；：,;:!！?？…\-—·（(【\[《]$/u.test(out)).toBe(false);
  });

  it("标点计入字数", () => {
    const title = "一二三四五六七八九十一二三四五六七八，。";
    expect(len(title)).toBe(20);
    expect(enforceTitleLimit(title)).toBe(title);
  });
});

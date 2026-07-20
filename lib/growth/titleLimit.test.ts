import { describe, expect, it } from "vitest";
import { enforceTitleLimit, selectFreshTitle } from "./runner";

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

describe("selectFreshTitle（换一批不重复当前标题）", () => {
  const options = ["年薪百万，为何更不敢离职", "工资越高，辞职信越难写", "做到总监，反而不敢跳槽"];

  it("优先选择从未出现过的新标题", () => {
    expect(selectFreshTitle(options, {
      currentTitles: [options[0]],
      seenTitles: [options[0]],
    })).toBe(options[1]);
  });

  it("历史候选用完后仍不会重复页面当前标题", () => {
    expect(selectFreshTitle(options, {
      currentTitles: [options[2]],
      seenTitles: options,
    })).toBe(options[0]);
  });

  it("忽略标点差异识别当前重复标题", () => {
    expect(selectFreshTitle(options, {
      currentTitles: ["工资越高辞职信越难写！"],
    })).toBe(options[0]);
  });
});

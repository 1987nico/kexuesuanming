import { describe, expect, it } from "vitest";
import {
  enforceTitleLimit,
  findDuplicateTitle,
  normalizeTitleHistoryFingerprint,
  selectFreshTitle,
  titlesAreNearDuplicate,
  topicBatchDuplicateProblems,
} from "./runner";

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

  it("历史候选用完后明确返回空，不把旧标题伪装成新标题", () => {
    expect(selectFreshTitle(options, {
      currentTitles: [options[2]],
      seenTitles: options,
    })).toBeUndefined();
  });

  it("忽略标点差异识别当前重复标题", () => {
    expect(selectFreshTitle(options, {
      currentTitles: ["工资越高辞职信越难写！"],
    })).toBe(options[0]);
  });
});

describe("标题完整历史语义去重", () => {
  it("把只调整标点和语气词的标题识别为同一个", () => {
    expect(titlesAreNearDuplicate(
      "秋招缺的不是海投，是反馈",
      "秋招真正缺的不是海投，而是反馈！",
    )).toBe(true);
  });

  it("数字变化不能伪装成新标题", () => {
    expect(normalizeTitleHistoryFingerprint("高管离职前查这5项"))
      .toBe(normalizeTitleHistoryFingerprint("高管离职前查这3项"));
  });

  it("保留真正不同的选题", () => {
    expect(titlesAreNearDuplicate("留英等工签，还是赶国内秋招？", "名校毕业，海投反而更吃亏"))
      .toBe(false);
  });

  it("能返回命中的历史标题", () => {
    expect(findDuplicateTitle("秋招真正缺的不是海投，而是反馈", [
      "学历越好，秋招越怕没回音",
      "秋招缺的不是海投，是反馈",
    ])).toBe("秋招缺的不是海投，是反馈");
  });

  it("历史标题只替换后半句时仍必须拦截", () => {
    const history = "花百万留学，不敢跟爸妈说秋招没方向";
    const candidate = "花百万留学，不敢跟爸妈说投了没信";
    expect(titlesAreNearDuplicate(candidate, history)).toBe(true);
    expect(findDuplicateTitle(candidate, [history])).toBe(history);
  });

  it("历史标题换成家庭投入的同义表达时仍必须拦截", () => {
    const history = "花百万留学，不敢跟爸妈说秋招没方向";
    const candidate = "花爸妈钱留学，秋招不敢说没方向";
    expect(titlesAreNearDuplicate(candidate, history)).toBe(true);
    expect(findDuplicateTitle(candidate, [history])).toBe(history);
  });

  it("历史标题只把秋招问题换成面试结果时仍必须拦截", () => {
    const history = "花爸妈钱留学，秋招不敢说没方向";
    const candidate = "花爸妈钱留学，不敢说面试全挂";
    expect(titlesAreNearDuplicate(candidate, history)).toBe(true);
    expect(findDuplicateTitle(candidate, [history])).toBe(history);
  });

  it("父母压力母题换成另一种坏消息后仍必须拦截", () => {
    const history = "花爸妈钱留学，不敢说面试全挂";
    const candidate = {
      method_id: "human_pain",
      method_group: "native",
      title: "爸妈以为我稳，其实秋招全乱投",
      title_promise: "讲清父母压力下的留学生秋招困境",
      origin_force: "秋招现场",
      conflict_judgement: "父母认知与真实求职状态的落差",
    } as any;
    expect(topicBatchDuplicateProblems(
      [candidate],
      [history],
      [{ method_id: "human_pain", title: history }],
      "overseas_student",
    ).length).toBeGreaterThan(0);
  });
});

describe("标题批次长期去重范围", () => {
  const topic = (method_id: "human_pain" | "contrarian", title: string) => ({
    method_id,
    title,
  }) as any;

  it("跨方法仍拦截只改标点或数字的历史标题", () => {
    expect(topicBatchDuplicateProblems(
      [topic("contrarian", "高管离职前查这3项！")],
      ["高管离职前查这5项"],
    )).toHaveLength(1);
  });

  it("跨方法的同一核心选题也必须拦截，不能换个方法继续交付换皮题", () => {
    const current = topic("human_pain", "留英等工签，还是回国赶秋招？");
    const history = "留英等工签，还是赶国内秋招？";
    expect(topicBatchDuplicateProblems([current], [history], [
      { method_id: "contrarian", title: history },
    ])).toHaveLength(1);
    expect(topicBatchDuplicateProblems([current], [history], [
      { method_id: "human_pain", title: history },
    ])).toHaveLength(1);
  });

  it("同方法旧标题删掉后半句仍不算新标题", () => {
    expect(topicBatchDuplicateProblems(
      [topic("human_pain", "留伦敦闯还是回上海稳")],
      ["留伦敦闯还是回上海稳，两头难选"],
      [{ method_id: "human_pain", title: "留伦敦闯还是回上海稳，两头难选" }],
    )).toHaveLength(1);
  });
});

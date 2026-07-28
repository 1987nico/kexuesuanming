import { describe, expect, it } from "vitest";
import { buildTopicDiversitySignature, topicBatchDuplicateProblems } from "./runner";
import type { GrowthBusinessLine, TitleMethodId, TopicCandidate } from "./types";

function topic(
  method_id: TitleMethodId,
  title: string,
  title_promise: string,
  businessLine: GrowthBusinessLine,
): TopicCandidate {
  const overseas = businessLine === "overseas_student";
  return {
    id: `${method_id}-${title}`,
    method_group: "native",
    method_id,
    method_label: method_id,
    generation_mode: "default",
    title,
    title_promise,
    target_user: overseas ? "准备秋招的留学生及家长" : "正在转型的中高管",
    pain: overseas ? "秋招方向和节奏混乱" : "离开平台后不知道下一步",
    hook: title,
    origin_force: overseas ? "网申、面试和家庭沟通" : "离职交接、求职和家庭压力",
    conflict_judgement: overseas ? "留英与回国节奏冲突" : "职位与市场价值冲突",
    follow_reason: "持续获得判断",
    test_variable: "标题入口",
    expected_signal: "有效咨询",
    repeatable_angle: "复测",
    broad_traffic_risk: 4,
    priority: "A",
  };
}

describe("50次用户换批多样性回归", () => {
  it("25次实质重复全部拦截，25次真实新标题全部放行", () => {
    let blocked = 0;
    let passed = 0;

    for (let index = 0; index < 50; index += 1) {
      const businessLine: GrowthBusinessLine = index % 4 < 2
        ? "executive"
        : "overseas_student";
      const methodId: TitleMethodId = index % 3 === 0
        ? "human_pain"
        : index % 3 === 1
          ? "contrarian"
          : "nostalgia";
      const overseas = businessLine === "overseas_student";
      const repeating = index % 2 === 0;
      const previous = topic(
        methodId,
        overseas ? "秋招缺的不是海投，是反馈" : "中高管缺的不是机会，是判断",
        overseas ? "讲清盲目海投为什么没有回复" : "讲清离开平台后如何判断职业价值",
        businessLine,
      );
      const current = repeating
        ? topic(
          methodId,
          overseas ? "秋招真正缺的不是海投，而是反馈！" : "中高管真正缺的不是机会，而是判断！",
          overseas ? "讲清盲目海投为什么没有回复" : "讲清离开平台后如何判断职业价值",
          businessLine,
        )
        : topic(
          methodId,
          overseas
            ? `第${index + 1}次网申截止前，我先重排三类岗位`
            : `第${index + 1}次现金流只够半年，我先暂停创业`,
          overseas ? "讲清秋招窗口期如何重新安排投递顺序" : "讲清家庭现金流如何改变创业决定",
          businessLine,
        );
      const historySignature = buildTopicDiversitySignature(previous, businessLine);
      const problems = topicBatchDuplicateProblems([current], [], [{
        method_id: methodId,
        title: previous.title,
        ...historySignature,
        batch_index: repeating ? 0 : 6,
      }], businessLine);

      if (repeating) {
        expect(problems.length, `第${index + 1}次重复操作应被拦截`).toBeGreaterThan(0);
        blocked += 1;
      } else {
        expect(problems, `第${index + 1}次新母题操作应通过`).toHaveLength(0);
        passed += 1;
      }
    }

    expect({ blocked, passed }).toEqual({ blocked: 25, passed: 25 });
  });
});

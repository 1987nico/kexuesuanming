import { describe, expect, it } from "vitest";
import {
  attemptedTitleExactProblems,
  buildGrowthTitleFingerprint,
  buildTopicDiversitySignature,
  classifyTitleSentenceFrame,
  titlePersonaProblems,
  topicBatchDuplicateProblems,
} from "./runner";
import type { GrowthAccount, TopicCandidate } from "./types";

const topic = (
  method_id: TopicCandidate["method_id"],
  title: string,
  title_promise: string,
): TopicCandidate => ({
  id: `${method_id}-${title}`,
  method_group: "native",
  method_id,
  method_label: method_id,
  generation_mode: "default",
  title,
  title_promise,
  target_user: "35岁以上正在转型的中高管",
  pain: "离开平台后不知道自己值多少钱",
  hook: title,
  origin_force: "离职交接、工牌和猎头电话",
  conflict_judgement: "平台头衔与市场定价之间存在落差",
  follow_reason: "持续获得职业决策判断",
  test_variable: "标题入口",
  expected_signal: "有效咨询",
  repeatable_angle: "复测",
  broad_traffic_risk: 4,
  priority: "A",
});

describe("标题四层多样性签名", () => {
  it("失败草稿只禁止原样重放，不封杀同一方向的修正版", () => {
    const failedDraft = "以前陪娃办学生签，现在核工签资格";
    expect(attemptedTitleExactProblems(
      topic("nostalgia", failedDraft, "讲清留学身份变化"),
      [failedDraft],
    )).not.toHaveLength(0);
    expect(attemptedTitleExactProblems(
      topic("nostalgia", "以前陪娃办学生签，现在陪娃核工签", "讲清家长陪伴场景的变化"),
      [failedDraft],
    )).toHaveLength(0);
  });

  it("识别常见句式，而不是只看标题文字", () => {
    expect(classifyTitleSentenceFrame("以前管20人，现在投简历没人理")).toBe("past_present");
    expect(classifyTitleSentenceFrame("回大厂拿年薪，还是低风险创业？")).toBe("direct_choice");
    expect(classifyTitleSentenceFrame("缺的不是机会，而是判断")).toBe("contrast_reversal");
  });

  it("保存母题、句式和素材组合，兼容现有指纹", () => {
    const account = {
      business_line: "executive",
      persona: "buyer",
    } as unknown as GrowthAccount;
    const fingerprint = buildGrowthTitleFingerprint({
      account,
      topic: topic(
        "human_pain",
        "当了10年总监，不敢算自己值多少钱",
        "讲清离开平台后的职业定价焦虑",
      ),
      generationMode: "default",
    });
    expect(fingerprint.normalized_fingerprint).toBeTruthy();
    expect(fingerprint.sentence_frame).toBe("identity_inhibition");
    expect(fingerprint.mother_topic_key).toContain("platform_pricing");
    expect(fingerprint.material_signature).toContain("executive");
    expect(fingerprint.diversity_version).toBe("v1");
  });

  it("文字不同但历史母题标签相同，不误判为重复", () => {
    const current = topic(
      "human_pain",
      "工牌交回去后，我才敢问市场价",
      "讲清离开平台后如何重新判断职业定价",
    );
    const signature = buildTopicDiversitySignature(
      topic(
        "human_pain",
        "总监头衔离开公司还值多少钱",
        "讲清离开平台后的市场定价变化",
      ),
      "executive",
    );
    const problems = topicBatchDuplicateProblems([current], [], [{
      method_id: "human_pain",
      title: "总监头衔离开公司还值多少钱",
      ...signature,
      batch_index: 1,
    }], "executive");
    expect(problems).toHaveLength(0);
  });

  it("不同母题但连续使用同一句式，不阻断新标题", () => {
    const current = topic(
      "human_pain",
      "守着百万年薪，不敢递辞呈",
      "讲清收入安全感如何阻碍离职决定",
    );
    const problems = topicBatchDuplicateProblems([current], [], [{
      method_id: "human_pain",
      title: "当着家人面，不敢说想创业",
      sentence_frame: "identity_inhibition",
      mother_topic_key: "entrepreneurship+family_pressure",
      material_signature: "executive:family:conflict",
      batch_index: 0,
    }], "executive");
    expect(problems).toHaveLength(0);
  });

  it("同一原生方法在近五批不能复用同一母题和素材组合", () => {
    const current = topic(
      "human_pain",
      "总监辞呈递了，才知市场价不是年薪",
      "讲清离开平台后重新判断职业定价的方法",
    );
    const signature = buildTopicDiversitySignature(current, "executive");
    const problems = topicBatchDuplicateProblems([current], [], [{
      method_id: "human_pain",
      title: "历史中不同措辞的离职定价标题",
      ...signature,
      batch_index: 4,
    }], "executive");

    expect(problems.some((item) => item.includes("近5批同方法标题"))).toBe(true);
  });

  it("超过五批的同方法素材不会仅凭粗粒度签名被误伤", () => {
    const current = topic(
      "human_pain",
      "总监辞呈递了，才知市场价不是年薪",
      "讲清离开平台后重新判断职业定价的方法",
    );
    const signature = buildTopicDiversitySignature(current, "executive");
    const problems = topicBatchDuplicateProblems([current], [], [{
      method_id: "human_pain",
      title: "六批前的旧标题",
      ...signature,
      batch_index: 5,
    }], "executive");

    expect(problems).toHaveLength(0);
  });

  it("同一批次不接受相同母题和素材组合", () => {
    const first = topic(
      "human_pain",
      "总监离职后，猎头只肯砍价",
      "讲清离开平台后的职业定价变化",
    );
    const second = topic(
      "contrarian",
      "总监职位越高，离职后越难报价",
      "讲清离开平台后的职业定价变化",
    );
    const firstSignature = buildTopicDiversitySignature(first, "executive");
    const secondSignature = buildTopicDiversitySignature(second, "executive");
    expect(firstSignature.mother_topic_key).toBe(secondSignature.mother_topic_key);
    expect(firstSignature.material_signature).toBe(secondSignature.material_signature);
    const problems = topicBatchDuplicateProblems([first, second], [], [], "executive");
    expect(problems.some((item) => item.includes("同一母题和素材组合"))).toBe(true);
  });

  it("同一批次不重复使用岗位方向错位这一核心冲突", () => {
    const first = topic(
      "human_pain",
      "花家里钱留学，投错岗不敢说",
      "讲清留学生选岗错位带来的焦虑",
    );
    const second = topic(
      "contrarian",
      "内推不是捷径，投错岗白搭",
      "讲清选岗错位为什么会让内推失效",
    );
    const problems = topicBatchDuplicateProblems([first, second], [], [], "overseas_student");
    expect(problems.some((item) => item.includes("岗位方向错位冲突"))).toBe(true);
  });

  it("留学生家长账号的标题必须在标题本身写出亲子关系", () => {
    const parentAccount = {
      business_line: "overseas_student",
      persona: "buyer",
      one_liner: "陪娃闯秋招的留学生家长真实记录",
      target_user: "准备秋招的留学生与家长",
      persona_specific: { identity: "陪孩子准备秋招的家长" },
    } as unknown as GrowthAccount;
    const candidate = topic(
      "human_pain",
      "先补实习，还是直接投递？",
      "讲清留学生秋招焦虑",
    );
    const problems = titlePersonaProblems(candidate, parentAccount);
    expect(problems.some((item) => item.includes("显式体现亲子关系"))).toBe(true);

    const parentCandidate = topic(
      "human_pain",
      "孩子秋招没回音，我反而不敢问",
      "讲清留学生秋招焦虑",
    );
    expect(titlePersonaProblems(parentCandidate, parentAccount)).toHaveLength(0);
  });
});

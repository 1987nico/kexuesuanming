import type { ContentType, GrowthDirection, GrowthPersona } from "./types";

const PERSONA_GUIDE: Record<GrowthPersona, string> = {
  merchant:
    "视角：商家。账号是要卖产品/服务的经营者，内容要建立专业信任并把关注者转成客户，突出交付力、案例和转化。",
  buyer:
    "视角：买家/消费者决策者。账号帮读者做购买/选择决策，内容要客观、避坑、可对比，突出第三方视角和实测。",
  expert:
    "视角：专家/从业者。账号靠专业判断建立个人品牌，内容要有方法论密度和行业洞察，突出判断力与体系。",
};

export function personaGuide(persona: GrowthPersona) {
  return PERSONA_GUIDE[persona];
}

export interface AccountContext {
  toneStyle?: string;
  filterWords?: string[];
  avoidExpressions?: string[];
  contentDirections?: string[];
  personaSpecific?: Record<string, string>;
}

export function accountContextBlock(ctx?: AccountContext) {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.toneStyle) lines.push(`语气与风格：${ctx.toneStyle}`);
  if (ctx.contentDirections?.length) lines.push(`内容方向：${ctx.contentDirections.join(" / ")}`);
  if (ctx.filterWords?.length) lines.push(`必须出现的筛选词：${ctx.filterWords.join("、")}`);
  if (ctx.avoidExpressions?.length) lines.push(`要避免的表达：${ctx.avoidExpressions.join("、")}`);
  const specific = Object.entries(ctx.personaSpecific ?? {}).filter(([, v]) => v && v.trim());
  if (specific.length) lines.push(`视角专属信息：${specific.map(([k, v]) => `${k}=${v}`).join("；")}`);
  return lines.length ? `账号定位补充：\n${lines.join("\n")}` : "";
}

export const GROWTH_SYSTEM_PROMPT = `
你是「小红书内容工厂 V3：30 天起号实验版」。

总目标：30 天内跑出一个可持续、可复制、能吸引目标用户的小红书内容方向。
成功标准不是单篇爆款，而是：账号定位更清楚、内容方向有证据、标题/封面/正文有可复用模板、复盘能反哺下一篇。

四个角色：
1. 总经理 V3：定位和实验总负责人，负责账号定位卡、阶段判断、实验假设、选题审核、终审和下一步决策。
2. 选题官 V3：选题实验设计师，围绕 3 个内容方向产出可比较、可复盘、可延展的候选题。
3. 主笔 V3：模板化内容写作者，把最终选题写成可发布、可比较、可复盘的小红书笔记。
4. 复盘官 V3：方向裁判，读取真实数据，判断方向、入口、承接、人群和模板是否成立。

默认账号方向：
帮助中高层、合伙人、创业者、准创业者和成熟职场人，把经验、判断、案例和能力，从公司位置转成市场上可被信任、可被定价的资产。

三类内容方向：
A 目标客户痛点诊断：验证目标用户是否认同账号判断。
B 可收藏工具/清单：验证收藏、主页访问和长期资产价值。
C 创始人故事/过程记录：验证信任锚点和人设承接。

硬约束：
- 每篇只验证一个核心变量。
- 发布端文字 = 标题 + 正文 + 话题标签，总字数不得超过 1000 字。
- 不做小红书自动发布，只生成可复制发布包。
- 不承诺收益，不写玄学，不泄露客户隐私，不用泛焦虑换阅读。
- 没有真实数据时必须标注不可见，不得编造。
`.trim();

export function buildAccountPlanUserPrompt(input: {
  accountName: string;
  persona?: GrowthPersona;
  targetUser?: string;
  coreProblem?: string;
  trustSource?: string;
}) {
  return `
请以总经理 V3 身份，为这个账号生成账号定位卡和 30 天实验计划。

${input.persona ? personaGuide(input.persona) : ""}
账号名称：${input.accountName}
目标用户线索：${input.targetUser || "使用默认账号方向"}
核心问题线索：${input.coreProblem || "使用默认账号方向"}
信任来源线索：${input.trustSource || "使用默认账号方向"}

输出 JSON，字段：
{
  "account": {
    "one_liner": "一句话定位（10-20 字，可当简介）",
    "target_user": "目标用户（写清身份+场景）",
    "core_problem": "目标用户最痛的问题/在为什么付代价",
    "account_value": "账号持续提供什么价值",
    "follow_reason": "用户为什么要长期关注",
    "trust_source": "创始人凭什么讲",
    "not_doing": "账号不做什么",
    "content_directions": ["方向A 痛点诊断一句话", "方向B 工具清单一句话", "方向C 故事过程一句话"],
    "tone_style": "语气与风格（如克制、有判断、不鸡汤）",
    "filter_words": ["必须出现的筛选词1", "筛选词2"],
    "avoid_expressions": ["要避免的表达1", "表达2"],
    "hypotheses": ["30 天待验证假设 1", "假设 2", "假设 3"]
  },
  "plan": {
    "title": "30 天起号实验计划",
    "weeks": [
      {"week": 1, "theme": "定位基线", "goal": "...", "content_mix": "...", "decision_rule": "..."},
      {"week": 2, "theme": "方向二测", "goal": "...", "content_mix": "...", "decision_rule": "..."},
      {"week": 3, "theme": "模板沉淀", "goal": "...", "content_mix": "...", "decision_rule": "..."},
      {"week": 4, "theme": "放大决策", "goal": "...", "content_mix": "...", "decision_rule": "..."}
    ]
  }
}
`.trim();
}

export function buildTopicPoolUserPrompt(input: {
  week: number;
  targetUser: string;
  coreProblem: string;
  recentSignals?: string;
  persona?: GrowthPersona;
  count?: number;
  excludeTitles?: string[];
  context?: AccountContext;
}) {
  const count = input.count ?? 15;
  const exclude = (input.excludeTitles ?? []).filter(Boolean);
  return `
请以选题官 V3 身份，围绕账号当前阶段生成候选题池。

${input.persona ? personaGuide(input.persona) : ""}
${accountContextBlock(input.context)}
当前第 ${input.week} 周。
目标用户：${input.targetUser}
核心问题：${input.coreProblem}
最近复盘信号：${input.recentSignals || "暂无真实数据，不得编造，用当前阶段目标继续生产。"}

要求：
- 生成 ${count} 个候选题，覆盖方向 A/B/C。
- 每个候选题必须可比较、可复盘、可延展。
- 优先进入生产的题必须满足：定位匹配度 >= 8，痛点清晰度 >= 7，关注理由 >= 7，实验价值 >= 8，泛流量风险 <= 5。
${exclude.length ? `- 严禁与以下已生成选题重复或近似：${exclude.join(" / ")}` : ""}

输出 JSON：
{
  "objective": "本轮目标",
  "experiment_hypothesis": "本轮实验假设",
  "topics": [
    {
      "direction": "A|B|C",
      "title": "题目",
      "target_user": "目标用户",
      "pain": "用户痛点",
      "content_type": "diagnostic|tool|story",
      "hook": "标题钩子",
      "follow_reason": "关注理由",
      "test_variable": "验证变量",
      "expected_signal": "预期有效信号",
      "repeatable_angle": "可复制方向",
      "broad_traffic_risk": 1,
      "priority": "S|A|B|C",
      "scores": {
        "positioning": 8,
        "pain_clarity": 8,
        "entry_strength": 8,
        "follow_reason": 8,
        "experiment_value": 8,
        "repeatability": 8
      }
    }
  ]
}
`.trim();
}

export function buildDraftUserPrompt(input: {
  targetUser: string;
  trustSource: string;
  direction: GrowthDirection;
  contentType: ContentType;
  title: string;
  testVariable: string;
  expectedSignal: string;
  followReason: string;
  persona?: GrowthPersona;
  variantHint?: string;
  excludeBodies?: string[];
  context?: AccountContext;
}) {
  const exclude = (input.excludeBodies ?? []).filter(Boolean);
  return `
请以主笔 V3 身份，把最终选题写成可直接发布的小红书发布包。

${input.persona ? personaGuide(input.persona) : ""}
${accountContextBlock(input.context)}
目标用户：${input.targetUser}
信任来源：${input.trustSource}
方向：${input.direction}
内容类型：${input.contentType}
最终选题：${input.title}
本篇验证变量：${input.testVariable}
预期有效信号：${input.expectedSignal}
关注理由：${input.followReason}
${input.variantHint ? `本次写作角度：${input.variantHint}` : ""}
${exclude.length ? `严禁与以下已生成正文重复或近似（可换结构、开头、案例）：\n${exclude.map((b) => b.slice(0, 120)).join("\n---\n")}` : ""}

写作要求：
- 诊断型：直接点出处境，给反常识判断，列 3-5 个诊断信号。
- 工具型：给表格、问题组、清单或步骤，用户能照着用。
- 故事型：真实过程服务读者判断，不自嗨。
- 发布端文字（标题+正文+话题标签）不得超过 1000 字。
- 给 5 个以内话题标签。

输出 JSON：
{
  "title": "最终标题",
  "alternative_titles": ["备选 1", "备选 2", "备选 3"],
  "target_user": "本篇写给谁",
  "cover_text": "封面句",
  "body": "正文",
  "hashtags": ["#标签1", "#标签2"],
  "comment_prompt": "评论区引导",
  "follow_reason": "本篇关注理由",
  "trust_anchor": "本篇信任锚点",
  "review_points": ["发布后观察点 1", "观察点 2"],
  "cover_suggestion": "首图/封面建议"
}
`.trim();
}

export function buildReviewUserPrompt(input: {
  title: string;
  direction: GrowthDirection;
  contentType: ContentType;
  testVariable: string;
  metrics: Record<string, unknown>;
}) {
  return `
请以复盘官 V3 身份，基于真实数据做日复盘。不可见字段写不可见，不得编造。

标题：${input.title}
方向：${input.direction}
内容类型：${input.contentType}
验证变量：${input.testVariable}
真实数据 JSON：${JSON.stringify(input.metrics)}

输出 JSON：
{
  "classification": "scale|retest|weak_entry|weak_conversion|wrong_audience|pause",
  "entry_judgement": "入口判断",
  "value_judgement": "价值判断",
  "follow_judgement": "关注判断",
  "audience_judgement": "人群判断",
  "next_variable": "下一篇只改一个变量",
  "manager_instruction": "给总经理 V3 的判断",
  "topic_instruction": "给选题官 V3 的要求",
  "writer_instruction": "给主笔 V3 的要求"
}
`.trim();
}

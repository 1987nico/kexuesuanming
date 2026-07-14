import type { ContentType, GrowthDirection, GrowthPersona } from "./types";
import { PERSONA_SPECIFIC_FIELDS } from "./types";
import {
  BUYER_C_DISCLOSURE,
  BUYER_C_WEEKLY_FOCUS,
  isBuyerCWeeklyFocusActive,
} from "./buyerCStrategy";

const PERSONA_GUIDE: Record<GrowthPersona, string> = {
  merchant:
    "视角：商家。账号是要卖产品/服务的经营者，内容要建立专业信任并把关注者转成客户，突出交付力、案例和转化。",
  buyer: `视角：真实亲历者/素人（目标人群里的一个真人，不是测评号，不是专家）。
这个账号本身没有清晰的商业定位，看起来就是一个正在经历职场/创业/副业困惑的普通人，在小红书上真实记录自己的处境、求助、成长和转折。真实感是第一竞争力。
核心原则——话题散乱、身份一致：
- 话题可以到处跳（求职、跳槽、被裁、裸辞、副业、创业、迷茫、和家里的分歧都能聊），不用垂直。
- 但必须是「同一个真人」：同一种口吻、同一段正在进行的人生（例如「34 岁被裁的前中层，正在找下一步方向」），有连续的成长弧线，会更新自己的近况和进展。散的是话题，连贯的是这个人。
本视角下 A/B/C 三方向重新理解为：
- A 求助/示弱/情绪帖：真实抛出自己的困惑和处境，或记录当下的情绪（emo、被 PUA、纠结要不要辞），目的是形成真实讨论和共鸣，不设计评论任务。
- B 成长/顿悟/复盘帖：分享自己最近想明白的一件事、踩过的坑、做过的小尝试，软性输出、建立信任。
- C 留学生家长Offer转折帖：用留学生家长第一人称，写孩子求职阶段变化、招聘现场和Offer结果对照；这是唯一允许产品自然出场的方向，可自然写「后来找专业的人带」，但绝不硬广、不报价，也不得用评论关键词、私信、点赞、收藏或关注换取资料、样例、报告、链接或福利。真实案例只使用定位卡中的案例素材；情景演绎允许虚构公司、Offer和现场，但必须保留公开标识，不能伪装成真实证明。
配比：A/B 类蓄势帖占绝大多数，C 类桥接帖占少数（约 9:1），不要每篇都想转化。
写作口吻：第一人称、像真人发牢骚/记录，可以不完美、口语化，绝不端着、不像品牌号、不输出方法论密度（那是专家视角的活）。`,
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
  notDoing?: string;
  complianceRedline?: string;
  privateDomain?: string;
}

export function accountContextBlock(ctx?: AccountContext) {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.toneStyle) lines.push(`语气与风格：${ctx.toneStyle}`);
  if (ctx.contentDirections?.length) lines.push(`内容方向：${ctx.contentDirections.join(" / ")}`);
  if (ctx.filterWords?.length) lines.push(`必须出现的筛选词：${ctx.filterWords.join("、")}`);
  if (ctx.avoidExpressions?.length) lines.push(`要避免的表达：${ctx.avoidExpressions.join("、")}`);
  if (ctx.notDoing) lines.push(`账号不做什么（必须遵守，不要碰这些内容/表达）：${ctx.notDoing}`);
  if (ctx.complianceRedline) lines.push(`合规红线（绝对不能触碰）：${ctx.complianceRedline}`);
  const specific = Object.entries(ctx.personaSpecific ?? {}).filter(([, v]) => v && v.trim());
  if (specific.length) lines.push(`视角专属信息：${specific.map(([k, v]) => `${k}=${v}`).join("；")}`);
  return lines.length ? `账号定位补充：\n${lines.join("\n")}` : "";
}

// 面霸君业务事实表：三个视角的账号本质都是「面霸君」在运营，回答定位/三问时以此为准，不要凭空编造别的身份。
// 报告价格由业务设置传入（面霸君可在界面里改），不写死。
export interface ReportPrices {
  lite: string; // 初步诊断报告价格
  deep: string; // 深度诊断报告价格
}

export function mianbaBusiness(prices: ReportPrices) {
  return `
【运营主体：面霸君（本账号就是面霸君在运营，一切定位/身份/三问都以面霸君真实业务为准）】
- 卖什么（品类）：职业/职场「方向决策」测评报告与咨询。不是性格测试、不是测评工具、不是简历/面试培训。
- 产品档位：初步诊断报告（方向体检，${prices.lite}）、深度诊断报告（深度决策报告，${prices.deep}）；深度诊断报告含完整六步决策全流程。
- 方法底座：252 题站内测评（PrinciplesYou 真实同步 + 本地引擎兜底）+ 六步决策漏斗——①价值观喜欢区 ②发散 30 个方向 ③感性打分(0-10,砍到≥7) ④市场分析(PEST+波特五力) ⑤VRIN+决策矩阵收口 Top3 ⑥失败验尸(先想清楚怎么输)+90 天行动。
- 目标人群：中高管 / 职业事业换挡人群——35 岁转型、体制内想出来、裸辞、想创业但怕风险、担心「离开平台价值不可迁移」的人。
- 核心差异（对顾客有意义 + 竞争性）：市面测评(MBTI/PrinciplesYou)只给你一份"你是什么样的人"的结果；面霸君把个人画像+感性反应+市场机会+个人胜算+失败风险放进一套决策系统，直接给出"下一步该往哪走、怎么验证、怎么止损"，且 AI 生成 + 真人把关。
- 信任状（何以见得）：六步方法论体系；真实交付样例可看（匿名版）；PrinciplesYou 权威测评底座；失败验尸的独特冲击力；一次性付费、可看交付样例再决定。
- 红线：不承诺确定性收益；不用玄学话术描述效果，效果必须落到"决策方法"；客户信息 100% 匿名。
`.trim();
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
- 互动合规：不得要求点赞、收藏、关注、评论、转发、互关、互赞；不得出现「评论区扣1/留关键词/回复口令/私信我」；不得用任何互动交换资料、样例、报告、清单、模板、链接、福利或抽奖资格。
- 资料和样例只能直接在正文/图片中提供可公开的信息，不能把互动作为获取条件。正文结尾优先给读者一个可自行执行的动作或完整结论；若提出问题，只能是与主题直接相关的自然讨论问题，不附带奖励或后续私信承诺。
- 没有真实数据时必须标注不可见，不得编造。
`.trim();

export function buildAccountPlanUserPrompt(input: {
  accountName: string;
  persona?: GrowthPersona;
  targetUser?: string;
  coreProblem?: string;
  trustSource?: string;
  reportPrices: ReportPrices;
}) {
  const persona = input.persona ?? "expert";
  const specFields = PERSONA_SPECIFIC_FIELDS[persona];
  const specJsonLines = specFields
    .map((f) => `      "${f.key}": "${f.label}（结合本视角具体写实，例如：${f.placeholder}）"`)
    .join(",\n");
  const brandTrinityGuide =
    persona === "merchant"
      ? `
【商家「品牌三问」答法（冯卫东《升级定位》）——生成 persona_specific 里 what_you_are / how_different / why_believe 时必须严格遵守】
- 你是什么 = 答「品类」：用顾客心智里已有的分类词，让人一听就知道你归哪类、能对接什么需求；不要用自创的、无法品类化的抽象概念（如「赋能平台」这类顾客听不懂的词）。
- 有何不同 = 答「定位（竞争性差异）」：必须同时满足①对顾客有意义 ②基于竞争（不是自说自话的优点罗列）。检验标准：顾客听完不会追问「那又如何」。
- 何以见得 = 答「信任状」：给能让上面差异显得可信的事实/行为，从三类里选其一或组合——①有效承诺（如不满意退款、免费试用）②顾客可自行验证（交付样例、现场/过往体验、能见度）③可信第三方证明（成功案例、典型客户、口碑、媒体报道）。不要空喊「专业靠谱」，要给具体证据。
`
      : "";
  const buyerCaseModeGuide =
    persona === "buyer"
      ? `
【买家Offer案例模式】
- persona_specific 只使用两个案例字段：case_mode 和 case_material。
- 如果输入没有明确提供真实案例，case_mode 默认填写「情景演绎」；只有用户明确选择真实案例时才填写「真实案例」。
- case_material 集中填写企业/岗位、Offer结果、孩子阶段、招聘现场和可公开细节；情景演绎时可填写虚构设定。
- case_mode=真实案例但没有素材时，case_material 留空，等待用户补充，不得自行编造。
`
      : "";
  const mianbaUsage: Record<GrowthPersona, string> = {
    merchant:
      "本视角是面霸君「明着经营」的号：定位卡和品牌三问都要直接以面霸君的身份、产品、差异、信任状来回答。",
    buyer:
      "本视角是面霸君运营的「素人真实号」：账号表面不提面霸君，只在 C 类留学生家长求职转折帖里用'后来找专业的人带，做了求职方向梳理'这种亲历方式软出场；转化桥要落到面霸君。",
    expert:
      "本视角是面霸君运营的「专家号」：靠面霸君的六步决策方法论和真实案例建立权威，方法论密度要高，最终承接到面霸君的报告/咨询。",
  };
  return `
请以总经理 V3 身份，为这个账号生成账号定位卡和 30 天实验计划。

${mianbaBusiness(input.reportPrices)}
【本视角怎么用面霸君业务】${mianbaUsage[persona]}

${personaGuide(persona)}
${brandTrinityGuide}
${buyerCaseModeGuide}
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
    "content_directions": ["方向A 一句话", "方向B 一句话", "方向C 一句话"（严格按上面本视角对 A/B/C 的定义写，不要套用其它视角的方向）],
    "tone_style": "语气与风格（如克制、有判断、不鸡汤）",
    "filter_words": ["必须出现的筛选词1", "筛选词2"],
    "avoid_expressions": ["要避免的表达1", "表达2"],
    "compliance_redline": "本账号的合规红线（如：不承诺收益、不玄学、客户匿名、不用泛焦虑换阅读，结合本视角具体写）",
    "private_domain": "自然承接边界（仅说明产品如何在主页或内容中公开、自然出现；不得设计评论口令、私信换资料、互动换样例、站外联系方式等动作）",
    "hypotheses": ["30 天待验证假设 1", "假设 2", "假设 3"],
    "persona_specific": {
${specJsonLines}
    }
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
  at?: Date;
}) {
  const count = input.count ?? 15;
  const exclude = (input.excludeTitles ?? []).filter(Boolean);
  const buyerWeeklyFocus =
    input.persona === "buyer" && isBuyerCWeeklyFocusActive(input.at)
      ? `
【${BUYER_C_WEEKLY_FOCUS.label}】
- 本批至少生成 1 个方向 C、content_type=story 的选题，并设为 priority="S"，排在第一位。
- 本周选题与测试配比按 A 25% / B 25% / C 50% 执行；每次只生成 2 个时，第一题固定为 C，另一题在 A/B 中轮换。
- 固定模式：留学生家长第一人称；老大Offer结果；老二进入新的求职阶段；招聘现场触发家长复盘；鼓励自然写「后来找专业的人带」。
- 标题优先使用「一转眼，轮到老二参加秋招了」这一阶段切换结构；封面钩子使用「老大企业上岸 / 老二首战留学生秋招」的两行对照。
- 根据定位卡 case_mode 二选一：真实案例只能使用 case_material；情景演绎允许虚构公司、Offer、岗位和现场，但标题不得冒充新闻，正文首行必须写「${BUYER_C_DISCLOSURE}」，封面必须标注「情景演绎 / 示意图」。
`
      : "";
  return `
请以选题官 V3 身份，围绕账号当前阶段生成候选题池。

${input.persona ? personaGuide(input.persona) : ""}
${accountContextBlock(input.context)}
当前第 ${input.week} 周。
目标用户：${input.targetUser}
核心问题：${input.coreProblem}
最近复盘信号：${input.recentSignals || "暂无真实数据，不得编造，用当前阶段目标继续生产。"}
${buyerWeeklyFocus}

要求：
- 生成 ${count} 个候选题，覆盖方向 A/B/C。
- 【标题硬性规则】每个 title 必须控制在 20 个字以内（含标点符号，按小红书规则），超过一律不合格；不要用「｜」「|」「——」等分隔符外挂副标题来变相加长。
- 【原力要大】标题外层必须有至少 1 个具体实在、有画面的"原力词"：目标受众生活里能看见、摸到、遇到的物件、角色、场景或动作。例：工资条、合同、老板、合伙人、客户、会议室、工位、预算表、PPT、手机消息、加班、汇报、签合同、拍板、微信对话框、面试通知、离职交接、绩效面谈。禁止只用泛虚词做标题入口，如：成长、认知、觉醒、自由、焦虑、选择、结构、位置、命运、人生、体面；这些词可以进正文解释，但不能单独承担标题入口。
- 【冲突要大】每个选题必须有反常识、反预期或强落差，让用户一眼看到"怎么会这样"的张力。冲突可以来自：想要稳定 vs 想要自由、职位很高 vs 离开平台不值钱、努力很多 vs 结果不变、想转型 vs 家庭/收入/年龄限制、以为是机会 vs 后来发现是坑。没有冲突的平铺题、纯建议题、纯清单题不进入候选池。
- 每个候选题必须可比较、可复盘、可延展。
- 优先进入生产的题必须满足：定位匹配度 >= 8，痛点清晰度 >= 7，入口强度 >= 8（入口强度必须同时看原力与冲突），关注理由 >= 7，实验价值 >= 8，泛流量风险 <= 5。
${exclude.length ? `- 严禁与以下已生成选题重复或近似：${exclude.join(" / ")}` : ""}

输出 JSON：
{
  "objective": "本轮目标",
  "experiment_hypothesis": "本轮实验假设",
  "topics": [
    {
      "direction": "A|B|C",
      "title": "题目（20 字以内，含标点）",
      "target_user": "目标用户",
      "pain": "用户痛点",
      "content_type": "diagnostic|tool|story",
      "hook": "标题钩子",
      "origin_force": "原力判断（必填，不能为空）：标题里具体有画面的物件/角色/场景/动作是什么，为什么够实在",
      "conflict_judgement": "冲突判断（必填，不能为空）：本题的反常识/反预期/强落差是什么",
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

// 买家视角专属：故事化写作规范（源自第一套工作流「主笔」Agent 的靶心人/意外人模式与画面率定义）
const BUYER_STORY_SPEC = `
【买家视角专属·故事化写作规范（本篇必须遵守）】
把正文写成"具体、实在、有画面"的第一人称真实故事，不要写成观点文、干货清单，也不要"开头讲故事、后面全是道理"。
故事模式二选一，一篇只能用一个，不许混用：
- 靶心人模式（即努力人模式）七步：目标 → 阻碍 → 努力 → 结果 → 意外 → 转弯 → 结局。适合"本来奔着一个目标去，中途撞上了更深的真相"，过程扎实、结果反转，最终认知或人生方向发生转弯。
- 意外人模式 四步：目标 → 意外 → 转弯 → 结局。适合"一个意外事件打断原本路径、人生拐了个弯"，开头快、意外狠、转弯清晰、结局有余味。
结构要藏在故事里，不要把"目标/阻碍/努力"这些步骤名当小标题写出来。必须有"转弯"；结局停在有力量的位置，有余味、不做大总结、不说教（删掉"我终于明白/人生就是/本质上"这类句子）。
【画面率 ≥ 20%（硬指标）】
画面率 =（有画面感的名词字数 + 有动作感的动词字数）÷ 正文字数，本篇正文画面率必须 ≥ 20%。
多用有画面感的名词（门、桌子、会议室、电脑、微信对话框、合同、烟、地铁、手、眼神、脸……）和有动作感的动词，用具体场景和动作把情绪"演"出来，而不是直接下结论。
必须在输出 JSON 里如实填写 story_mode（「靶心人模式」或「意外人模式」二选一）和 pictorial_rate（预估画面率，如「26%」，必须≥20%）。
`.trim();

const BUYER_C_OFFER_STRATEGY_SPEC = `
【买家 C 类专属·留学生家长Offer现场策略】
本篇是「留学生家长＋企业Offer＋招聘现场＋两个孩子阶段对照」的故事，不是老师口吻、顾问口吻或机构案例复盘。

案例模式硬门槛：
- case_mode=真实案例：企业、岗位、Offer/终面结果、孩子阶段和招聘现场，只能使用账号定位卡 case_material 中的内容；不得补写、推测或用相似公司替代。
- case_mode=情景演绎：允许虚构公司、Offer、岗位、横幅和招聘现场；正文首行必须原样写「${BUYER_C_DISCLOSURE}」，封面必须显著标注「情景演绎 / 示意图」。虚构企业不得使用真实公司名称或近似Logo，虚构Offer/邀请函不得仿制真实文件、编号、印章或邮箱，不能作为效果证明。
- 无论哪种模式，都不得虚构真实企业与学校的合作关系，不得暴露个人敏感信息。

固定叙事顺序：
1. 家长在真实招聘现场看到老二进入会场，触发感慨；
2. 简短交代老大已经拿到Offer的结果，建立经验背书；
3. 老二第一次进入同类求职阶段，形成两个孩子的阶段对照；
4. 家长复盘 2-3 个具体认知，专业判断藏在经历里，不写成顾问授课；
5. 服务只作为故事中的自然转折出现，鼓励使用「后来找专业的人带」，不要写成硬广；
6. 用孩子走出会场后的一个动作或一句话收尾，不做评论、私信、资料领取或销售引导。

封面结构：招聘入口＋企业招聘横幅＋成年孩子背影＋场景凭证＋「老大结果 / 老二新阶段」两行对照。真实模式使用已授权素材；情景演绎模式使用虚构企业和示意凭证并加醒目标识，不得仿制真实Offer或暴露个人敏感信息。
`.trim();

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
  learningGuidance?: string;
  excludeBodies?: string[];
  context?: AccountContext;
}) {
  const exclude = (input.excludeBodies ?? []).filter(Boolean);
  return `
请以主笔 V3 身份，把最终选题写成可直接发布的小红书发布包。

${input.persona ? personaGuide(input.persona) : ""}
${accountContextBlock(input.context)}
${input.context?.privateDomain ? `业务承接背景（仅用于理解业务，不得照搬互动话术，不得引导评论/私信换资料）：${input.context.privateDomain}` : ""}
目标用户：${input.targetUser}
信任来源：${input.trustSource}
方向：${input.direction}
内容类型：${input.contentType}
最终选题：${input.title}
本篇验证变量：${input.testVariable}
预期有效信号：${input.expectedSignal}
关注理由：${input.followReason}
${input.learningGuidance ? `复盘学习依据（必须执行，但不能在成文中提及）：\n${input.learningGuidance}` : ""}
${input.variantHint ? `本次写作角度：${input.variantHint}` : ""}
${exclude.length ? `严禁与以下已生成正文重复或近似（可换结构、开头、案例）：\n${exclude.map((b) => b.slice(0, 120)).join("\n---\n")}` : ""}

写作要求：
- 诊断型：直接点出处境，给反常识判断，列 3-5 个诊断信号。
- 工具型：给表格、问题组、清单或步骤，用户能照着用。
- 故事型：真实过程服务读者判断，不自嗨。
- 【标题硬性规则】title 与每个 alternative_titles 都必须控制在 20 个字以内（含标点符号，按小红书规则），不要用「｜」「|」「——」外挂副标题。
- 发布端文字（标题+正文+话题标签）不得超过 1000 字。
- 给 5 个以内话题标签。
- 本篇只能改变「${input.testVariable}」这一个主要实验变量。周复盘确定方向，单篇复盘决定标题、开头、结构、证据或结尾怎么写；不得同时大改多个维度。
- 【互动合规硬规则】正文、标题、封面和 comment_prompt 都不得要求点赞、收藏、关注、评论、转发、互关或互赞；不得出现「评论区扣1」「留言关键词」「回复口令」「私信我」「加微信」等动作。
- 【禁止利益交换】不得用资料、匿名样例、报告、清单、模板、链接、福利、抽奖、诊断或体检作为互动奖励。像「需要职业方向体检的评论区扣1，我发你匿名交付样例」这种表达一律禁止。
- 结尾优先给出一个读者当下就能完成的自查动作或判断标准。可以提出与正文直接相关的自然问题，但不能承诺根据评论发送任何东西。
${input.persona === "buyer" ? `\n${BUYER_STORY_SPEC}\n` : ""}
${input.persona === "buyer" && input.direction === "C" ? `\n${BUYER_C_OFFER_STRATEGY_SPEC}\n` : ""}
输出 JSON：
{
  "title": "最终标题",
  "alternative_titles": ["备选 1", "备选 2", "备选 3"],
  "target_user": "本篇写给谁",
  "cover_text": "封面句",
  "body": "正文",
  "hashtags": ["#标签1", "#标签2"],
  "comment_prompt": "自然讨论问题（只问主题本身，不要求互动，不与资料/福利/私信挂钩）",
  "follow_reason": "本篇关注理由",
  "trust_anchor": "本篇信任锚点",
  "review_points": ["发布后观察点 1", "观察点 2"],
  "cover_suggestion": "首图/封面建议",
  "story_mode": "仅买家视角必填：本篇所用故事模式，只能是「靶心人模式」或「意外人模式」；其它视角留空字符串",
  "pictorial_rate": "仅买家视角必填：本篇预估画面率百分比字符串，如「26%」，必须≥20%；其它视角留空字符串"
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
请以复盘官 V4 身份，基于发布24小时后的真实数据做单篇复盘。不可见字段写不可见，不得编造。
单篇复盘只判断标题入口、正文执行和商业承接，不得凭一篇笔记决定放大或暂停整个方向。

标题：${input.title}
方向：${input.direction}
内容类型：${input.contentType}
验证变量：${input.testVariable}
真实数据 JSON：${JSON.stringify(input.metrics)}

输出 JSON：
{
  "classification": "scale|retest|weak_entry|weak_conversion|wrong_audience|pause",
  "title_pattern": "标题属于身份/痛点/结果/反常识/数字/提问/故事中的哪种结构，可多选",
  "primary_audience": "标题明确写给谁",
  "primary_keyword": "标题核心搜索词，没有则写无",
  "entry_judgement": "标题+封面入口判断，并说明标题承诺是否被正文兑现",
  "body_judgement": "开头速度、正文结构、信息密度、案例证据和观看/收藏/分享表现",
  "conversion_judgement": "涨粉、有效咨询和目标客户承接判断",
  "compliance_judgement": "标题、正文和结尾的合规判断",
  "value_judgement": "兼容旧字段：正文价值判断",
  "follow_judgement": "兼容旧字段：关注与咨询判断",
  "audience_judgement": "人群判断",
  "next_variable": "下一篇只改一个变量",
  "experiment_variable": "title_cover|opening|audience_expression|body_structure|evidence|closing|length",
  "manager_instruction": "提供给周复盘的证据，不直接做方向决策",
  "topic_instruction": "给选题官 V4 的具体要求",
  "writer_instruction": "给主笔 V4 的具体要求"
}
`.trim();
}

export function buildStageReviewUserPrompt(input: {
  targetUser: string;
  directions?: string[];
  aggregate: unknown;
}) {
  return `
请以总经理 V4 身份，基于多篇笔记的聚合数据做「周复盘 / 方向决策」。不要基于单篇爆款下结论，要看近7天动量和近28天稳定性。

目标用户：${input.targetUser}
内容方向说明：${(input.directions ?? ["A 方向", "B 方向", "C 方向"]).join(" / ")}
各方向聚合数据 JSON（valid_count=近28天有效样本，recent_7d_count=近7天有效样本，所有rate均为中位数，action由服务器证据门槛决定，不得擅自改变）：
${JSON.stringify(input.aggregate)}

判断规则：
- 收藏率、评论率、关注反馈更能代表方向是否成立，单纯曝光/阅读不作数。
- 服务器给出的 action 是硬约束，只负责把理由说清楚。
- 0-2篇只探索；3-5篇只二测；6-9篇可增加优势方向；10篇以上且比较方向各至少3篇才可暂停。

输出 JSON：
{
  "scale_direction": "建议放大的方向及理由（数据不足就说需继续验证）",
  "pause_direction": "建议暂停或降权的方向及理由（没有就写暂无）",
  "next_focus": "下一阶段主攻什么",
  "reusable_pattern": "已跑出的可复用标题/结构模板（没有就写暂无）",
  "summary": "一段话周结论，给运营者看的大白话",
  "strategic_hypothesis": "下周只验证一个方向性假设",
  "title_patterns_to_repeat": ["应继续复用的标题入口结构"],
  "title_patterns_to_avoid": ["应停止的标题入口表达"],
  "body_patterns_to_repeat": ["应继续复用的正文结构"]
}
`.trim();
}

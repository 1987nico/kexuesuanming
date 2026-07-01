import type { ContentType, GrowthDirection, GrowthPersona } from "./types";
import { PERSONA_SPECIFIC_FIELDS } from "./types";

const PERSONA_GUIDE: Record<GrowthPersona, string> = {
  merchant:
    "视角：商家。账号是要卖产品/服务的经营者，内容要建立专业信任并把关注者转成客户，突出交付力、案例和转化。",
  buyer: `视角：真实亲历者/素人（目标人群里的一个真人，不是测评号，不是专家）。
这个账号本身没有清晰的商业定位，看起来就是一个正在经历职场/创业/副业困惑的普通人，在小红书上真实记录自己的处境、求助、成长和转折。真实感是第一竞争力。
核心原则——话题散乱、身份一致：
- 话题可以到处跳（求职、跳槽、被裁、裸辞、副业、创业、迷茫、和家里的分歧都能聊），不用垂直。
- 但必须是「同一个真人」：同一种口吻、同一段正在进行的人生（例如「34 岁被裁的前中层，正在找下一步方向」），有连续的成长弧线，会更新自己的近况和进展。散的是话题，连贯的是这个人。
本视角下 A/B/C 三方向重新理解为：
- A 求助/示弱/情绪帖：真实抛出自己的困惑和处境求过来人指路，或记录当下的情绪（emo、被 PUA、纠结要不要辞），目的是拉评论、攒共鸣。
- B 成长/顿悟/复盘帖：分享自己最近想明白的一件事、踩过的坑、做过的小尝试，软性输出、建立信任。
- C 转折/成功桥接帖：这是唯一承担转化的帖子——「我之前迷茫成 XX 样，后来做了一件事（做了个职业梳理/测评、找人帮我把方向理清楚了），现在不慌了」。产品/服务只在这里以故事的方式软出场，绝不硬广、不报价，成交引导到评论区追问和私信。
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
  lite: string; // 小报告价格
  deep: string; // 大报告价格
}

export function mianbaBusiness(prices: ReportPrices) {
  return `
【运营主体：面霸君（本账号就是面霸君在运营，一切定位/身份/三问都以面霸君真实业务为准）】
- 卖什么（品类）：职业/职场「方向决策」测评报告与咨询。不是性格测试、不是测评工具、不是简历/面试培训。
- 产品档位：小报告（方向体检，${prices.lite}）、大报告（深度决策报告，${prices.deep}）；大报告含完整六步决策全流程。
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
  const mianbaUsage: Record<GrowthPersona, string> = {
    merchant:
      "本视角是面霸君「明着经营」的号：定位卡和品牌三问都要直接以面霸君的身份、产品、差异、信任状来回答。",
    buyer:
      "本视角是面霸君运营的「素人真实号」：账号表面不提面霸君，只在 C 类转折帖里让面霸君的报告/咨询以'我后来做了个职业决策梳理/测评'这种亲历方式软出场；转化桥要落到面霸君。",
    expert:
      "本视角是面霸君运营的「专家号」：靠面霸君的六步决策方法论和真实案例建立权威，方法论密度要高，最终承接到面霸君的报告/咨询。",
  };
  return `
请以总经理 V3 身份，为这个账号生成账号定位卡和 30 天实验计划。

${mianbaBusiness(input.reportPrices)}
【本视角怎么用面霸君业务】${mianbaUsage[persona]}

${personaGuide(persona)}
${brandTrinityGuide}
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
    "private_domain": "私域承接方式（这个视角怎么把看内容的人自然承接到私域/进一步沟通，写清楚承接动作和话术方向，符合本视角调性、不硬广、不违规）",
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
${input.context?.privateDomain ? `私域承接参考（用来设计正文结尾的软钩子和 comment_prompt，把读者自然引向进一步沟通，绝不硬广、不报价）：${input.context.privateDomain}` : ""}
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
- 【标题硬性规则】title 与每个 alternative_titles 都必须控制在 20 个字以内（含标点符号，按小红书规则），不要用「｜」「|」「——」外挂副标题。
- 发布端文字（标题+正文+话题标签）不得超过 1000 字。
- 给 5 个以内话题标签。
${input.persona === "buyer" ? `\n${BUYER_STORY_SPEC}\n` : ""}
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

export function buildStageReviewUserPrompt(input: {
  targetUser: string;
  directions?: string[];
  aggregate: unknown;
}) {
  return `
请以总经理 V3 身份，基于多篇笔记的聚合数据做「阶段复盘 / 方向决策」。不要基于单篇爆款下结论，要看方向层面的趋势。

目标用户：${input.targetUser}
内容方向说明：${(input.directions ?? ["A 方向", "B 方向", "C 方向"]).join(" / ")}
各方向聚合数据 JSON（note_count=发布篇数，reviewed_count=已复盘篇数，avg_save_rate=平均收藏率，avg_comment_rate=平均评论率，classifications=各结果分类计数）：
${JSON.stringify(input.aggregate)}

判断规则：
- 收藏率、评论率、关注反馈更能代表方向是否成立，单纯曝光/阅读不作数。
- 数据太少（发布篇数少）时不要急着放大或暂停，标注需继续验证。

输出 JSON：
{
  "scale_direction": "建议放大的方向及理由（数据不足就说需继续验证）",
  "pause_direction": "建议暂停或降权的方向及理由（没有就写暂无）",
  "next_focus": "下一阶段主攻什么",
  "reusable_pattern": "已跑出的可复用标题/结构模板（没有就写暂无）",
  "summary": "一段话阶段结论，给运营者看的大白话"
}
`.trim();
}

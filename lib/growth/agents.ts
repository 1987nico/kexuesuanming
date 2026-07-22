import type {
  DraftConversionContract,
  DraftFulfillmentContract,
  DraftIdentityContract,
  GrowthBusinessLine,
  GrowthBusinessPosition,
  GrowthPersona,
  MethodGenerationMode,
  RawBodyTag,
  TitleMethodId,
  TopicSourceSnapshot,
} from "./types";
import type { TitleMethodDefinition } from "./methods";
import { PERSONA_SPECIFIC_FIELDS } from "./types";

const PERSONA_GUIDE: Record<GrowthPersona, string> = {
  merchant:
    "视角：商家。账号是要卖产品/服务的经营者，内容要建立专业信任并把关注者转成客户，突出交付力、案例和转化。",
  buyer: `视角：真实亲历者/素人（目标人群里的一个真人，不是测评号，不是专家）。
这个账号本身没有清晰的商业定位，看起来就是一个正在经历职场/创业/副业困惑的普通人，在小红书上真实记录自己的处境、求助、成长和转折。真实感是第一竞争力。
核心原则——话题散乱、身份一致：
- 话题可以到处跳（求职、跳槽、被裁、裸辞、副业、创业、迷茫、和家里的分歧都能聊），不用垂直。
- 但必须是「同一个真人」：同一种口吻、同一段正在进行的人生（例如「34 岁被裁的前中层，正在找下一步方向」），有连续的成长弧线，会更新自己的近况和进展。散的是话题，连贯的是这个人。
写作口吻：第一人称、像真人在记录，可以不完美、口语化，绝不端着、不像品牌号。正文形态不要提前规定，必须跟随标题承诺自然形成；产品只能作为真实经历自然出现，不硬广、不报价，也不得用互动换资料。`,
  expert:
    "视角：专家/从业者。账号靠专业判断建立个人品牌，内容要有方法论密度和行业洞察，突出判断力与体系。",
};

export function personaGuide(persona: GrowthPersona) {
  return PERSONA_GUIDE[persona];
}

export interface AccountContext {
  businessLine?: string;
  toneStyle?: string;
  filterWords?: string[];
  avoidExpressions?: string[];
  personaSpecific?: Record<string, string>;
  notDoing?: string;
  complianceRedline?: string;
  privateDomain?: string;
}

export interface DraftBlueprintContext {
  /** v3.4 将身份、标题兑现和转化因果先固化为合同，再由系统拼装正文。 */
  contract_version: "v3_4";
  promise_type?: "ordinary" | "counted" | "material" | "comparison";
  opening_intent?: string;
  identity_contract: DraftIdentityContract;
  fulfillment_contract: DraftFulfillmentContract;
  conversion_contract: DraftConversionContract;
  opening: string;
  core_judgement: string;
  delivery_format: "numbered" | "paragraphs";
  delivery_sections: string[];
  service_bridge: string;
  stage_result: string;
  closing: string;
}

export function accountContextBlock(ctx?: AccountContext) {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.businessLine) lines.push(`当前业务线：${ctx.businessLine}`);
  if (ctx.toneStyle) lines.push(`语气与风格：${ctx.toneStyle}`);
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

export function mianbaBusiness(prices: ReportPrices, businessLine: GrowthBusinessLine = "executive") {
  if (businessLine === "overseas_student") return `
【运营主体：面霸君｜留学生求职辅导业务】
- 卖什么（品类）：留学生回国求职方向规划与秋招陪跑。
- 服务：求职方向诊断＋目标岗位地图＋简历/面试辅导＋秋招陪跑。
- 目标人群：准备海外秋招或回国求职的留学生，以及关注孩子就业结果的家长。
- 核心差异：先把方向、岗位和招聘节奏定清楚，再进入简历、面试与投递；不是只修改一份简历。
- 信任状：专业老师陪跑流程、匿名交付案例、真实招聘节点复盘与可验证的方法清单。
- 红线：不承诺Offer或薪资结果；案例必须匿名或明确标注情景演绎；不虚构真实学校、企业或个人身份。
`.trim();
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

function businessPositionBlock(position?: GrowthBusinessPosition) {
  if (!position) return "";
  return `
【当前业务母定位｜以下内容优先于系统默认业务描述】
- 你是什么（品类）：${position.service_category}
- 主营服务：${position.main_offer}
- 目标用户：${position.target_user}
- 核心问题：${position.core_problem}
- 有何不同：${position.differentiation}
- 何以见得（信任来源）：${position.trust_source}
- 合规红线：${position.compliance_redline}
`.trim();
}

export const GROWTH_SYSTEM_PROMPT = `
你是「小红书内容工厂 V3.1：方法探索与有效咨询版」。

总目标：用可追溯的标题方法和真实数据，持续促成目标用户的有效咨询。
成功标准不是单篇爆款，也不是联系方式数量，而是：账号定位清楚、标题来源可追溯、正文兑现标题承诺、复盘能识别哪些方法与开放标签真正带来有效咨询。

四个角色：
1. 总经理 V3：定位和实验总负责人，负责账号定位卡、阶段判断、实验假设、选题审核、终审和下一步决策。
2. 选题官 V3.1：严格按当前视角可用的标题方法逐法生成，每种方法只产出一个标题。
3. 主笔 V3.1：不预设内容方向，完全跟随标题承诺写出可发布、可复盘的笔记。
4. 复盘官 V3.1：读取真实数据，判断方法、入口、正文兑现、承接和人群是否成立。

默认账号方向由当前业务线决定，不得跨业务线混用目标人群、案例、产品或承接动作。

硬约束：
- 不预设诊断型、工具型、案例型等正文方向；正文只跟随标题承诺。
- 默认方法与探索方法必须分开，禁用方法不得生成。
- 对标法和蹭流量没有7天内、人工确认可访问的原链接时不得生成。
- 每篇正文只有一个主要承接动作，目标是促成有效咨询。
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
  businessLine?: GrowthBusinessLine;
  targetUser?: string;
  coreProblem?: string;
  trustSource?: string;
  reportPrices: ReportPrices;
  businessPosition?: GrowthBusinessPosition;
}) {
  const persona = input.persona ?? "expert";
  const businessLine = input.businessLine ?? "executive";
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
      "本视角是面霸君运营的「素人真实号」：账号表面不提面霸君。只有当标题和真实经历自然需要时，才让面霸君的报告/咨询以'我后来做了个职业决策梳理/测评'这种亲历方式软出场；不能为了转化硬塞产品。",
    expert:
      "本视角是面霸君运营的「专家号」：靠面霸君的六步决策方法论和真实案例建立权威，方法论密度要高，最终承接到面霸君的报告/咨询。",
  };
  return `
请以总经理 V3 身份，为这个账号生成账号定位卡和 30 天实验计划。

${mianbaBusiness(input.reportPrices, businessLine)}
${businessPositionBlock(input.businessPosition)}
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
      {"week": 1, "theme": "方法基线", "goal": "...", "content_mix": "默认方法为主、探索方法少量验证", "decision_rule": "..."},
      {"week": 2, "theme": "方法二测", "goal": "...", "content_mix": "同一方法复测", "decision_rule": "..."},
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
  methods: TitleMethodDefinition[];
  generationMode: MethodGenerationMode;
  sources?: TopicSourceSnapshot[];
  excludeTitles?: string[];
  context?: AccountContext;
}) {
  // 历史全集由服务端做确定性去重；提示词只带最近一段，避免长期使用后挤爆上下文。
  const exclude = (input.excludeTitles ?? []).filter(Boolean).slice(-160);
  const sourceByMethod = new Map((input.sources ?? []).map((source) => [source.method_id, source]));
  const methodLines = input.methods.map((method) => {
    const source = sourceByMethod.get(method.id);
    return [
      `${method.order}. method_id=${method.id}；方法=${method.label}；要求=${method.instruction}`,
      source ? `绑定母题=${JSON.stringify(source)}` : "无外部母题要求",
    ].join("\n");
  });
  return `
请以选题官 V3.1 身份，严格按给定方法列表生成标题。

${input.persona ? personaGuide(input.persona) : ""}
${accountContextBlock(input.context)}
当前第 ${input.week} 周。
目标用户：${input.targetUser}
核心问题：${input.coreProblem}
最近复盘信号：${input.recentSignals || "暂无真实数据，不得编造，用当前阶段目标继续生产。"}

要求：
- 当前生成模式：${input.generationMode === "default" ? "默认生成" : "探索生成"}。
- 必须对下面每一种方法各生成1个标题，不得增减、合并或换方法：
${methodLines.join("\n\n")}
- 不预设正文内容方向，不输出诊断型、工具型或故事型分类。
- 【标题硬性规则】每个 title 必须控制在 20 个字以内（含标点符号，按小红书规则），超过一律不合格；不要用「｜」「|」「——」等分隔符外挂副标题来变相加长。
- 【原力要大】标题外层必须有至少 1 个具体实在、有画面的"原力词"：目标受众生活里能看见、摸到、遇到的物件、角色、场景或动作。例：工资条、合同、老板、合伙人、客户、会议室、工位、预算表、PPT、手机消息、加班、汇报、签合同、拍板、微信对话框、面试通知、离职交接、绩效面谈。禁止只用泛虚词做标题入口，如：成长、认知、觉醒、自由、焦虑、选择、结构、位置、命运、人生、体面；这些词可以进正文解释，但不能单独承担标题入口。
- 【冲突要大】每个选题必须有反常识、反预期或强落差，让用户一眼看到"怎么会这样"的张力。冲突可以来自：想要稳定 vs 想要自由、职位很高 vs 离开平台不值钱、努力很多 vs 结果不变、想转型 vs 家庭/收入/年龄限制、以为是机会 vs 后来发现是坑。没有冲突的平铺题、纯建议题、纯清单题不进入候选池。
- 每个候选题必须可比较、可复盘、可延展，并写清正文要兑现的唯一承诺。
- 每种方法同时给出 3 个彼此明显不同的标题候选：title 是首选，alternative_titles 是两个备选。备选不能只是改标点、数字或语气词，三者必须使用不同的具体场景、动作或冲突表达，但仍严格属于同一个方法。
- 凡是出现“绑定母题”的方法，必须先在内部拆解母题的句式骨架、冲突关系、人物处境、情绪钩子和结果承诺，再严格按当前method_id迁移；不能只把母题当作来源附件，然后另写一个普通原创标题。
- 蹭流量必须能从新标题中识别出所绑定热点的事件、人物或社会冲突；相同产品迁移产品表达或选择场景；相同功效迁移解决问题或降低风险的功效；相似人群迁移人群处境；终极结果相同迁移最终利益；爆款框架迁移句式与冲突结构。
- 绑定母题的标题不得调用与母题无关的通用模板。只能继承结构和逻辑，必须替换业务内容，不得照抄原标题。
${exclude.length ? `- 严禁与以下已生成选题重复或近似：${exclude.join(" / ")}` : ""}

输出 JSON：
{
  "objective": "本轮目标",
  "experiment_hypothesis": "本轮实验假设",
  "topics": [
    {
      "method_id": "必须与给定method_id完全一致",
      "title": "题目（20 字以内，含标点）",
      "alternative_titles": ["同方法备选题目1（20字以内）", "同方法备选题目2（20字以内）"],
      "title_promise": "正文必须兑现的唯一承诺",
      "source_usage": {
        "inherited_structure": "仅供本次内部校验：从绑定母题继承了什么句式或冲突结构",
        "replaced_content": "仅供本次内部校验：替换成了当前业务的哪些内容"
      }
    }
  ]
}
`.trim();
}

export function buildDraftBlueprintUserPrompt(input: {
  targetUser: string;
  trustSource: string;
  methodId: TitleMethodId;
  methodLabel: string;
  title: string;
  titlePromise: string;
  persona: GrowthPersona;
  context?: AccountContext;
  deliveryRule: string;
  ctaType: "soft_bridge" | "on_platform_consult" | "service_entry";
}) {
  return `
请先做正文架构师，不写整篇文章。根据标题、人设和标题承诺，生成一份可直接约束后续写作的正文骨架。

${personaGuide(input.persona)}
${accountContextBlock(input.context)}
目标用户：${input.targetUser}
信任来源：${input.trustSource}
标题方法：${input.methodLabel}（${input.methodId}）
最终标题：${input.title}
正文必须兑现：${input.titlePromise}
兑现结构：${input.deliveryRule}
唯一承接动作：${input.ctaType}

骨架硬规则：
1. opening 是可以直接放进正文的自然开头。必须从具体动作、现场、念头或矛盾切入，前30字回应标题人物与冲突；禁止“作为××”“身为××”“我的判断是”“先看这里”和机械复述标题。
2. identity_contract.evidence 是可以直接进入正文的身份依据段。买家写本人/家庭处境与行动；专家写具体判断或方法应用；商家写服务对象、交付动作与阶段变化。不得只写“作为某某”，也不得依赖固定关键词自证身份。
3. fulfillment_contract 必须把标题承诺拆成可检查的具体部分；delivery_sections 必须逐段交付，不得只说“我整理了一份表/清单”。
4. conversion_contract 和 service_bridge 必须共同形成完整自然因果：具体卡点→原有尝试→专业角色→介入动作→克制且可验证的阶段结果。
5. stage_result 单独摘录上一步的阶段结果。优先使用“不再、开始、收窄到、排除了、明确了、终于能”等可验证变化；不得虚构Offer、薪资、录取数量或确定性成功。
6. 买家像真实经历转折；专家像复盘一次具体判断；商家用交付动作和阶段结果证明，不自夸。
7. closing 只保留一个自然动作，不要求点赞、收藏、评论、私信或站外联系。
8. promise_type 必须按标题承诺选择：普通经历/观点为 ordinary；明确数字项为 counted；资料、清单、表格或路线图为 material；两条路径比较为 comparison。

只输出 JSON：
{
  "contract_version": "v3_4",
  "promise_type": "ordinary|counted|material|comparison",
  "opening_intent": "开头要回应的具体人物、处境和冲突",
  "identity_contract": {
    "persona": "buyer|expert|merchant",
    "expression_goal": "当前视角需要怎样自然表达",
    "required_elements": ["必须出现的身份事实1", "身份动作或判断2"],
    "evidence_basis": "来自人设、业务事实或真实方法流程的依据",
    "target_section": "identity_evidence",
    "evidence": "可直接进入正文、自然体现当前身份的完整段落"
  },
  "fulfillment_contract": {
    "promise_type": "ordinary|counted|material|comparison",
    "promised_count": 0,
    "required_sections": [{"id":"section_1","requirement":"这一段必须完成什么","minimum_content":["最少包含的内容"]}]
  },
  "conversion_contract": {
    "problem_context": "当事人的具体卡点",
    "attempted_action": "原来试过什么",
    "professional_role": "自然出现的老师、顾问或服务团队",
    "intervention_action": "具体做了什么",
    "stage_result": "克制且可验证的阶段变化",
    "evidence_basis": "业务方法、匿名案例或过程事实",
    "bridge_paragraph": "把上述五项自然连成一段的完整正文"
  },
  "opening": "自然开头完整段落",
  "core_judgement": "全文唯一核心判断",
  "delivery_sections": ["兑现段1", "兑现段2"],
  "service_bridge": "卡点→专业角色→具体动作→阶段结果的自然完整段落",
  "stage_result": "可验证的阶段结果原句",
  "closing": "唯一自然收束动作"
}
`.trim();
}

export function buildDraftUserPrompt(input: {
  targetUser: string;
  trustSource: string;
  methodId: TitleMethodId;
  methodLabel: string;
  generationMode: MethodGenerationMode;
  title: string;
  titlePromise: string;
  testVariable: string;
  expectedSignal: string;
  followReason: string;
  persona?: GrowthPersona;
  variantHint?: string;
  learningGuidance?: string;
  excludeBodies?: string[];
  context?: AccountContext;
  blueprint: DraftBlueprintContext;
  deliveryRule: string;
  ctaType: "soft_bridge" | "on_platform_consult" | "service_entry";
}) {
  const exclude = (input.excludeBodies ?? []).filter(Boolean);
  return `
请以主笔 V3 身份，把最终选题写成可直接发布的小红书发布包。

${input.persona ? personaGuide(input.persona) : ""}
${accountContextBlock(input.context)}
${input.context?.privateDomain ? `业务承接背景（仅用于理解业务，不得照搬互动话术，不得引导评论/私信换资料）：${input.context.privateDomain}` : ""}
目标用户：${input.targetUser}
信任来源：${input.trustSource}
标题方法：${input.methodLabel}（${input.methodId}）
生成模式：${input.generationMode === "default" ? "默认" : "探索"}
最终选题：${input.title}
正文必须兑现：${input.titlePromise}
本篇验证变量：${input.testVariable}
预期有效信号：${input.expectedSignal}
关注理由：${input.followReason}
${input.learningGuidance ? `复盘学习依据（必须执行，但不能在成文中提及）：\n${input.learningGuidance}` : ""}
${input.variantHint ? `本次写作角度：${input.variantHint}` : ""}
${exclude.length ? `严禁与以下已生成正文重复或近似（可换结构、开头、案例）：\n${exclude.map((b) => b.slice(0, 120)).join("\n---\n")}` : ""}

正文生成骨架（由架构步骤提前生成，必须按顺序落实，不能删除其中任一环）：
${JSON.stringify(input.blueprint, null, 2)}
标题兑现结构：${input.deliveryRule}

写作要求：
- 不预设正文形态。根据标题承诺自然决定叙事、清单、判断、对比或其它写法。
- 前30字必须回应标题中的人物、问题或冲突，但要像真人自然开口：优先从一个动作、现场、念头或矛盾写起。禁止用“作为××”“身为××”“我的判断是”“先看这里”“我们做××服务时”自报身份，也不要机械复述标题。
- 标题有数字，正文必须给出同等数量的有效内容；承诺资料、清单或路线图时必须直接交付核心内容。
- 反认知必须解释反转成立的条件；拔河式必须真实比较两边；对标法只迁移逻辑，不复制原作者表达。
- 【标题硬性规则】title 与每个 alternative_titles 都必须控制在 20 个字以内（含标点符号，按小红书规则），不要用「｜」「|」「——」外挂副标题。
- 发布端文字（标题+正文+话题标签）不得超过 1000 字。
- 给 5 个以内话题标签。
- 短版和长版必须保持同一核心判断，但不能是同一篇正文只换版本标签。短版直接给结论和必要动作；长版要增加现场、判断依据、执行细节和避坑说明。
- 本篇唯一主要承接动作类型：${input.ctaType}。不能叠加第二个承接动作。
- 专业服务只能出现在真实因果链里：先写当事人遇到的具体卡点或自己试过什么，再自然带到老师、机构或顾问做了哪一个关键动作，最后顺手交代一个克制、可验证的阶段变化。不要单独插入“我们很专业”“建议找机构”等广告句，也不能只在结尾突然宣传。
- 服务介入后必须有结果，但结果优先写过程变化，例如岗位从很多类收窄到两类、简历与目标岗位对齐、能说清下一步、排除了一个不适合的方向、投递或面试反馈开始可复盘。没有真实依据时不得编造 Offer、薪资、录取数量或确定性成功；可以明确写“不是立刻拿到结果，而是先把什么理顺了”。
- 买家视角要像经历自然转折，不要把老师写成产品说明书；专家视角要像复盘一次具体判断；商家视角要用真实交付动作和阶段结果证明，不要自夸。
- 先按“opening→identity_evidence→core_judgement→service_bridge→delivery_sections→closing”的骨架分别完成各段，再由系统拼成正文。不得先自由写一篇正文、最后再补身份、老师或结果。
- 【互动合规硬规则】正文、标题、封面和 comment_prompt 都不得要求点赞、收藏、关注、评论、转发、互关或互赞；不得出现「评论区扣1」「留言关键词」「回复口令」「私信我」「加微信」等动作。
- 【禁止利益交换】不得用资料、匿名样例、报告、清单、模板、链接、福利、抽奖、诊断或体检作为互动奖励。像「需要职业方向体检的评论区扣1，我发你匿名交付样例」这种表达一律禁止。
- 结尾优先给出一个读者当下就能完成的自查动作或判断标准。可以提出与正文直接相关的自然问题，但不能承诺根据评论发送任何东西。
输出 JSON：
{
  "title": "最终标题",
  "alternative_titles": ["备选 1", "备选 2", "备选 3"],
  "target_user": "本篇写给谁",
  "cover_text": "封面句",
  "body": "正文",
  "body_structure": {
    "opening": "自然开头段",
    "identity_evidence": "与正文合同一致的身份依据段",
    "core_judgement": "与另一版本一致的核心判断",
    "delivery_sections": ["按标题承诺展开的正文段落"],
    "service_bridge": "自然包含卡点、专业角色、动作和阶段结果的完整段落",
    "closing": "唯一收束动作"
  },
  "hashtags": ["#标签1", "#标签2"],
  "comment_prompt": "自然讨论问题（只问主题本身，不要求互动，不与资料/福利/私信挂钩）",
  "follow_reason": "本篇关注理由",
  "trust_anchor": "本篇信任锚点",
  "review_points": ["发布后观察点 1", "观察点 2"],
  "cover_suggestion": "首图/封面建议",
  "cta_type": "必须等于指定的唯一承接动作类型"
}
`.trim();
}

export function buildReviewUserPrompt(input: {
  title: string;
  methodLabel: string;
  generationMode: MethodGenerationMode;
  rawTags?: RawBodyTag[];
  testVariable: string;
  metrics: Record<string, unknown>;
}) {
  return `
请以复盘官 V4 身份，基于发布24小时后的真实数据做单篇复盘。不可见字段写不可见，不得编造。
单篇复盘只判断标题入口、正文执行和商业承接，不得凭一篇笔记决定方法晋升或暂停。

标题：${input.title}
标题方法：${input.methodLabel}
生成模式：${input.generationMode === "default" ? "默认" : "探索"}
正文开放标签：${input.rawTags?.map((tag) => tag.text).join("、") || "尚未归纳"}
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
  methodAggregate: unknown;
  tagAggregate: unknown;
  eligibleTotal: number;
}) {
  return `
请以总经理 V4 身份，基于多篇笔记的聚合数据做「周复盘 / 方法学习」。不要基于单篇爆款下结论。

目标用户：${input.targetUser}
当前有效样本：${input.eligibleTotal}
标题方法聚合：${JSON.stringify(input.methodAggregate)}
正文开放标签聚合：${JSON.stringify(input.tagAggregate)}

判断规则：
- 有效咨询率是北极星，收藏、分享、主页访问和关注用于解释过程。
- 少于30篇有效样本时只描述数据，不得评选最佳方法或建议标签。
- 探索方法只有满足服务器给出的晋升门槛时才可建议晋升，且最终必须人工确认。

输出 JSON：
{
  "scale_direction": "方法观察结论（样本不足就明确说不排名）",
  "pause_direction": "风险或不应放大的方法（没有就写暂无）",
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

export function buildBodyTagUserPrompt(input: {
  title: string;
  body: string;
  bodyVersion: "short" | "long" | "selected";
}) {
  return `
请阅读这篇已经选定的小红书正文，从正文实际呈现方式和给读者的价值中，自由归纳1—2个简短标签。

禁止从预设分类中选择；不要使用“诊断型、工具型、案例型、观点型、混合型、无法判断”等固定词表。
每个标签2—8个汉字，避免只复述业务主题。只有能够从正文中明确找到依据时才生成；不确定则返回空数组。
产品名、专有方法名和价格不是正文形态标签，例如“六步决策漏斗”“VRIN”“199诊断”“6999服务”都不要作为标签。

标题：${input.title}
正文版本：${input.bodyVersion}
正文：
${input.body}

输出 JSON：
{
  "tags": [
    {"text": "开放标签", "reason": "正文中哪些内容支持这个标签"}
  ]
}
`.trim();
}

export function buildTagMergeUserPrompt(input: {
  rawTags: Array<{ text: string; draftId: string; title: string }>;
}) {
  return `
请整理一批由真实正文自由归纳出来的开放标签。只把明确近义、上下位高度重叠或表达重复的标签放进同一个建议；不要为了减少数量而强行合并。

原始标签：${JSON.stringify(input.rawTags)}

输出 JSON：
{
  "suggestions": [
    {
      "proposed_name": "建议的统一标签",
      "definition": "这个统一标签只包含什么、不包含什么",
      "member_tags": ["原始标签1", "原始标签2"],
      "representative_draft_ids": ["代表正文id"]
    }
  ]
}

单个标签不要单独生成合并建议；member_tags至少2个。系统只会把结果交给运营人工确认，不会自动合并。
`.trim();
}

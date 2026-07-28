import type {
  BenchmarkStructureCard,
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
  oneLiner?: string;
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
  if (ctx.oneLiner) lines.push(`当前账号一句话人设：${ctx.oneLiner}`);
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

const NATIVE_METHOD_DIVERSITY_PLAYBOOK: Partial<Record<TitleMethodId, string>> = {
  human_pain: "三个候选必须轮换真实触发时刻，例如工资到账、续签合同、绩效面谈、老板消息、客户流失、家庭开支、晋升通知、投递沉默；不能三条都只是“焦虑/没回音”的换词。",
  tug_of_war: "三个候选必须使用三组不同的真实取舍变量，例如地区、岗位、收入、时间、家庭、身份、工作方式、验证顺序；“A还是B”只是句式，真正的新题取决于两边选择和代价都不同。",
  scarce_material: "三个候选必须使用三种不同的资料载体与决策任务。可选载体包括：招聘节点日历、岗位JD拆解卡、面试追问库、投递漏斗复盘页、项目证据账本、Offer比较尺、岗位排除题库、行业适配坐标、内推跟进看板、家庭约束单、能力证据索引、风险红旗卡。不要连续输出“某某表/清单/路线图”，也不能只替换资料名称；正文承诺必须说明这份资料具体帮助读者判断什么。",
  superlative: "三个候选必须轮换不同的高代价风险对象，例如合同、现金流、岗位错配、面试证据、家庭约束、行业周期、试错窗口；不能都写“最危险/最容易漏的一步”的空壳。",
  contrarian: "三个候选必须轮换三组不同的“表面优势→隐藏代价”，例如名校、平台、职位、收入、人脉、实习、投递量、内推；不能只把“越高越难”套在不同名词上。",
  nostalgia: "三个候选必须轮换过去与现在的物件和场景，例如录取信与面试通知、工牌与外部报价、旧简历与岗位JD、排名与项目追问、升职邮件与合同条款；不能重复同一组今昔对照。",
  inventory: "三个候选必须盘点三类不同对象或阶段，例如日期窗口、岗位红旗、简历证据、面试追问、投递漏斗、Offer条款、家庭约束、现金流、客户资源、可迁移能力；数字和“几个坑”不是新题，盘点对象与使用场景必须不同。",
};

interface TugOfWarAngle {
  cue: string;
  usedWhen: RegExp;
}

interface NostalgiaAngle {
  cue: string;
  usedWhen: RegExp;
}

interface InventoryAngle {
  cue: string;
  usedWhen: RegExp;
}

interface ContrarianAngle {
  cue: string;
  usedWhen: RegExp;
}

/**
 * 反认知不能长期只在“学历/实习/海投/方向”四个词之间改写。这里分配的不是
 * 成品标题，而是一组尚未使用的“表面优势 → 隐藏代价”。模型必须先更换
 * 真实判断对象，再按当前业务与视角写成自然标题。
 */
const OVERSEAS_CONTRARIAN_ANGLES: ContrarianAngle[] = [
  { cue: "证书数量多 → 缺少工作成果证据", usedWhen: /证书.*(?:成果|证据)|(?:成果|证据).*证书/u },
  { cue: "英语流利 → 说不清业务判断", usedWhen: /英语.*(?:业务|判断)|(?:业务|判断).*英语/u },
  { cue: "成绩高 → 缺少协作故事", usedWhen: /成绩.*协作|协作.*成绩/u },
  { cue: "项目多 → 讲不清个人贡献", usedWhen: /项目.*个人贡献|个人贡献.*项目/u },
  { cue: "社团头衔高 → 证明不了岗位胜任", usedWhen: /社团.*(?:胜任|岗位)|(?:胜任|岗位).*社团/u },
  { cue: "投递很早 → 没核对招聘批次", usedWhen: /投.*早.*批次|批次.*投.*早/u },
  { cue: "认识校友多 → 不清楚岗位日常", usedWhen: /校友.*岗位日常|岗位日常.*校友/u },
  { cue: "模拟面试多 → 回答变得不自然", usedWhen: /模拟面试.*自然|回答.*不自然/u },
  { cue: "Offer选择多 → 忽略直属经理", usedWhen: /(?:Offer|录用).*直属|直属.*(?:Offer|录用)/iu },
  { cue: "起薪高 → 学习成长空间小", usedWhen: /起薪.*成长|成长.*起薪/u },
  { cue: "公司名气大 → 实际职责太窄", usedWhen: /公司.*名气.*职责|职责.*名气/u },
  { cue: "岗位名称好听 → 工作内容不对口", usedWhen: /岗位.*(?:名称|名).*内容|工作内容.*岗位/u },
  { cue: "会的工具多 → 没有结果证据", usedWhen: /工具.*结果|结果.*工具/u },
  { cue: "课程选得广 → 说不清真正专长", usedWhen: /课程.*专长|专长.*课程/u },
  { cue: "专业热门 → 同岗位竞争更拥挤", usedWhen: /专业.*热门.*竞争|热门专业.*竞争/u },
  { cue: "内推机会多 → 岗位匹配反而被忽略", usedWhen: /内推.*匹配|匹配.*内推/u },
  { cue: "简历写得满 → 经不起细节追问", usedWhen: /简历.*(?:写满|细节|追问)|追问.*简历/u },
  { cue: "案例背得熟 → 扛不住现场追问", usedWhen: /案例.*(?:现场|追问)|现场追问.*案例/u },
  { cue: "留海外时间长 → 错过回国招聘窗口", usedWhen: /留.*(?:海外|英).*回国.*窗口|回国.*窗口.*留/u },
  { cue: "回国时间早 → 未必赶上正确批次", usedWhen: /回国.*早.*批次|批次.*回国.*早/u },
  { cue: "可选城市多 → 投递越来越分散", usedWhen: /城市.*多.*分散|分散.*城市/u },
  { cue: "关注行业多 → 准备没有针对性", usedWhen: /行业.*多.*针对|针对.*行业/u },
  { cue: "候选方向多 → 没有先验证一条", usedWhen: /方向.*多.*验证|验证.*方向/u },
  { cue: "名企实习 → 没做过关键任务", usedWhen: /名企.*关键任务|关键任务.*名企/u },
  { cue: "比赛获奖 → 讲不出业务结果", usedWhen: /比赛.*(?:业务|结果)|业务结果.*比赛/u },
  { cue: "技术能力强 → 讲不清客户价值", usedWhen: /技术.*客户价值|客户价值.*技术/u },
  { cue: "人脉广 → 没记录有效反馈", usedWhen: /人脉.*反馈|反馈.*人脉/u },
  { cue: "口语好 → 中文汇报仍需验证", usedWhen: /口语.*中文汇报|中文汇报.*口语/u },
  { cue: "笔试通过快 → 面试岗位未必匹配", usedWhen: /笔试.*面试.*匹配|匹配.*笔试/u },
  { cue: "进到终面 → 不该停止其他投递", usedWhen: /终面.*(?:停止|投递)|投递.*终面/u },
  { cue: "愿意降薪 → 未必更容易跨行业", usedWhen: /降薪.*(?:跨行|转行)|(?:跨行|转行).*降薪/u },
  { cue: "远程岗位方便 → 新人融入更慢", usedWhen: /远程.*融入|融入.*远程/u },
  { cue: "管培轮岗多 → 方向可能更模糊", usedWhen: /管培.*方向|轮岗.*方向/u },
  { cue: "跨专业经历 → 优势仍需项目证明", usedWhen: /跨专业.*项目|项目.*跨专业/u },
  { cue: "作品集漂亮 → 没对准岗位任务", usedWhen: /作品集.*岗位任务|岗位任务.*作品集/u },
  { cue: "导师推荐强 → 替代不了工作证据", usedWhen: /导师.*(?:推荐|证据)|工作证据.*导师/u },
  { cue: "工签没有问题 → 岗位未必合适", usedWhen: /工签.*岗位.*(?:合适|匹配)|岗位.*工签/u },
  { cue: "签约速度快 → 更要先看试用期", usedWhen: /签约.*试用期|试用期.*签约/u },
  { cue: "福利项目多 → 总回报未必更高", usedWhen: /福利.*总回报|总回报.*福利/u },
  { cue: "双语简历齐全 → 两版经历口径不一致", usedWhen: /双语简历|两版.*简历|简历.*口径/u },
  { cue: "海外经历丰富 → 不熟悉本地业务语境", usedWhen: /海外经历.*本地|本地.*海外经历/u },
  { cue: "量化课程扎实 → 不会解释商业影响", usedWhen: /量化.*商业|商业.*量化/u },
];

const EXECUTIVE_CONTRARIAN_ANGLES: ContrarianAngle[] = [
  { cue: "平台大 → 外部市场看不清个人贡献", usedWhen: /平台.*个人贡献|个人贡献.*平台/u },
  { cue: "职位高 → 可选岗位反而更少", usedWhen: /职位.*岗位.*少|岗位.*少.*职位/u },
  { cue: "年薪高 → 转型试错空间更小", usedWhen: /年薪.*试错|试错.*年薪/u },
  { cue: "人脉广 → 真实付费需求仍未验证", usedWhen: /人脉.*付费|付费.*人脉/u },
  { cue: "团队大 → 个人交付能力更难证明", usedWhen: /团队.*个人交付|个人交付.*团队/u },
  { cue: "客户多 → 可带走关系未必多", usedWhen: /客户.*带走|带走.*客户/u },
  { cue: "预算大 → 不等于有独立经营权", usedWhen: /预算.*经营权|经营权.*预算/u },
  { cue: "头衔好听 → 新公司任务书可能缩水", usedWhen: /头衔.*任务|任务书.*头衔/u },
  { cue: "绩效优秀 → 可能只适配原组织", usedWhen: /绩效.*组织|组织.*绩效/u },
  { cue: "行业经验深 → 跨行业迁移更需证据", usedWhen: /行业经验.*迁移|迁移.*行业经验/u },
  { cue: "管理经验多 → 面试仍要讲具体结果", usedWhen: /管理经验.*结果|结果.*管理经验/u },
  { cue: "猎头来电多 → 市场报价未必真实", usedWhen: /猎头.*报价|报价.*猎头/u },
  { cue: "副业咨询多 → 未必形成稳定复购", usedWhen: /副业.*复购|复购.*副业/u },
  { cue: "创业资源多 → 现金跑道仍可能不足", usedWhen: /创业.*现金|现金跑道.*创业/u },
  { cue: "大厂履历强 → 小团队未必买单", usedWhen: /大厂.*小团队|小团队.*大厂/u },
  { cue: "战略能力强 → 亲自获客仍需验证", usedWhen: /战略.*获客|获客.*战略/u },
  { cue: "表达能力强 → 解决方案未必能成交", usedWhen: /表达.*成交|成交.*表达/u },
  { cue: "决策速度快 → 转型前更容易漏变量", usedWhen: /决策.*漏.*变量|变量.*决策/u },
  { cue: "原团队挽留 → 不等于外部机会更好", usedWhen: /挽留.*外部|外部.*挽留/u },
  { cue: "晋升在望 → 可能推迟方向验证", usedWhen: /晋升.*验证|验证.*晋升/u },
  { cue: "现金储备多 → 也可能没有验证节奏", usedWhen: /现金.*验证|验证.*现金/u },
  { cue: "合伙人熟悉 → 责任边界更容易含糊", usedWhen: /合伙人.*边界|责任边界.*合伙/u },
  { cue: "客户认可高 → 能力未必可产品化", usedWhen: /客户.*产品化|产品化.*客户/u },
  { cue: "证书课程多 → 市场不会替你定价", usedWhen: /证书.*定价|课程.*定价/u },
  { cue: "简历项目多 → 关键胜任证据仍分散", usedWhen: /简历.*胜任|胜任.*简历/u },
  { cue: "面试机会多 → 岗位边界可能更模糊", usedWhen: /面试.*岗位边界|岗位边界.*面试/u },
  { cue: "行业名气大 → 周期下行风险更集中", usedWhen: /行业.*名气.*周期|周期.*名气/u },
  { cue: "长期稳定 → 可迁移能力可能被遮住", usedWhen: /稳定.*迁移|迁移.*稳定/u },
  { cue: "责任心强 → 更容易替组织扛风险", usedWhen: /责任心.*组织.*风险|组织.*风险.*责任/u },
  { cue: "执行力强 → 可能一直没验证方向", usedWhen: /执行力.*方向|方向.*执行力/u },
  { cue: "资源调动快 → 离开平台后未必可用", usedWhen: /资源.*离开平台|离开平台.*资源/u },
  { cue: "熟悉老板 → 不等于拥有决策边界", usedWhen: /老板.*决策边界|决策边界.*老板/u },
  { cue: "岗位稳定 → 真实工作内容可能收窄", usedWhen: /岗位.*稳定.*内容|工作内容.*稳定/u },
  { cue: "跨部门经验多 → 核心专长更需聚焦", usedWhen: /跨部门.*专长|专长.*跨部门/u },
  { cue: "离职补偿高 → 不能替代下一步验证", usedWhen: /补偿.*验证|验证.*补偿/u },
  { cue: "顾问项目多 → 不代表有持续获客", usedWhen: /顾问.*获客|获客.*顾问/u },
  { cue: "个人品牌强 → 商业交付仍需标准化", usedWhen: /个人品牌.*交付|交付.*个人品牌/u },
  { cue: "管理半径大 → 亲自解决问题可能变慢", usedWhen: /管理.*亲自|亲自.*管理/u },
  { cue: "熟悉行业规则 → 新赛道学习成本仍高", usedWhen: /行业规则.*学习|学习成本.*行业/u },
  { cue: "选择机会多 → 更需要先排除一条", usedWhen: /机会.*多.*排除|排除.*机会/u },
];

const OVERSEAS_HUMAN_PAIN_ANGLES: ContrarianAngle[] = [
  { cue: "申请系统状态一直不更新", usedWhen: /申请系统.*(?:状态|不更新)|状态.*不更新/u },
  { cue: "拒信到邮箱却不敢点开", usedWhen: /拒信.*(?:邮箱|点开)|邮箱.*拒信/u },
  { cue: "室友讨论Offer时选择沉默", usedWhen: /室友.*(?:Offer|录用)|(?:Offer|录用).*室友/iu },
  { cue: "毕业典礼临近仍说不清去向", usedWhen: /毕业典礼.*去向|去向.*毕业/u },
  { cue: "租约到期却不知道搬去哪座城", usedWhen: /租约.*(?:搬|城市)|搬.*租约/u },
  { cue: "父母问回程票却不敢确定日期", usedWhen: /(?:父母|爸妈|家长).*回程|回程票/u },
  { cue: "导师问毕业计划只能含糊回答", usedWhen: /导师.*(?:毕业计划|去向)|毕业计划.*导师/u },
  { cue: "校友答应内推后一直没有下文", usedWhen: /校友.*内推.*(?:没|没有)|内推.*没.*下文/u },
  { cue: "面试撞上答辩却不敢放弃任何一边", usedWhen: /面试.*答辩|答辩.*面试/u },
  { cue: "签证倒计时逼近却没有岗位顺序", usedWhen: /签证.*倒计时|倒计时.*岗位/u },
  { cue: "职业展拿了一袋资料仍不知道投谁", usedWhen: /职业展|招聘会.*资料/u },
  { cue: "薪资期望栏反复改又不敢提交", usedWhen: /薪资.*(?:栏|提交)|期望薪资/u },
  { cue: "招聘官追问项目数字时突然卡住", usedWhen: /招聘官.*项目.*数字|项目数字.*卡/u },
  { cue: "背调要联系人却找不到合适的人", usedWhen: /背调.*联系人|联系人.*背调/u },
  { cue: "家庭群里都在问秋招进展", usedWhen: /家庭群|家族群.*秋招/u },
  { cue: "航班和面试时间冲突不敢做取舍", usedWhen: /航班.*面试|面试.*航班/u },
  { cue: "学位证明未出却被催入职材料", usedWhen: /学位证明.*入职|入职.*学位证明/u },
  { cue: "两版中英文简历经历对不上", usedWhen: /中英文简历|两版.*简历/u },
  { cue: "申请了很多城市却没有一座真想去", usedWhen: /城市.*(?:很多|多).*想去|想去.*城市/u },
  { cue: "收到笔试却发现岗位工作不对口", usedWhen: /笔试.*工作.*不对口|笔试.*岗位.*不对口/u },
  { cue: "家里帮忙找关系反而更难拒绝", usedWhen: /家里.*关系.*拒绝|找关系.*拒绝/u },
  { cue: "作品集改到深夜仍不知道给谁看", usedWhen: /作品集.*(?:深夜|给谁)|深夜.*作品集/u },
  { cue: "面试复盘写满却不敢看下一场", usedWhen: /面试复盘.*下一场|复盘.*不敢.*面试/u },
  { cue: "同学开始入职自己还在选方向", usedWhen: /同学.*入职.*方向|入职.*自己.*方向/u },
  { cue: "招聘截止日和论文节点挤在一起", usedWhen: /截止.*论文|论文.*截止/u },
  { cue: "被问为什么回国时答不出真理由", usedWhen: /为什么回国|回国.*理由/u },
  { cue: "拿到保底机会却不敢告诉家里", usedWhen: /保底.*(?:家里|父母)|不敢.*保底/u },
  { cue: "准备很多面试答案仍怕真实追问", usedWhen: /面试答案.*追问|追问.*面试答案/u },
  { cue: "每天刷岗位却越来越不敢投", usedWhen: /刷岗位.*不敢投|每天.*岗位.*不敢/u },
  { cue: "招聘官已读不回后反复检查消息", usedWhen: /招聘官.*已读|已读不回/u },
];

const EXECUTIVE_HUMAN_PAIN_ANGLES: ContrarianAngle[] = [
  { cue: "猎头来电时正在主持团队会议", usedWhen: /猎头.*团队会议|会议.*猎头/u },
  { cue: "工资到账后更不敢算离职成本", usedWhen: /工资.*离职成本|离职成本.*工资/u },
  { cue: "合同续签摆在桌上却迟迟不签", usedWhen: /续签.*(?:桌|不签)|合同.*迟迟/u },
  { cue: "绩效优秀却不敢打开招聘网站", usedWhen: /绩效.*招聘网站|招聘网站.*绩效/u },
  { cue: "董事会肯定后反而更想换方向", usedWhen: /董事会.*换方向|换方向.*董事会/u },
  { cue: "预算被冻结仍要向团队解释前景", usedWhen: /预算.*冻结.*团队|团队.*预算.*冻结/u },
  { cue: "核心下属递辞呈时开始怀疑自己", usedWhen: /下属.*辞呈|辞呈.*下属/u },
  { cue: "客户流失后才发现资源属于平台", usedWhen: /客户.*流失.*平台|资源.*属于平台/u },
  { cue: "孩子学费账单让转型计划一再后退", usedWhen: /学费.*转型|转型.*学费/u },
  { cue: "伴侣问下一站时给不出明确答案", usedWhen: /伴侣.*下一站|下一站.*伴侣/u },
  { cue: "体检报告出来后开始重新算时间", usedWhen: /体检.*时间|时间.*体检/u },
  { cue: "连续差旅后不敢承认身体扛不住", usedWhen: /差旅.*身体|身体.*差旅/u },
  { cue: "旧名片还体面但市场没有新报价", usedWhen: /名片.*报价|报价.*名片/u },
  { cue: "简历投出后第一次长时间没回应", usedWhen: /简历.*没回应|投.*简历.*没.*回/u },
  { cue: "第一次个人方案发出去没人付费", usedWhen: /个人方案.*付费|没人付费/u },
  { cue: "同事晋升消息让自己不敢辞职", usedWhen: /同事.*晋升.*辞职|晋升消息.*离职/u },
  { cue: "继任名单写完却没有自己的下一步", usedWhen: /继任.*自己的.*下一|自己.*下一步.*继任/u },
  { cue: "组织调整邮件里自己的职责被缩小", usedWhen: /组织调整.*职责|职责.*缩小/u },
  { cue: "汇报线变化后发现决策权被拿走", usedWhen: /汇报线.*决策权|决策权.*汇报/u },
  { cue: "大客户只认公司品牌不认个人", usedWhen: /客户.*公司品牌.*个人|品牌.*不认.*个人/u },
  { cue: "递延奖金没到账不敢决定离开", usedWhen: /递延奖金.*离开|离开.*奖金/u },
  { cue: "竞业条款看不懂却已经收到机会", usedWhen: /竞业.*机会|机会.*竞业/u },
  { cue: "老板挽留时自己反而说不出条件", usedWhen: /老板.*挽留.*条件|挽留.*说不出/u },
  { cue: "团队扩张计划获批但自己想离场", usedWhen: /团队.*扩张.*离|扩张计划.*想走/u },
  { cue: "副业咨询很多却没有一个稳定客户", usedWhen: /副业.*稳定客户|咨询.*没有.*客户/u },
  { cue: "创业想法写了很久仍没验证付费", usedWhen: /创业.*验证.*付费|付费.*创业/u },
  { cue: "猎头给出职位却说不清真实权限", usedWhen: /猎头.*权限|职位.*真实权限/u },
  { cue: "家庭现金流一算才发现窗口很短", usedWhen: /家庭.*现金流.*窗口|现金流.*窗口/u },
  { cue: "旧团队需要自己但外部市场没回应", usedWhen: /旧团队.*外部市场|外部.*没回应/u },
  { cue: "年终奖确定后转型又被推迟一年", usedWhen: /年终奖.*转型|转型.*年终奖/u },
];

const OVERSEAS_SCARCE_MATERIAL_ANGLES: ContrarianAngle[] = [
  { cue: "跨时区面试排期表：避免撞时段", usedWhen: /跨时区.*排期|面试排期/u },
  { cue: "签证工签衔接矩阵：判断可投岗位", usedWhen: /签证.*工签.*矩阵|工签衔接/u },
  { cue: "背调联系人可用表：提前补证明", usedWhen: /背调联系人.*表|联系人可用/u },
  { cue: "异地入职成本计算页：比较城市", usedWhen: /异地入职.*成本|城市.*成本.*页/u },
  { cue: "学历认证材料包：核对入职文件", usedWhen: /学历认证.*材料|入职文件/u },
  { cue: "评估中心角色卡：准备小组任务", usedWhen: /评估中心.*角色|小组任务.*卡/u },
  { cue: "案例面试证据账本：记录数据来源", usedWhen: /案例面试.*账本|数据来源.*账本/u },
  { cue: "岗位语言样本库：验证真实工作语境", usedWhen: /岗位语言.*(?:库|样本)|工作语境/u },
  { cue: "学位证明节点表：协调答辩与入职", usedWhen: /学位证明.*节点|答辩.*入职.*表/u },
  { cue: "跨境税务问题单：比较两地选择", usedWhen: /跨境税务.*(?:单|表)|税务问题/u },
  { cue: "试用期目标确认卡：入职前对齐考核", usedWhen: /试用期目标.*卡|对齐考核/u },
  { cue: "福利隐性成本表：核算真实总回报", usedWhen: /福利.*隐性成本|真实总回报/u },
  { cue: "雇主担保证明清单：筛掉无效岗位", usedWhen: /雇主担保.*清单|担保证明/u },
  { cue: "申请系统账号台账：避免资料串版", usedWhen: /申请系统.*台账|账号台账/u },
  { cue: "招聘官触点记录页：安排跟进节奏", usedWhen: /招聘官.*触点|触点记录/u },
  { cue: "跨境联系方式核对卡：保证能被联系", usedWhen: /跨境.*联系方式|收件地址.*卡/u },
  { cue: "课程能力映射表：把模块变成证据", usedWhen: /课程.*能力.*映射|模块.*证据/u },
  { cue: "研究方法迁移页：把论文变工作样本", usedWhen: /研究方法.*迁移|论文.*工作样本/u },
  { cue: "中英文表达样本库：准备双语汇报", usedWhen: /中英文.*样本|双语汇报/u },
  { cue: "协作故事拆解卡：补利益相关方细节", usedWhen: /协作故事.*卡|利益相关方/u },
  { cue: "拒信原因日志：判断该改岗还是改表达", usedWhen: /拒信原因.*日志|拒信.*改岗/u },
  { cue: "面试反问题库：核验岗位与经理", usedWhen: /面试反问.*库|反问题库/u },
  { cue: "通勤租房成本表：比较工作城市", usedWhen: /通勤.*租房.*表|工作城市.*成本/u },
  { cue: "薪酬条款比较尺：统一底薪奖金口径", usedWhen: /薪酬.*比较|底薪.*奖金.*口径/u },
  { cue: "面试撞期调度表：确定取舍顺序", usedWhen: /面试撞期.*表|撞期.*顺序/u },
  { cue: "校友访谈题单：验证岗位日常", usedWhen: /校友访谈.*题|岗位日常.*题/u },
  { cue: "行业证书门槛图：判断补证优先级", usedWhen: /证书.*门槛.*图|补证.*优先/u },
  { cue: "岗位释放日历：跟踪目标企业窗口", usedWhen: /岗位释放.*日历|企业.*窗口.*日历/u },
  { cue: "部门职责对照表：避免只看公司名", usedWhen: /部门职责.*对照|公司名.*职责/u },
  { cue: "Offer试用期核对卡：提前问清目标", usedWhen: /Offer.*试用期.*卡|试用期.*核对/iu },
];

const EXECUTIVE_SCARCE_MATERIAL_ANGLES: ContrarianAngle[] = [
  { cue: "离职通知期计算表：安排交接窗口", usedWhen: /通知期.*计算|交接窗口/u },
  { cue: "竞业补偿核对卡：判断可去范围", usedWhen: /竞业.*补偿.*卡|可去范围/u },
  { cue: "递延奖金时间轴：核算离开代价", usedWhen: /递延奖金.*时间轴|离开代价.*奖金/u },
  { cue: "股权归属清单：看清回购条款", usedWhen: /股权归属.*清单|回购条款.*清单/u },
  { cue: "家庭现金跑道表：确定试错月份", usedWhen: /家庭.*现金.*表|试错月份/u },
  { cue: "客户集中度看板：评估独立收入风险", usedWhen: /客户集中.*看板|独立收入.*风险/u },
  { cue: "利益相关方地图：确认真实支持", usedWhen: /利益相关方.*地图|真实支持/u },
  { cue: "经营结果证据账本：剥离平台贡献", usedWhen: /经营结果.*账本|平台贡献/u },
  { cue: "危机案例拆解卡：证明个人判断", usedWhen: /危机.*拆解卡|个人判断.*卡/u },
  { cue: "组织变革成果表：明确个人作用", usedWhen: /组织变革.*成果表|个人作用/u },
  { cue: "团队继任清单：评估离岗影响", usedWhen: /团队继任.*清单|离岗影响/u },
  { cue: "董事会授权图：核验职位决策权", usedWhen: /董事会.*授权图|职位.*决策权/u },
  { cue: "新岗位汇报线卡：看清真实老板", usedWhen: /汇报线.*卡|真实老板/u },
  { cue: "预算权限对照表：识别虚高头衔", usedWhen: /预算权限.*表|虚高头衔/u },
  { cue: "差旅负荷记录表：算时间和身体成本", usedWhen: /差旅.*记录表|身体成本/u },
  { cue: "异地任职家庭单：确认可承受边界", usedWhen: /异地任职.*家庭.*单|承受边界/u },
  { cue: "行业周期位置图：判断转型窗口", usedWhen: /行业周期.*图|转型窗口/u },
  { cue: "监管风险问题库：核验新赛道", usedWhen: /监管.*问题库|新赛道.*监管/u },
  { cue: "个人品牌资产表：区分能带走什么", usedWhen: /个人品牌.*资产表|能带走/u },
  { cue: "背调证明人清单：提前确认口径", usedWhen: /背调.*证明人.*清单|证明人.*口径/u },
  { cue: "新公司任务书模板：问清首年结果", usedWhen: /任务书.*模板|首年结果/u },
  { cue: "试用期经营指标卡：提前对齐目标", usedWhen: /试用期.*经营指标.*卡|对齐目标/u },
  { cue: "薪酬结构比较表：统一固定浮动口径", usedWhen: /薪酬结构.*比较|固定.*浮动.*口径/u },
  { cue: "顾问责任边界单：避免交付失控", usedWhen: /顾问.*责任边界.*单|交付失控/u },
  { cue: "首批客户线索表：验证获客来源", usedWhen: /首批客户.*线索表|获客来源/u },
  { cue: "创业现金跑道表：设定停止条件", usedWhen: /创业.*现金跑道.*表|停止条件/u },
  { cue: "合伙退出机制卡：提前谈分手", usedWhen: /合伙.*退出.*卡|退出机制/u },
  { cue: "能力缺口周期表：估算补课时间", usedWhen: /能力缺口.*周期表|补课时间/u },
  { cue: "低成本验证实验单：先测方向再离职", usedWhen: /验证实验.*单|先测方向/u },
  { cue: "伴侣转型共识页：对齐家庭底线", usedWhen: /伴侣.*共识.*页|家庭底线/u },
];

const OVERSEAS_SUPERLATIVE_ANGLES: ContrarianAngle[] = [
  { cue: "最容易错过的跨时区面试确认", usedWhen: /最.*跨时区.*面试|面试.*确认/u },
  { cue: "最隐蔽的工签资格误读", usedWhen: /最.*工签.*误读|工签.*资格/u },
  { cue: "最容易失效的背调联系人", usedWhen: /最.*背调.*联系人|联系人.*失效/u },
  { cue: "最容易低估的异地搬迁成本", usedWhen: /最.*(?:搬迁|异地).*成本/u },
  { cue: "最容易拖延入职的认证材料", usedWhen: /最.*认证材料|认证.*拖.*入职/u },
  { cue: "评估中心最容易抢错的角色", usedWhen: /评估中心.*最.*角色|最.*小组角色/u },
  { cue: "案例面试最危险的数据空白", usedWhen: /案例面试.*最.*数据|最危险.*数据/u },
  { cue: "双语岗位最容易忽略的表达差异", usedWhen: /双语.*最.*表达|表达差异/u },
  { cue: "最容易撞车的答辩入职节点", usedWhen: /最.*答辩.*入职|答辩.*撞/u },
  { cue: "跨境选择最容易漏掉的税务影响", usedWhen: /最.*税务|税务影响/u },
  { cue: "Offer里最容易忽略的试用期目标", usedWhen: /最.*试用期目标|Offer.*试用期/iu },
  { cue: "福利清单里最贵的隐性成本", usedWhen: /福利.*最.*隐性成本|最贵.*福利/u },
  { cue: "雇主担保最容易误判的证明条件", usedWhen: /担保.*最.*证明|最.*担保.*条件/u },
  { cue: "多系统申请最容易串错的资料", usedWhen: /多.*系统.*最.*资料|资料.*串错/u },
  { cue: "招聘官沟通最容易失礼的跟进间隔", usedWhen: /招聘官.*最.*跟进|跟进间隔/u },
  { cue: "跨境求职最容易断联的联系方式", usedWhen: /跨境.*最.*联系方式|最.*断联/u },
  { cue: "课程经历最难迁移成证据的一步", usedWhen: /课程.*最难.*证据|迁移.*证据/u },
  { cue: "论文项目最容易说空的工作价值", usedWhen: /论文.*最.*工作价值|最.*说空/u },
  { cue: "中文汇报最容易暴露的业务短板", usedWhen: /中文汇报.*最.*短板|业务短板/u },
  { cue: "协作故事最容易漏掉的利益相关方", usedWhen: /协作故事.*最.*利益相关方/u },
  { cue: "拒信复盘最容易下错的结论", usedWhen: /拒信.*最.*结论|复盘.*下错/u },
  { cue: "面试反问最容易问废的一题", usedWhen: /面试反问.*最|最.*反问/u },
  { cue: "工作城市选择最容易漏的总成本", usedWhen: /城市.*最.*总成本|总成本.*城市/u },
  { cue: "薪酬比较最容易混淆的奖金口径", usedWhen: /薪酬.*最.*奖金|奖金口径/u },
  { cue: "多场面试最容易撞掉的优先级", usedWhen: /多场面试.*最.*优先|面试.*撞.*优先/u },
  { cue: "校友访谈最容易浪费的一次提问", usedWhen: /校友访谈.*最.*提问|最.*校友.*问题/u },
  { cue: "行业准入最容易漏的证书门槛", usedWhen: /行业准入.*最.*证书|证书门槛/u },
  { cue: "目标企业最容易错过的岗位释放日", usedWhen: /企业.*最.*岗位释放|岗位释放日/u },
  { cue: "大公司求职最容易看错的部门职责", usedWhen: /大公司.*最.*部门|部门职责/u },
  { cue: "签约前最危险的一次试用期误判", usedWhen: /签约.*最危险.*试用期|试用期.*误判/u },
];

const EXECUTIVE_SUPERLATIVE_ANGLES: ContrarianAngle[] = [
  { cue: "离职最容易算错的通知期", usedWhen: /离职.*最.*通知期|通知期.*算错/u },
  { cue: "竞业里最危险的范围误读", usedWhen: /竞业.*最危险.*范围|范围.*误读/u },
  { cue: "高管离开最容易漏的递延奖金", usedWhen: /最.*递延奖金|递延奖金.*漏/u },
  { cue: "股权退出最容易忽略的回购条款", usedWhen: /股权.*最.*回购|回购条款/u },
  { cue: "转型最容易高估的家庭现金跑道", usedWhen: /转型.*最.*现金|现金跑道/u },
  { cue: "独立咨询最危险的客户集中度", usedWhen: /咨询.*最危险.*客户|客户集中度/u },
  { cue: "离开平台最容易失去的关键支持", usedWhen: /离开平台.*最.*支持|关键支持/u },
  { cue: "高管简历最容易说空的经营结果", usedWhen: /简历.*最.*经营结果|经营结果.*说空/u },
  { cue: "面试最难证明的一次危机判断", usedWhen: /面试.*最难.*危机|危机判断/u },
  { cue: "组织变革最容易抢错的个人功劳", usedWhen: /组织变革.*最.*功劳|个人功劳/u },
  { cue: "离岗最容易低估的团队继任风险", usedWhen: /离岗.*最.*继任|团队继任/u },
  { cue: "头衔里最容易虚高的授权范围", usedWhen: /头衔.*最.*授权|授权范围/u },
  { cue: "新岗位最危险的一条汇报线", usedWhen: /新岗位.*最危险.*汇报|汇报线/u },
  { cue: "职位最容易包装的预算权限", usedWhen: /职位.*最.*预算权限|预算权限/u },
  { cue: "高位工作最容易忽略的身体成本", usedWhen: /高位.*最.*身体|身体成本/u },
  { cue: "异地任职最容易牺牲的家庭安排", usedWhen: /异地任职.*最.*家庭|家庭安排/u },
  { cue: "换行业最容易看错的周期位置", usedWhen: /换行业.*最.*周期|周期位置/u },
  { cue: "新赛道最隐蔽的一项监管风险", usedWhen: /新赛道.*最.*监管|监管风险/u },
  { cue: "个人品牌最容易误认的可带走资产", usedWhen: /个人品牌.*最.*带走|可带走资产/u },
  { cue: "高管背调最容易失效的证明人", usedWhen: /背调.*最.*证明人|证明人.*失效/u },
  { cue: "新公司最容易含糊的首年任务书", usedWhen: /新公司.*最.*任务书|首年任务/u },
  { cue: "试用期最危险的一项经营指标", usedWhen: /试用期.*最危险.*经营指标/u },
  { cue: "薪酬包最容易混淆的浮动口径", usedWhen: /薪酬.*最.*浮动|浮动.*口径/u },
  { cue: "顾问合同最容易失控的责任边界", usedWhen: /顾问合同.*最.*边界|责任边界/u },
  { cue: "创业最容易高估的首批客户来源", usedWhen: /创业.*最.*客户来源|首批客户/u },
  { cue: "创业现金最容易漏算的停止条件", usedWhen: /创业.*最.*停止条件|现金.*停止/u },
  { cue: "合伙最难开口的一项退出机制", usedWhen: /合伙.*最难.*退出|退出机制/u },
  { cue: "转型学习最容易低估的补课周期", usedWhen: /转型.*最.*补课|学习周期/u },
  { cue: "方向验证最容易做假的一个信号", usedWhen: /验证.*最.*信号|信号.*做假/u },
  { cue: "家庭转型最容易忽略的一条底线", usedWhen: /家庭.*转型.*最.*底线|家庭底线/u },
];

/**
 * 拔河式标题最容易在历史积累后退回“回国/留海外、实习/全职、内推/海投”
 * 三四组熟悉选项。这里不是直接写标题，而是给模型轮换一组尚未使用的真实
 * 决策轴，让五个候选先换“选择变量”，再由模型按当前人设写成自然标题。
 */
const OVERSEAS_TUG_OF_WAR_ANGLES: TugOfWarAngle[] = [
  { cue: "喜欢的城市 vs 更匹配的岗位", usedWhen: /(?:城市|城).*?(?:岗位|岗)|(?:岗位|岗).*?(?:城市|城)/u },
  { cue: "热门行业 vs 更擅长的职能", usedWhen: /行业.*?(?:职能|擅长|对口岗)|(?:职能|擅长|对口岗).*?行业/u },
  { cue: "公司名气 vs 直属上级和带教", usedWhen: /名气|品牌.*带教|直属上级|经理质量/u },
  { cue: "起薪高低 vs 学习和成长空间", usedWhen: /起薪.*成长|成长.*起薪|工资.*学习/u },
  { cue: "轮岗管培 vs 专业职能深耕", usedWhen: /轮岗.*专业|管培.*职能|专业.*管培/u },
  { cue: "长期正式岗 vs 短期合同岗", usedWhen: /正式岗.*合同|长期.*短期合同|永久.*合同/u },
  { cue: "能办工签 vs 岗位真正对口", usedWhen: /工签.*对口|对口.*工签|签证.*岗位/u },
  { cue: "先完成毕业论文 vs 提前进岗实习", usedWhen: /论文.*实习|实习.*论文|毕业.*提前进岗/u },
  { cue: "先补项目作品集 vs 先约行业交流", usedWhen: /作品集.*交流|项目.*咖啡聊|行业交流.*项目/u },
  { cue: "集中准备已有面试 vs 继续扩大投递", usedWhen: /准备.*面试.*投递|投递.*已有面试|面试.*继续投/u },
  { cue: "只押一个城市 vs 同时跑多城面试", usedWhen: /一个城市.*多城|多城.*城市|跨城.*面试/u },
  { cue: "成熟大公司流程 vs 小团队真实职责", usedWhen: /大公司.*小团队|成熟.*小团队|流程.*真实职责/u },
  { cue: "体制内稳定岗 vs 市场化成长岗", usedWhen: /体制.*市场化|市场化.*体制/u },
  { cue: "校招统一管培 vs 部门直接招聘", usedWhen: /校招.*部门|统一管培.*直招|管培.*部门/u },
  { cue: "远程弹性办公 vs 线下团队协作", usedWhen: /远程.*线下|线下.*远程|弹性办公.*团队/u },
  { cue: "离家近照顾家庭 vs 去外地做对口岗", usedWhen: /离家近.*外地|家庭.*对口岗|外地.*家庭/u },
  { cue: "英文环境优势 vs 中文业务成长", usedWhen: /英文.*中文|中文.*英文|语言环境.*业务/u },
  { cue: "尽快入职止住空窗 vs 等毕业后再找", usedWhen: /尽快入职.*毕业|空窗.*毕业|毕业后.*入职/u },
  { cue: "固定底薪更稳 vs 浮动奖金上限高", usedWhen: /底薪.*奖金|奖金.*底薪|固定收入.*浮动/u },
  { cue: "岗位名称好看 vs 实际工作内容扎实", usedWhen: /岗位名称.*工作内容|头衔.*职责|title.*职责/iu },
  { cue: "追热门赛道 vs 用现有项目证据求职", usedWhen: /热门.*项目|赛道.*证据|项目证据.*热门/u },
  { cue: "通才型岗位 vs 专才型岗位", usedWhen: /通才.*专才|综合岗.*专业岗|专业岗.*综合岗/u },
  { cue: "先考证补门槛 vs 先练面试表达", usedWhen: /考证.*面试|证书.*表达|面试.*考证/u },
  { cue: "保留兼职收入 vs 辞掉兼职集中求职", usedWhen: /兼职.*集中求职|辞掉兼职|保留兼职/u },
  { cue: "先做行业调研 vs 直接找从业者验证", usedWhen: /行业调研.*从业者|从业者.*调研/u },
  { cue: "先准备中文简历 vs 先完成英文申请", usedWhen: /中文简历.*英文|英文申请.*中文/u },
  { cue: "接受销售入口岗 vs 等分析类岗位", usedWhen: /销售.*分析|分析.*销售/u },
  { cue: "优先培训体系 vs 优先自主负责项目", usedWhen: /培训.*自主|自主.*培训|体系.*负责项目/u },
];

const EXECUTIVE_TUG_OF_WAR_ANGLES: TugOfWarAngle[] = [
  { cue: "守住现有年薪 vs 接受降薪换赛道", usedWhen: /年薪.*降薪|降薪.*赛道/u },
  { cue: "继续争职位 vs 先拿外部市场报价", usedWhen: /职位.*报价|升职.*外部|外部.*晋升/u },
  { cue: "留大平台做一环 vs 去小公司管全盘", usedWhen: /大平台.*全盘|小公司.*全盘|平台.*小公司/u },
  { cue: "继续带团队 vs 回到一线做业务", usedWhen: /带团队.*一线|一线.*团队|管理.*业务/u },
  { cue: "拿竞业补偿休息 vs 放弃补偿尽快入职", usedWhen: /竞业.*入职|补偿.*入职/u },
  { cue: "先做副业验证 vs 直接出来创业", usedWhen: /副业.*创业|创业.*副业/u },
  { cue: "跟熟悉老板走 vs 去陌生平台重新证明", usedWhen: /老板.*陌生平台|跟.*老板.*平台/u },
  { cue: "保核心客户关系 vs 避开原行业利益冲突", usedWhen: /客户.*利益冲突|利益冲突.*客户/u },
  { cue: "选现金流稳定 vs 选长期股权空间", usedWhen: /现金流.*股权|股权.*现金流/u },
  { cue: "继续做专业负责人 vs 转综合经营岗位", usedWhen: /专业负责人.*经营|经营.*专业/u },
  { cue: "去成熟公司接盘 vs 进增长公司从零搭建", usedWhen: /成熟.*从零|接盘.*搭建|增长公司/u },
  { cue: "先休整恢复状态 vs 趁窗口立刻面试", usedWhen: /休整.*面试|恢复.*窗口/u },
  { cue: "留在总部资源中心 vs 去区域一线拿结果", usedWhen: /总部.*区域|资源中心.*一线/u },
  { cue: "守行业积累 vs 换职能重新定价", usedWhen: /行业积累.*职能|职能.*行业/u },
  { cue: "接受顾问型项目制 vs 回企业长期任职", usedWhen: /顾问.*企业|项目制.*长期任职/u },
  { cue: "优先决策权 vs 优先团队和预算规模", usedWhen: /决策权.*预算|团队.*决策权/u },
  { cue: "加入老同事创业 vs 自己独立验证方向", usedWhen: /老同事.*独立|同事.*创业.*自己/u },
  { cue: "先读书补知识 vs 先用项目验证能力", usedWhen: /读书.*项目|学习.*验证能力/u },
  { cue: "保城市和家庭稳定 vs 去异地拿更大职责", usedWhen: /城市.*异地|家庭.*异地|异地.*职责/u },
  { cue: "接受短期合同高单价 vs 选长期岗位稳定", usedWhen: /短期合同.*长期|高单价.*稳定/u },
  { cue: "继续服务单一大客户 vs 分散客户风险", usedWhen: /大客户.*分散|单一客户.*风险/u },
  { cue: "先补数字化能力 vs 先发挥行业人脉", usedWhen: /数字化.*人脉|人脉.*数字化/u },
  { cue: "选择高头衔低权限 vs 低头衔高权限", usedWhen: /头衔.*权限|title.*权限/iu },
  { cue: "继续做国内业务 vs 接海外市场职责", usedWhen: /国内.*海外|海外.*国内/u },
  { cue: "先拿董事会授权 vs 先确认经营指标", usedWhen: /董事会.*指标|授权.*经营指标/u },
  { cue: "接受空降改造任务 vs 选内部接班岗位", usedWhen: /空降.*接班|接班.*空降/u },
  { cue: "先签合伙协议 vs 先跑一轮真实订单", usedWhen: /合伙协议.*订单|订单.*协议/u },
  { cue: "保个人品牌曝光 vs 做幕后经营角色", usedWhen: /个人品牌.*幕后|曝光.*经营角色/u },
];

/**
 * 怀旧法不能长期只围绕“录取信/学校排名/工牌”改写。每一项都提供一组
 * 过去物件或场景与当下决策任务，模型只负责把关系写成当前视角的自然标题。
 * usedWhen 用来从该方法历史中移除已经使用过的坐标。
 */
const OVERSEAS_NOSTALGIA_ANGLES: NostalgiaAngle[] = [
  { cue: "过去写个人陈述，如今练面试自我介绍", usedWhen: /(?:个人)?陈述.*自我介绍|自我介绍.*(?:个人)?陈述|写陈述.*陪练/u },
  { cue: "过去找教授写推荐信，如今准备背调联系人", usedWhen: /(?:推荐信|写推).*背调|背调.*(?:推荐信|写推)/u },
  { cue: "过去排课程表，如今排网申截止日", usedWhen: /课程表.*截止|截止.*课程表/u },
  { cue: "过去盯成绩单，如今整理项目证据", usedWhen: /成绩单.*项目|项目证据.*成绩/u },
  { cue: "过去看校园地图，如今算上班通勤", usedWhen: /校园地图.*通勤|通勤.*校园/u },
  { cue: "过去签宿舍合同，如今读劳动合同", usedWhen: /宿舍.*劳动合同|劳动合同.*宿舍/u },
  { cue: "过去交学费收据，如今比较薪资条款", usedWhen: /学费.*薪资|薪资.*学费/u },
  { cue: "过去办学生签证，如今核对工签资格", usedWhen: /学生签证.*工签|工签.*学生签证/u },
  { cue: "过去做答辩PPT，如今准备案例面试", usedWhen: /答辩.*案例面试|案例面试.*答辩/u },
  { cue: "过去赶小组作业，如今讲团队项目贡献", usedWhen: /小组作业.*项目|团队项目.*小组/u },
  { cue: "过去约教授答疑，如今约招聘经理沟通", usedWhen: /教授.*招聘经理|招聘经理.*教授/u },
  { cue: "过去逛校园招聘会，如今写会后跟进邮件", usedWhen: /招聘会.*跟进|跟进邮件.*招聘会/u },
  { cue: "过去刷学生邮箱，如今等招聘官回复", usedWhen: /学生邮箱.*招聘|招聘官.*邮箱/u },
  { cue: "过去比课程排名，如今核对岗位职责", usedWhen: /课程排名.*岗位|岗位职责.*排名/u },
  { cue: "过去写社团职位，如今证明真实工作结果", usedWhen: /社团.*工作结果|工作结果.*社团/u },
  { cue: "过去记实习日记，如今整理项目追问", usedWhen: /实习日记.*追问|项目追问.*实习/u },
  { cue: "过去参加校园开放日，如今参加公司开放日", usedWhen: /校园开放日.*公司|公司开放日.*校园/u },
  { cue: "过去挑毕业礼服，如今准备面试着装", usedWhen: /毕业礼服.*面试|面试着装.*毕业/u },
  { cue: "过去拖行李去留学，如今订回国面试机票", usedWhen: /行李.*面试机票|机票.*行李/u },
  { cue: "过去做宿舍物品清单，如今看异地搬迁条件", usedWhen: /宿舍.*搬迁|搬迁.*宿舍/u },
  { cue: "过去看毕业典礼日程，如今确认入职日期", usedWhen: /毕业典礼.*入职|入职日期.*毕业/u },
  { cue: "过去加校友群，如今约行业从业者验证", usedWhen: /校友群.*从业者|行业从业者.*校友/u },
  { cue: "过去改论文脚注，如今改简历项目要点", usedWhen: /论文.*简历|简历.*论文/u },
  { cue: "过去整理实验数据，如今整理作品集证据", usedWhen: /实验数据.*作品集|作品集.*实验/u },
  { cue: "过去申请奖学金，如今准备薪资沟通", usedWhen: /奖学金.*薪资|薪资沟通.*奖学金/u },
  { cue: "过去开实习证明，如今准备背景调查", usedWhen: /实习证明.*背景|背景调查.*实习/u },
  { cue: "过去纠结选课，如今比较两个岗位", usedWhen: /选课.*岗位|岗位.*选课/u },
  { cue: "过去看模块分数，如今看能力匹配", usedWhen: /模块.*能力|能力匹配.*分数/u },
  { cue: "过去请导师推荐，如今请前主管做证明", usedWhen: /导师.*主管|前主管.*导师/u },
  { cue: "过去担心签证到期，如今担心试用期适配", usedWhen: /签证.*试用期|试用期.*签证/u },
  { cue: "过去核对入学材料，如今核对Offer条款", usedWhen: /入学材料.*offer|offer.*入学/iu },
  { cue: "过去选学校城市，如今选工作城市", usedWhen: /学校城市.*工作城市|工作城市.*学校/u },
  { cue: "过去看课程师资，如今看直属经理", usedWhen: /课程师资.*经理|直属经理.*师资/u },
  { cue: "过去参加毕业舞会，如今参加评估中心", usedWhen: /毕业舞会.*评估|评估中心.*舞会/u },
  { cue: "过去查图书馆开放时间，如今查笔试窗口", usedWhen: /图书馆.*笔试|笔试窗口.*图书馆/u },
  { cue: "过去打印学生证，如今准备入职证件", usedWhen: /学生证.*入职|入职证件.*学生/u },
];

const EXECUTIVE_NOSTALGIA_ANGLES: NostalgiaAngle[] = [
  { cue: "过去递名片，如今拿外部市场报价", usedWhen: /名片.*报价|市场报价.*名片/u },
  { cue: "过去等升职邮件，如今核对合同条款", usedWhen: /升职邮件.*合同|合同条款.*升职/u },
  { cue: "过去拿办公室钥匙，如今盘点客户关系", usedWhen: /办公室钥匙.*客户|客户关系.*钥匙/u },
  { cue: "过去看团队花名册，如今写能力证据", usedWhen: /花名册.*能力|能力证据.*团队/u },
  { cue: "过去等年终奖通知，如今算家庭现金流", usedWhen: /年终奖.*现金流|现金流.*年终奖/u },
  { cue: "过去拿绩效A，如今准备面试案例", usedWhen: /绩效.*面试案例|面试案例.*绩效/u },
  { cue: "过去批预算，如今确认新岗位决策权", usedWhen: /预算.*决策权|决策权.*预算/u },
  { cue: "过去写董事会纪要，如今记录市场反馈", usedWhen: /董事会.*市场反馈|市场反馈.*董事会/u },
  { cue: "过去戴公司工牌，如今签顾问合同", usedWhen: /工牌.*顾问合同|顾问合同.*工牌/u },
  { cue: "过去坐高管办公室，如今排外部面试", usedWhen: /高管办公室.*面试|外部面试.*办公室/u },
  { cue: "过去领行业奖杯，如今看客户续约", usedWhen: /奖杯.*续约|客户续约.*奖/u },
  { cue: "过去攒培训证书，如今整理项目结果", usedWhen: /培训证书.*项目|项目结果.*证书/u },
  { cue: "过去看组织架构，如今核对真实职责", usedWhen: /组织架构.*职责|真实职责.*架构/u },
  { cue: "过去追职位头衔，如今追岗位权限", usedWhen: /头衔.*权限|岗位权限.*职位/u },
  { cue: "过去等调薪信，如今拿市场Offer比较", usedWhen: /调薪.*offer|offer.*调薪/iu },
  { cue: "过去靠公司介绍，如今重写个人简历", usedWhen: /公司介绍.*简历|个人简历.*公司/u },
  { cue: "过去赴客户饭局，如今看销售漏斗", usedWhen: /客户饭局.*漏斗|销售漏斗.*饭局/u },
  { cue: "过去做扩编计划，如今准备接班交接", usedWhen: /扩编.*接班|接班.*扩编/u },
  { cue: "过去写季度报告，如今写能力账本", usedWhen: /季度报告.*能力|能力账本.*季度/u },
  { cue: "过去排出差行程，如今算新岗位通勤", usedWhen: /出差.*通勤|岗位通勤.*出差/u },
  { cue: "过去看股权授予，如今核对归属条件", usedWhen: /股权授予.*归属|归属条件.*股权/u },
  { cue: "过去领司龄奖，如今写离职交接", usedWhen: /司龄.*离职|离职交接.*司龄/u },
  { cue: "过去读管理书，如今跑真实验证项目", usedWhen: /管理书.*验证项目|项目验证.*管理/u },
  { cue: "过去站公司年会舞台，如今试个人品牌", usedWhen: /年会.*个人品牌|个人品牌.*年会/u },
  { cue: "过去让助理排日程，如今自己排客户", usedWhen: /助理.*客户|客户.*助理/u },
  { cue: "过去管大团队，如今独立交付项目", usedWhen: /大团队.*独立|独立交付.*团队/u },
  { cue: "过去调用公司资源，如今测试付费咨询", usedWhen: /公司资源.*咨询|付费咨询.*资源/u },
  { cue: "过去做年度预算，如今算转型试错金", usedWhen: /年度预算.*试错|试错金.*预算/u },
  { cue: "过去参加战略会，如今约行业访谈", usedWhen: /战略会.*访谈|行业访谈.*战略/u },
  { cue: "过去审核下属简历，如今修改自己简历", usedWhen: /下属简历.*自己|自己简历.*下属/u },
  { cue: "过去签客户大单，如今验证第一笔个人收入", usedWhen: /客户.*个人收入|个人收入.*大单/u },
  { cue: "过去做继任计划，如今安排自己的下一站", usedWhen: /继任.*下一站|下一站.*继任/u },
  { cue: "过去谈部门目标，如今谈个人边界", usedWhen: /部门目标.*个人边界|个人边界.*部门/u },
  { cue: "过去等猎头职位，如今主动找市场反馈", usedWhen: /猎头.*市场反馈|市场反馈.*猎头/u },
  { cue: "过去看行业排名，如今看能力可迁移性", usedWhen: /行业排名.*迁移|可迁移.*排名/u },
  { cue: "过去做并购方案，如今比较两条职业路", usedWhen: /并购.*职业路|职业.*并购/u },
];

/**
 * 盘点法不能长期只把“简历/网申/面试/投递”轮换数字。下面的对象都是正文
 * 可以真实逐项交付的检查对象；每次生成只分配尚未在该方法历史里出现的三类，
 * 让模型先换盘点对象和使用场景，再决定自然标题表达。
 */
const OVERSEAS_INVENTORY_ANGLES: InventoryAngle[] = [
  { cue: "跨时区面试时段冲突", usedWhen: /时区|面试时段/u },
  { cue: "毕业签证与工签衔接节点", usedWhen: /毕业签证|工签衔接/u },
  { cue: "背调联系人可用性", usedWhen: /背调联系人|推荐人可用/u },
  { cue: "异地入职搬迁提前量", usedWhen: /搬迁提前|异地入职/u },
  { cue: "入职证件与学历认证材料", usedWhen: /入职证件|学历认证/u },
  { cue: "评估中心小组任务角色", usedWhen: /评估中心|小组任务角色/u },
  { cue: "案例面试数据证据", usedWhen: /案例面试.*数据|数据证据/u },
  { cue: "岗位语言使用场景", usedWhen: /语言使用|工作语言/u },
  { cue: "学位证明出具时间", usedWhen: /学位证明|毕业证明/u },
  { cue: "跨境税务与居留影响", usedWhen: /跨境税务|税务.*居留/u },
  { cue: "试用期目标和考核口径", usedWhen: /试用期目标|考核口径/u },
  { cue: "福利条款与隐性成本", usedWhen: /福利条款|隐性成本/u },
  { cue: "雇主担保的证明要求", usedWhen: /雇主担保|担保证明/u },
  { cue: "不同申请系统的账号资料", usedWhen: /申请系统|账号资料/u },
  { cue: "招聘官沟通触点", usedWhen: /招聘官.*触点|沟通触点/u },
  { cue: "跨境电话与收件地址", usedWhen: /跨境电话|收件地址/u },
  { cue: "课程模块和岗位能力映射", usedWhen: /课程模块|能力映射/u },
  { cue: "论文研究方法的工作证据", usedWhen: /研究方法|论文.*证据/u },
  { cue: "英文汇报与中文表达样本", usedWhen: /英文汇报|中文表达/u },
  { cue: "利益相关方协作故事", usedWhen: /利益相关方|协作故事/u },
  { cue: "拒信原因记录字段", usedWhen: /拒信原因|拒信.*记录/u },
  { cue: "面试反问题库", usedWhen: /反问.*问题|面试反问/u },
  { cue: "通勤与租房总成本", usedWhen: /通勤.*租房|租房.*成本/u },
  { cue: "底薪奖金和签字费口径", usedWhen: /底薪.*奖金|签字费/u },
  { cue: "年假与最早入职日期", usedWhen: /年假.*入职|最早入职/u },
  { cue: "知识产权与保密条款", usedWhen: /知识产权|保密条款/u },
  { cue: "校友访谈验证问题", usedWhen: /校友访谈|校友.*验证/u },
  { cue: "行业准入证书门槛", usedWhen: /准入证书|证书门槛/u },
  { cue: "目标企业岗位释放节奏", usedWhen: /岗位释放|企业.*节奏/u },
  { cue: "同公司不同部门职责差异", usedWhen: /部门职责|不同部门/u },
  { cue: "岗位级别和汇报对象信号", usedWhen: /岗位级别|汇报对象/u },
  { cue: "中英文岗位名称同义词", usedWhen: /岗位名称.*同义|中英文岗位/u },
  { cue: "ATS关键词缺口", usedWhen: /ATS|关键词缺口/iu },
  { cue: "投递后的跟进间隔", usedWhen: /跟进间隔|跟进频率/u },
  { cue: "多场面试撞期处理", usedWhen: /面试撞期|多场面试/u },
  { cue: "毕业答辩与入职撞期", usedWhen: /答辩.*入职|入职.*答辩/u },
  { cue: "家庭求职预算边界", usedWhen: /求职预算|预算边界/u },
  { cue: "过渡住宿安排", usedWhen: /过渡住宿|临时住宿/u },
  { cue: "医疗保险衔接", usedWhen: /医疗保险|医保衔接/u },
  { cue: "设备与远程办公条件", usedWhen: /远程办公.*条件|办公设备/u },
  { cue: "入职前作品保密处理", usedWhen: /作品.*保密|保密处理/u },
  { cue: "实习转正评估标准", usedWhen: /实习转正|转正标准/u },
];

const EXECUTIVE_INVENTORY_ANGLES: InventoryAngle[] = [
  { cue: "离职通知期和交接边界", usedWhen: /通知期|交接边界/u },
  { cue: "竞业范围和补偿条件", usedWhen: /竞业.*补偿|补偿.*竞业/u },
  { cue: "递延奖金兑现时间", usedWhen: /递延奖金|奖金兑现/u },
  { cue: "股权归属与回购条款", usedWhen: /股权归属|回购条款/u },
  { cue: "家庭现金流安全月数", usedWhen: /现金流.*月|安全月数/u },
  { cue: "客户集中度风险", usedWhen: /客户集中|集中度/u },
  { cue: "关键利益相关方支持", usedWhen: /利益相关方.*支持|关键支持/u },
  { cue: "可迁移的经营结果", usedWhen: /经营结果|可迁移.*结果/u },
  { cue: "危机处理案例证据", usedWhen: /危机处理|危机案例/u },
  { cue: "组织变革阶段成果", usedWhen: /组织变革|变革.*成果/u },
  { cue: "团队继任与离岗风险", usedWhen: /团队继任|离岗风险/u },
  { cue: "董事会授权范围", usedWhen: /董事会授权|授权范围/u },
  { cue: "新岗位汇报线", usedWhen: /汇报线|汇报关系/u },
  { cue: "预算控制权限", usedWhen: /预算控制|预算权限/u },
  { cue: "差旅强度和时间成本", usedWhen: /差旅强度|差旅.*成本/u },
  { cue: "异地任职与家庭安排", usedWhen: /异地任职|家庭安排/u },
  { cue: "身体负荷和恢复周期", usedWhen: /身体负荷|恢复周期/u },
  { cue: "行业周期位置", usedWhen: /行业周期|周期位置/u },
  { cue: "监管变化风险", usedWhen: /监管变化|监管风险/u },
  { cue: "保密义务和公开边界", usedWhen: /保密义务|公开边界/u },
  { cue: "个人品牌可带走资产", usedWhen: /个人品牌.*资产|可带走资产/u },
  { cue: "背调证明人可用性", usedWhen: /背调证明|证明人/u },
  { cue: "新公司真实任务书", usedWhen: /任务书|真实任务/u },
  { cue: "试用期经营指标", usedWhen: /试用期.*指标|经营指标/u },
  { cue: "固定薪酬和浮动薪酬", usedWhen: /固定薪酬|浮动薪酬/u },
  { cue: "顾问合同责任边界", usedWhen: /顾问合同|责任边界/u },
  { cue: "首批客户线索来源", usedWhen: /首批客户|客户线索/u },
  { cue: "创业现金跑道", usedWhen: /现金跑道|创业.*现金/u },
  { cue: "合伙人退出机制", usedWhen: /退出机制|合伙人.*退出/u },
  { cue: "客户关系归属", usedWhen: /客户关系归属|客户归属/u },
  { cue: "知识产权归属", usedWhen: /知识产权归属|产权归属/u },
  { cue: "社保税务衔接", usedWhen: /社保.*税务|税务.*社保/u },
  { cue: "退休与长期保障影响", usedWhen: /退休.*保障|长期保障/u },
  { cue: "能力缺口学习周期", usedWhen: /能力缺口|学习周期/u },
  { cue: "数字化工具熟练度", usedWhen: /数字化工具|工具熟练/u },
  { cue: "跨文化管理证据", usedWhen: /跨文化管理|跨文化.*证据/u },
  { cue: "低成本方向验证实验", usedWhen: /验证实验|低成本验证/u },
  { cue: "伴侣对转型的共识", usedWhen: /伴侣.*共识|转型共识/u },
  { cue: "子女教育安排", usedWhen: /子女教育|教育安排/u },
  { cue: "原团队挽留条件", usedWhen: /团队挽留|挽留条件/u },
  { cue: "猎头职位信息真实性", usedWhen: /职位信息.*真实|猎头.*真实性/u },
  { cue: "岗位决策权与责任匹配", usedWhen: /决策权.*责任|责任.*决策权/u },
];

function isOverseasBusinessLine(businessLine: string | undefined) {
  return businessLine === "overseas_student"
    || /留学生|海外秋招|回国求职/u.test(businessLine ?? "");
}

function tugOfWarAngleDirective(businessLine: string | undefined, historyTitles: string[]) {
  const pool = isOverseasBusinessLine(businessLine)
    ? OVERSEAS_TUG_OF_WAR_ANGLES
    : EXECUTIVE_TUG_OF_WAR_ANGLES;
  const unused = pool.filter((angle) => !historyTitles.some((title) => angle.usedWhen.test(title)));
  if (!unused.length) return "";
  const selected = unused.slice(0, 3);
  return `【本轮强制使用的未用取舍轴】三个候选分别使用以下三个取舍轴，不得再回到历史里已经出现的地区去留、实习/全职、内推/海投等旧轴：
${selected.map((angle, index) => `${index + 1}. ${angle.cue}`).join("\n")}
候选1只使用第1组的两端，候选2只使用第2组的两端，候选3只使用第3组的两端；必须保留各自两端的真实含义，严禁跨编号拆词拼接或退回旧轴。
标题仍需符合当前业务和视角；取舍轴只是决策关系，不能照抄说明句。`;
}

function nostalgiaAngleDirective(
  businessLine: string | undefined,
  historyTitles: string[],
  persona?: GrowthPersona,
) {
  const overseas = isOverseasBusinessLine(businessLine);
  const pool = overseas
    ? OVERSEAS_NOSTALGIA_ANGLES
    : EXECUTIVE_NOSTALGIA_ANGLES;
  const unused = pool.filter((angle) => !historyTitles.some((title) => angle.usedWhen.test(title)));
  if (!unused.length) return "";
  const selected = unused.slice(0, 3);
  const cues = overseas && persona === "buyer"
    ? selected.map((angle) => angle.cue
      .replace(/^过去/u, "以前陪孩子")
      .replace(/如今/u, "现在陪他"))
    : selected.map((angle) => angle.cue);
  return `【本轮强制使用的未用今昔坐标】三个候选分别使用以下三组过去物件/场景与当下任务，不得退回录取信、学校排名、工牌等已经反复出现的旧坐标：
${cues.map((cue, index) => `${index + 1}. ${cue}`).join("\n")}
候选1只使用第1组今昔关系，候选2只使用第2组，候选3只使用第3组；每条必须同时保留本组“过去物件/场景”和“当下任务”，严禁把不同编号的前后半句重新拼接。
标题必须保持当前业务和视角，买家写亲历、专家写判断、商家写服务观察；不能照抄说明句。`;
}

function inventoryAngleDirective(businessLine: string | undefined, historyTitles: string[]) {
  const pool = isOverseasBusinessLine(businessLine)
    ? OVERSEAS_INVENTORY_ANGLES
    : EXECUTIVE_INVENTORY_ANGLES;
  const unused = pool.filter((angle) => !historyTitles.some((title) => angle.usedWhen.test(title)));
  if (!unused.length) return "";
  const selected = unused.slice(0, 3);
  return `【本轮强制使用的未用盘点对象】三个候选分别盘点以下三类具体对象，不得退回简历、网申、投递、面试等已经反复出现的旧对象：
${selected.map((angle, index) => `${index + 1}. ${angle.cue}`).join("\n")}
候选1只盘点第1项，候选2只盘点第2项，候选3只盘点第3项；标题必须让人看出盘点的具体对象或使用场景，不能只写“这5项/几个坑”。
标题仍需符合当前业务和视角；数字只是结构，换数字不算换题。`;
}

function contrarianAngleDirective(businessLine: string | undefined, historyTitles: string[]) {
  const pool = isOverseasBusinessLine(businessLine)
    ? OVERSEAS_CONTRARIAN_ANGLES
    : EXECUTIVE_CONTRARIAN_ANGLES;
  const unused = pool.filter((angle) => !historyTitles.some((title) => angle.usedWhen.test(title)));
  if (!unused.length) return "";
  const selected = unused.slice(0, 3);
  return `【本轮强制使用的未用反认知关系】三个候选分别使用以下三组“表面优势→隐藏代价”，不得退回学历高、实习多、海投多、方向错等已经反复出现的旧关系：
${selected.map((angle, index) => `${index + 1}. ${angle.cue}`).join("\n")}
候选1只使用第1组关系，候选2只使用第2组，候选3只使用第3组；标题必须同时让人看出表面优势与隐藏代价，严禁跨编号拼接或只写“未必更好”。
标题仍需符合当前业务和视角；买家写亲历或当事人处境，专家写判断，商家写服务观察，不能照抄说明句。`;
}

function humanPainAngleDirective(businessLine: string | undefined, historyTitles: string[]) {
  const pool = isOverseasBusinessLine(businessLine)
    ? OVERSEAS_HUMAN_PAIN_ANGLES
    : EXECUTIVE_HUMAN_PAIN_ANGLES;
  const unused = pool.filter((angle) => !historyTitles.some((title) => angle.usedWhen.test(title)));
  if (!unused.length) return "";
  const selected = unused.slice(0, 3);
  return `【本轮强制使用的未用痛点现场】三个候选分别进入以下三个真实触发现场，不得退回“焦虑、没回音、不敢说”等没有新人物动作和场景的旧表达：
${selected.map((angle, index) => `${index + 1}. ${angle.cue}`).join("\n")}
候选1只写第1个现场，候选2只写第2个，候选3只写第3个；标题必须出现本现场可辨认的物件、人物或动作，并呈现当事人的真实顾虑。
标题仍需符合当前业务和视角；不能跨编号拼接，也不能照抄说明句。`;
}

function scarceMaterialAngleDirective(businessLine: string | undefined, historyTitles: string[]) {
  const pool = isOverseasBusinessLine(businessLine)
    ? OVERSEAS_SCARCE_MATERIAL_ANGLES
    : EXECUTIVE_SCARCE_MATERIAL_ANGLES;
  const unused = pool.filter((angle) => !historyTitles.some((title) => angle.usedWhen.test(title)));
  if (!unused.length) return "";
  const selected = unused.slice(0, 3);
  return `【本轮强制使用的未用资料任务】三个候选分别交付以下三种具体资料及其决策用途，不得退回泛“路线图、自查表、清单直接用”：
${selected.map((angle, index) => `${index + 1}. ${angle.cue}`).join("\n")}
候选1只交付第1种资料，候选2只交付第2种，候选3只交付第3种；标题必须让人看出资料载体或具体任务，title_promise 必须说明正文会实际交付什么。
标题仍需符合当前业务和视角；不能只把“表”换成“卡”，也不能照抄说明句。`;
}

function superlativeAngleDirective(businessLine: string | undefined, historyTitles: string[]) {
  const pool = isOverseasBusinessLine(businessLine)
    ? OVERSEAS_SUPERLATIVE_ANGLES
    : EXECUTIVE_SUPERLATIVE_ANGLES;
  const unused = pool.filter((angle) => !historyTitles.some((title) => angle.usedWhen.test(title)));
  if (!unused.length) return "";
  const selected = unused.slice(0, 3);
  return `【本轮强制使用的未用高代价风险】三个候选分别聚焦以下三种具体风险，不得退回“最危险的方向误判、最容易漏的一步”等空壳：
${selected.map((angle, index) => `${index + 1}. ${angle.cue}`).join("\n")}
候选1只写第1项风险，候选2只写第2项，候选3只写第3项；标题必须说清风险对象，title_promise 必须交代该风险成立的条件和避免方式。
标题仍需符合当前业务和视角；极限词只能放大有事实逻辑的风险，不能承诺结果。`;
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
  structureCards?: BenchmarkStructureCard[];
  excludeTitles?: string[];
  /** 本轮刚被拒绝或已选中的标题，必须优先进入有限提示词窗口。 */
  priorityExcludeTitles?: string[];
  directionLocks?: Array<{
    method_id: TitleMethodId;
    current_title: string;
    title_promise: string;
    target_user: string;
    pain: string;
    origin_force?: string;
    conflict_judgement?: string;
  }>;
  diversityHistory?: Array<{
    method_id?: TitleMethodId;
    title?: string;
    sentence_frame?: string;
    mother_topic_key?: string;
    material_signature?: string;
    batch_index?: number;
  }>;
  /** 常规生成看近5批；定向补题可扩大到更长历史，避免回到更早的旧母题。 */
  diversityHistoryBatchLimit?: number;
  context?: AccountContext;
}) {
  // 历史全集由服务端做确定性去重；调用方已按“最新在前”排序，提示词只带最近一段，
  // 避免长期使用后挤爆上下文。此前 slice(-160) 会错误地把最旧的标题交给模型，
  // 使它看不见刚生成的方向并反复提近题。
  const exclude = Array.from(new Set([
    ...(input.priorityExcludeTitles ?? []),
    ...(input.excludeTitles ?? []),
  ].filter(Boolean))).slice(0, 160);
  const diversityHistoryBatchLimit = Math.max(
    1,
    Math.min(50, input.diversityHistoryBatchLimit ?? 5),
  );
  const sourceByMethod = new Map((input.sources ?? []).map((source) => [source.method_id, source]));
  const cardByMethod = new Map((input.structureCards ?? []).map((card) => [card.method_id, card]));
  const lockByMethod = new Map((input.directionLocks ?? []).map((lock) => [lock.method_id, lock]));
  const diversityByMethod = new Map(input.methods.map((method) => [
    method.id,
    (input.diversityHistory ?? []).filter((item) =>
      item.method_id === method.id
      && (item.batch_index ?? Number.MAX_SAFE_INTEGER) < diversityHistoryBatchLimit
    ),
  ]));
  const methodLines = input.methods.map((method) => {
    const source = sourceByMethod.get(method.id);
    const card = cardByMethod.get(method.id);
    const lock = lockByMethod.get(method.id);
    const diversity = diversityByMethod.get(method.id) ?? [];
    const recentFrames = Array.from(new Set(diversity.map((item) => item.sentence_frame).filter(Boolean)));
    const recentMothers = Array.from(new Set(diversity.map((item) => item.mother_topic_key).filter(Boolean)));
    const recentMaterials = Array.from(new Set(diversity.map((item) => item.material_signature).filter(Boolean)));
    const diversityPlaybook = NATIVE_METHOD_DIVERSITY_PLAYBOOK[method.id];
    const methodHistoryTitles = Array.from(new Set([
      // 成功批次保留方法归属，可用于精准轮换。
      ...(input.diversityHistory ?? [])
        .filter((item) => item.method_id === method.id && item.title)
        .map((item) => item.title as string),
      // 失败批次不会进入 diversityHistory，但服务端会把其候选放进排除池。
      // 若这里不读取排除池，用户再次点击时角度选择器仍会分配刚失败过的
      // 三个坐标，形成“每次都在原地重试”的错觉。
      ...(input.priorityExcludeTitles ?? []),
      ...(input.excludeTitles ?? []),
    ].filter(Boolean))).slice(0, 200);
    const dynamicAngleDirective = !lock
      ? method.id === "tug_of_war"
        ? tugOfWarAngleDirective(input.context?.businessLine, methodHistoryTitles)
        : method.id === "nostalgia"
          ? nostalgiaAngleDirective(input.context?.businessLine, methodHistoryTitles, input.persona)
          : method.id === "inventory"
            ? inventoryAngleDirective(input.context?.businessLine, methodHistoryTitles)
            : method.id === "contrarian"
              ? contrarianAngleDirective(input.context?.businessLine, methodHistoryTitles)
              : method.id === "human_pain"
                ? humanPainAngleDirective(input.context?.businessLine, methodHistoryTitles)
                : method.id === "scarce_material"
                  ? scarceMaterialAngleDirective(input.context?.businessLine, methodHistoryTitles)
                  : method.id === "superlative"
                    ? superlativeAngleDirective(input.context?.businessLine, methodHistoryTitles)
                    : ""
      : "";
    return [
      `${method.order}. method_id=${method.id}；方法=${method.label}；要求=${method.instruction}`,
      diversityPlaybook ? `【该方法动态供题要求】${diversityPlaybook}` : "",
      dynamicAngleDirective,
      card
        ? `已锁定结构卡=${JSON.stringify({
          id: card.id,
          sentence_structure: card.sentence_structure,
          conflict_structure: card.conflict_structure,
          audience_situation: card.audience_situation,
          emotional_hook: card.emotional_hook,
          promised_result: card.promised_result,
          inheritable_element: card.inheritable_element,
          replacement_requirement: card.replacement_requirement,
          semantic_slots: card.semantic_slots,
          semantic_status: card.semantic_status,
          forbidden_copy_elements: card.forbidden_copy_elements,
        })}`
        : source
          ? "该方法绑定了母题，但没有锁定结构卡；不得为它生成标题"
          : "无外部母题要求",
      lock
        ? `【单槽标题方向锁】这是同一选题方向的标题改写，不是重新选题。必须保持以下内容不变，只能更换标题措辞：
当前标题=${lock.current_title}
目标用户=${lock.target_user}
核心处境/痛点=${lock.pain}
正文唯一承诺=${lock.title_promise}
具体场景依据=${lock.origin_force || "沿用当前标题场景"}
核心冲突依据=${lock.conflict_judgement || "沿用当前标题冲突"}
每个 title_candidates[].title_promise 必须原样返回正文唯一承诺。所有候选标题必须属于同一方向，不得换人物、问题、结果、资料数量或对立选项。`
        : "",
      diversity.length && !lock
        ? `【近期多样性禁区】不能只换数字或近义词。优先避开：
近期句式=${recentFrames.join("、") || "无"}
近期母题=${recentMothers.join("、") || "无"}
近期人物场景结果组合=${recentMaterials.join("、") || "无"}
请主动更换具体人物、场景、动作、冲突或阶段结果。`
        : "",
    ].join("\n");
  });
  const singleTitleRewrite = (input.directionLocks ?? []).length > 0;
  // 留学生业务的买家账号在产品定义上就是「留学生家长」，不是留学生本人。
  // 不能只依赖正文承诺补足这一点：运营在选题页先看见的是标题，因此标题本身
  // 必须给出可辨认的亲子关系线索。
  const parentNarrative = input.persona === "buyer"
    && (isOverseasBusinessLine(input.context?.businessLine)
      || /留学生|海外秋招|回国求职/u.test(input.targetUser)
      || /家长|妈妈|爸爸|父母|陪娃|陪孩子/u.test(`${input.context?.oneLiner || ""} ${input.targetUser}`));
  const personaContinuityRule = parentNarrative
    ? "- 【人设连续性硬性规则】当前账号是留学生家长。每一个标题本身都必须包含孩子/娃/家长/我家/陪孩子/陪娃/儿女中的至少一个亲子关系线索；标题里的“我/我们”只能是家长。不得把账号写成留学生本人，也不能把家长身份只留给正文承诺（例如“室友都拿到面试，我还在投递”“先补实习，还是直接投递？”都不合格）。"
    : "";
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
- 【语言与事实硬性规则】只写自然、口语化的简体中文。不得输出繁体字、拼音/英文碎片与中文硬拼（AI、Offer、QS 等常见术语除外）、生造黑话或无意义词组。不要把自然表达硬缩成“投岗”“蹲岗”等行业黑话，应写“投岗位”“投递”或完整动作。不得编造或暗示未经当前账号事实支持的年龄、前任身份、公司、学校、收入、营收、团队人数、Offer 数量、日期、阶段成果；没有已确认事实时，请使用“有人/不少人/这类人”等泛化表达，不能用具体数字凑冲突。
${personaContinuityRule}
- 【真实换题规则】本轮标题必须相对历史标题实质换题：至少更换人物、场景、冲突、正文承诺、句式中的两项。只改数字、标点、语气词、繁简体、近义词或前后顺序，都不算新标题。不要复用历史标题的核心人物+场景+冲突组合。
- 【原力要大】标题外层必须有至少 1 个具体实在、有画面的"原力词"：目标受众生活里能看见、摸到、遇到的物件、角色、场景或动作。例：工资条、合同、老板、合伙人、客户、会议室、工位、预算表、PPT、手机消息、加班、汇报、签合同、拍板、微信对话框、面试通知、离职交接、绩效面谈。禁止只用泛虚词做标题入口，如：成长、认知、觉醒、自由、焦虑、选择、结构、位置、命运、人生、体面；这些词可以进正文解释，但不能单独承担标题入口。
- 【冲突要大】每个选题必须有反常识、反预期或强落差，让用户一眼看到"怎么会这样"的张力。冲突可以来自：想要稳定 vs 想要自由、职位很高 vs 离开平台不值钱、努力很多 vs 结果不变、想转型 vs 家庭/收入/年龄限制、以为是机会 vs 后来发现是坑。没有冲突的平铺题、纯建议题、纯清单题不进入候选池。
- 每个候选题必须可比较、可复盘、可延展，并写清该标题自己要兑现的唯一承诺。候选标题与正文承诺必须一一绑定，不能让三个标题共用首选标题的承诺。
- 每种方法同时给出 3 个彼此明显不同的 title_candidates。三个候选不能只是改标点、数字或语气词，必须主动轮换句式和具体素材，但仍严格属于同一个方法。${singleTitleRewrite ? "当前是单槽改写，三个候选必须保持方向锁中的目标用户、核心处境、正文承诺和数量完全不变；三条 title_promise 都原样返回方向锁中的正文唯一承诺。" : ""}
- 来源型方法已经在上一步完成母题拆解。你只能使用“已锁定结构卡”生成，不会看到原标题，也不得自行重新解释母题。
- 蹭流量必须能从新标题中识别出所绑定热点的事件、人物或社会冲突；相同产品迁移产品表达或选择场景；相同功效迁移解决问题或降低风险的功效；相似人群迁移人群处境；终极结果相同迁移最终利益；爆款框架迁移句式与冲突结构。
- 绑定母题的标题不得调用与结构卡无关的通用模板。必须继承结构卡指定的元素，并完成replacement_requirement。
- 每张结构卡的 semantic_slots 都列出了必须迁移的原题关系。required_slot_keys 中的每一项都要在新标题中用当前业务的等价人物、动作、渠道、结果或关系呈现；不要求复用原词，但不能省掉关系后写成泛化标题。
- 对标方法必须先沿用结构卡中的“关系”再替换为当前业务和当前视角：只迁移句式、冲突、功效、人群处境或最终利益，绝不能把原题的人物履历、公司、金额、年龄、成绩或结果带进新标题；若无法在20字内完成可解释迁移，请省略该候选，禁止编造。
${exclude.length ? `- 严禁与以下已生成选题重复或近似：${exclude.join(" / ")}` : ""}

输出 JSON：
{
  "objective": "本轮目标",
  "experiment_hypothesis": "本轮实验假设",
  "topics": [
    {
      "method_id": "必须与给定method_id完全一致",
      "title_candidates": [
        {"title": "候选题目1（20字以内，含标点）", "title_promise": "候选题目1正文必须兑现的唯一承诺"},
        {"title": "候选题目2（20字以内，含标点）", "title_promise": "候选题目2正文必须兑现的唯一承诺"},
        {"title": "候选题目3（20字以内，含标点）", "title_promise": "候选题目3正文必须兑现的唯一承诺"}
      ]
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

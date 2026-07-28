/**
 * 标题质量门禁（纯函数）。
 *
 * 这个模块不决定“该写什么”，只负责把明显不可交付的标题挡在生成链路内：
 * - 繁体字 / 乱码 / 超长；
 * - 没有业务事实依据的角色、金额、成绩、日期、公司断言；
 * - 明显不自然的生造黑话；
 * - 明显残缺、缺少必要宾语或补语的半句话；
 * - 仅替换少量词语的“换一批”。
 *
 * 所有函数都不依赖数据库或模型，方便在生成前、重试后和保存前重复调用。
 */

export type TitleQualityReason =
  | "empty"
  | "too_long"
  | "traditional_chinese"
  | "garbled_latin_cjk"
  | "unsupported_factual_claim"
  | "unnatural_jargon"
  | "incomplete_sentence"
  | "generic_title";

export interface TitleSemanticSignature {
  audience: string;
  scenario: string;
  conflict: string;
  promise: string;
  frame: string;
  /** 用于解释为何两个标题被判为近似，不包含模型推理。 */
  anchors: string[];
}

export interface TitleQualityOptions {
  /** 发布标题长度上限，默认 20 字（标点也计入）。 */
  maxLength?: number;
  /**
   * 可被当前业务事实支持的原文片段。传入后，完全被这些事实覆盖的具体断言不再拦截。
   * 例如：[`曾任国企高管`]。
   */
  supportedFacts?: readonly string[];
}

export interface TitleQualityResult {
  title: string;
  canonicalTitle: string;
  comparisonKey: string;
  characterCount: number;
  hasTraditionalChinese: boolean;
  unsupportedClaims: string[];
  reasons: TitleQualityReason[];
  signature: TitleSemanticSignature;
  acceptable: boolean;
}

export interface SemanticDuplicateResult {
  duplicate: boolean;
  score: number;
  reasons: string[];
  left: TitleSemanticSignature;
  right: TitleSemanticSignature;
}

/** 常见繁体字到简体字的安全映射；保留原文以便门禁提示，而非偷偷改写后放行。 */
const TRADITIONAL_TO_SIMPLIFIED: Record<string, string> = {
  學: "学", 習: "习", 當: "当", 衝: "冲", 動: "动", 轉: "转", 職: "职", 離: "离", 創: "创", 業: "业",
  國: "国", 長: "长", 體: "体", 價: "价", 錢: "钱", 裡: "里", 與: "与", 為: "为", 這: "这",
  個: "个", 們: "们", 還: "还", 後: "后", 來: "来", 說: "说", 開: "开", 關: "关", 門: "门",
  頭: "头", 實: "实", 現: "现", 麼: "么", 會: "会", 獲: "获", 績: "绩", 歷: "历", 驗: "验",
  資: "资", 產: "产", 選: "选", 擇: "择", 機: "机", 檔: "档", 萬: "万", 億: "亿", 歲: "岁",
  號: "号", 兩: "两", 間: "间", 從: "从", 將: "将", 給: "给", 讓: "让", 對: "对", 應: "应",
  該: "该", 報: "报", 錄: "录", 訊: "讯", 課: "课", 檢: "检", 覺: "觉", 發: "发", 懷: "怀",
  憶: "忆", 壓: "压", 擔: "担", 顧: "顾", 問: "问", 證: "证", 據: "据", 網: "网", 頁: "页",
  專: "专", 談: "谈", 論: "论", 遠: "远", 進: "进", 複: "复", 雜: "杂", 難: "难", 擠: "挤",
  傳: "传", 統: "统", 過: "过", 沒: "没", 別: "别", 認: "认", 識: "识", 讀: "读", 書: "书",
  寫: "写", 憑: "凭", 級: "级", 換: "换", 棄: "弃", 錯: "错", 誤: "误", 務: "务", 單: "单",
  線: "线", 節: "节", 視: "视", 顯: "显", 辦: "办", 儘: "尽", 經: "经", 濟: "济",
  餘: "余", 變: "变", 斷: "断", 續: "续", 責: "责", 費: "费", 輕: "轻", 鬆: "松", 競: "竞",
  爭: "争", 請: "请", 調: "调", 準: "准", 於: "于", 佈: "布", 銷: "销",
};

const TRADITIONAL_MARKERS = new Set(Object.keys(TRADITIONAL_TO_SIMPLIFIED));

const NUMBER_WORDS = "0-9一二三四五六七八九十百千万两";
const MONEY_OR_RESULT_PATTERNS: RegExp[] = [
  // “花了百万留学 / 投入十万”同样是需要业务事实支持的金额断言，不能因不是收入而放行。
  /(?:花(?:了|费)?|投入|花费|成本)[^，。！？?；;]{0,8}[0-9一二三四五六七八九十百千万两]+(?:万|亿|千|w|W|k|K)/gu,
  /(?:营收|年薪|月薪|收入|成交|融资|估值|赚了?|盈利)[^，。！？?；;]{0,10}[0-9一二三四五六七八九十百千万两]+(?:万|亿|千|w|W|k|K)/gu,
  /(?:[0-9一二三四五六七八九十百千万两]+(?:万|亿|千|w|W|k|K))[^，。！？?；;]{0,8}(?:营收|年薪|月薪|收入|成交|融资|估值|利润)/gu,
  /(?:创业|入职|转行|离职)[^，。！？?；;]{0,8}(?:首年|一年内|三个月内|半年内)[^，。！？?；;]{0,12}(?:营收|年薪|收入|赚|盈利|融资)/gu,
  // “花家里钱留学”同样是在替当前人设讲一段具体家庭经历；没有被业务事实
  // 支持时不能拿来制造冲突。若确有公开素材，supportedFacts 可明确放行。
  /(?:花|用|拿|靠)(?:家里|父母|爸妈)(?:的钱|钱|积蓄|存款)[^，。！？?；;]{0,8}(?:留学|读书|出国|读硕|上学|求职)?/gu,
  /(?:拿到|获得|斩获|做到|实现)[^，。！？?；;]{0,12}(?:offer|录用|年薪|营收|融资|百万|千万|亿元?)/giu,
  /(?:前|原)(?:国企|大厂|上市公司|外企|字节|阿里|腾讯|华为)[^，。！？?；;]{0,6}(?:高管|总监|负责人|VP|CEO|合伙人)/giu,
  /(?:腾讯|阿里|字节|华为|小红书|百度|京东|美团|拼多多|微软|谷歌|Google|Meta)[^，。！？?；;]{0,10}(?:offer|录用|年薪|高管|总监|入职)/giu,
  /20\d{2}(?:年|[./-]\d{1,2}(?:[./-]\d{1,2})?)/gu,
];

const UNNATURAL_JARGON_PATTERNS: RegExp[] = [
  /邪修/gu,
  /(?:一|二|三|四|五|六|七|八|九|十|\d+)步漏斗/gu,
  /饭局判胜算/gu,
  // “投了没信 / 投简历没信”是模型常见的机械压缩，不是自然的中文标题表达。
  /没信(?!心)/gu,
  // “蹲对口秋招岗”是模型机械拼出的岗位黑话，不是自然的小红书标题语言。
  /蹲(?:对口|心仪|秋招)?(?:秋招)?岗(?:位)?/gu,
  // “投岗”是生成模型常见的行业缩略词；应写成“投岗位”或“投递”。
  /投岗(?!位)/gu,
  // “写推”是模型为了压到20字内对“写推荐信”的机械截断。
  /写推(?!荐)/gu,
  /(?:玄学|黑话|邪门)[^，。！？?；;]{0,8}(?:漏斗|胜算|定价)/gu,
];

/**
 * 这不是通用中文语法器，只拦生成中反复出现、读者一眼可见的“缩到半句话”结构。
 * 更细的自然度仍由标题语义终审负责；本地规则只承担不会因模型误判而漏出的底线。
 */
const INCOMPLETE_TITLE_PATTERNS: RegExp[] = [
  // “先对岗位/方向”里的“对”缺少“准、齐、比照”等补足，不能作为完整标题交付。
  /(?:^|[，,])(?:不如)?先对(?:岗位|方向|简历|机会|公司|工作)(?:[。！？?!]?|$)/u,
  // “先把岗位/方向”后面缺少动作，也是常见的模型截断形式。
  /(?:^|[，,])(?:不如)?先把(?:岗位|方向|简历|机会|公司|工作)(?:[。！？?!]?|$)/u,
];

const ALLOWED_LATIN_TERMS = new Set([
  "ai", "offer", "hr", "ceo", "vp", "kpi", "okr", "saas", "excel", "ppt", "chatgpt", "to b", "tob", "b端",
]);

const AUDIENCE_PATTERNS: Array<[string, RegExp]> = [
  ["parent", /家长|妈妈|爸爸|爸妈|父母|家里|家人|我家孩子|孩子|娃|儿子|女儿/gu],
  ["overseas_student", /留学生|留洋|海归|留英|留学|读硕|海外|工签/gu],
  ["executive", /中高管|高管|总监|中层|管理层|部门总|老板/gu],
  ["advisor", /顾问|老师|机构|陪跑|咨询师/gu],
  ["early_career", /秋招|校招|实习|毕业生|应届/gu],
];

const SCENARIO_PATTERNS: Array<[string, RegExp]> = [
  ["internship_vs_autumn_recruitment", /(?:实习|补实习).*(?:秋招|校招)|(?:秋招|校招).*(?:实习|补实习)/gu],
  ["internship_vs_full_time", /(?:实习|补实习|项目).*(?:全职|正职|转正)|(?:全职|正职|转正).*(?:实习|补实习|项目)/gu],
  ["return_job_search", /(?:回国|回来|回沪).*(?:投简历|投递|海投)|(?:投简历|投递|海投).*(?:回国|回来|回沪)/gu],
  ["stay_or_return", /(?:留英|留海外|海外|工签|留(?:在)?当地).*(?:回国|回沪)|(?:回国|回沪).*(?:留英|留海外|海外|工签|留(?:在)?当地)/gu],
  ["career_switch_on_platform", /(?:期权|工牌|平台|总监|头衔).*(?:转行|转型|换赛道|转方向)|(?:转行|转型|换赛道|转方向).*(?:期权|工牌|平台|总监|头衔)/gu],
  ["recruiting_timeline", /秋招|提前批|招聘节奏|时间线|截止|窗口|节点/gu],
  // “岗没选对”与“方向错”都属于选岗/定位问题；不把前者漏到“投递”场景里。
  ["job_targeting", /岗位地图|选岗|岗(?:位)?|定位|方向|赛道/gu],
  ["resume_application", /简历|网申|投简历|投递|海投/gu],
  ["interview", /面试|笔试|终面|自我介绍/gu],
  ["resignation", /离职|辞职|辞呈|裸辞|交接/gu],
  ["entrepreneurship", /创业|合伙|副业|开公司|工作室/gu],
  ["income_security", /年薪|月薪|收入|现金流|降薪|工资/gu],
  ["platform_pricing", /平台|光环|头衔|工牌|定价|市场价|议价权/gu],
];

const CONFLICT_PATTERNS: Array<[string, RegExp]> = [
  // 家庭投入后不敢说出秋招方向问题，是同一个可识别的内容母题；
  // 无论语序是“先说爸妈”还是“先说不敢”，换词后都不能伪装成新标题。
  ["parent_job_search_pressure", /(?=[\s\S]*(?:爸妈|父母|家里|家长|孩子|娃|儿子|女儿))(?=[\s\S]*(?:秋招|求职|投简历|面试|笔试|待业))(?=[\s\S]*(?:不敢|害怕|怕|没方向|方向模糊|方向(?:全)?错|全错|全挂|没回音|没信|其实|以为|乱投))[\s\S]+/gu],
  // 留学/海归求职中的“怕把困境说出口”，不能只替换倾诉对象就变成新标题。
  ["overseas_job_search_disclosure_shame", /(?=[\s\S]*(?:留(?:了)?学|留学生|海归|留英|海外))(?=[\s\S]*(?:秋招|求职|投(?:啥|什么|简历|递)|海投|待业))(?=[\s\S]*(?:不敢.{0,8}(?:说|讲|告诉|面对|接)|怕.{0,8}(?:说|讲|告诉|接)))[\s\S]+/gu],
  // “早投晚投 / 投错节奏”指向同一个招聘节奏误判，不是新的反认知题。
  ["recruitment_timing_mismatch", /早投|晚投|投错节奏|节奏错|招聘节奏|投递节奏/gu],
  // “过去拼学校/背景、现在拼项目/证据”是同一条学历光环失效后的怀旧叙事。
  ["credential_to_evidence_shift", /(?:以前|过去|当年).*(?:拼学校|拼背景|拼学历|看学校|看背景).*(?:现在|如今).*(?:项目|表达|证据|经历|能力)|(?:现在|如今).*(?:项目|表达|证据|经历|能力).*(?:以前|过去|当年).*(?:拼学校|拼背景|拼学历|看学校|看背景)/gu],
  // “死磕对口/目标岗”与“先接一个 offer 保底”是同一类职业求职两难，不能只改两个词继续交付。
  ["target_role_or_offer_safety", /(?:死磕|冲|坚持).{0,6}(?:目标|对口|理想|心仪).{0,6}(?:岗|岗位).*(?:还是|or|vs|VS).*(?:先|拿|接).{0,6}offer|(?:先|拿|接).{0,6}offer.*(?:还是|or|vs|VS).*(?:死磕|冲|坚持).{0,6}(?:目标|对口|理想|心仪).{0,6}(?:岗|岗位)/giu],
  ["internship_or_autumn_recruitment", /(?:实习|补实习).*(?:还是|or|vs|VS).*(?:秋招|校招)|(?:秋招|校招).*(?:还是|or|vs|VS).*(?:实习|补实习)/giu],
  ["internship_or_full_time", /(?:实习|补实习|项目).*(?:还是|or|vs|VS).*(?:全职|正职|转正)|(?:全职|正职|转正).*(?:还是|or|vs|VS).*(?:实习|补实习|项目)/giu],
  ["misdirected_application", /瞎撞|乱投|海投|没回音|没人理|零回应/gu],
  ["stay_or_return_choice", /(?:留英|海外|工签|留(?:在)?当地).*(?:还是|or|vs|VS).*(?:回国|回沪)|(?:回国|回沪).*(?:还是|or|vs|VS).*(?:留英|海外|工签|留(?:在)?当地)/giu],
  ["career_switch_fear", /不敢.{0,6}(?:转行|转型|换赛道|离职)|怕.{0,6}(?:转行|转型|换赛道|离职)/gu],
  ["resignation_fear", /不敢.{0,6}(?:离职|辞职|裸辞)|怕.{0,6}(?:离职|辞职|裸辞)/gu],
  ["timing_risk", /赶不上|错过|来不及|提前批|截止|窗口/gu],
  ["role_mismatch", /方向错|岗不对|找不对岗(?:位)?|岗(?:位)?没选对|没选对岗|投错岗(?:位)?|不匹配|选错岗|岗位不清/gu],
  ["pricing_loss", /不值钱|砍价|市场价|定价|降薪/gu],
  ["risk_validation", /风险|踩坑|验证|试错|排除|胜算/gu],
];

function findFirstKey(value: string, patterns: Array<[string, RegExp]>, fallback = "open") {
  return patterns.find(([, pattern]) => {
    // 所有模式都可安全复用；避免带 g 标志的 RegExp 因 lastIndex 漂移漏检。
    pattern.lastIndex = 0;
    return pattern.test(value);
  })?.[0] ?? fallback;
}

function containsSupportedFact(claim: string, supportedFacts: readonly string[]) {
  const normalizedClaim = normalizeTitleForComparison(claim);
  return supportedFacts.some((fact) => {
    const normalizedFact = normalizeTitleForComparison(fact);
    return normalizedFact.length >= 4 && (
      normalizedFact.includes(normalizedClaim)
      || normalizedClaim.includes(normalizedFact)
    );
  });
}

function unique<T>(values: readonly T[]) {
  return Array.from(new Set(values));
}

/** 统一全角、常见繁体字和空白；不会剥掉标点，以便 UI 可以继续展示原标题。 */
export function canonicalizeGrowthTitle(value: string) {
  return Array.from((value || "").normalize("NFKC")).map((character) => (
    TRADITIONAL_TO_SIMPLIFIED[character] ?? character
  )).join("").replace(/\s+/gu, " ").trim();
}

/** 原文中是否带有已知繁体标记。即使可转换，发布门禁仍应要求模型输出简体。 */
export function containsTraditionalChinese(value: string) {
  return Array.from((value || "").normalize("NFKC")).some((character) => TRADITIONAL_MARKERS.has(character));
}

/** 用于去重和事实比对：繁简同一化、数字同一化、去掉语气与标点。 */
export function normalizeTitleForComparison(value: string) {
  return canonicalizeGrowthTitle(value)
    .toLocaleLowerCase()
    .replace(/真正|其实|真的|一定|到底|究竟|原来|竟然|你知道吗/gu, "")
    .replace(new RegExp(`[${NUMBER_WORDS}]+`, "gu"), "数")
    .replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()【】\[\]《》<>—\-|｜]/gu, "");
}

export function titleCharacterCount(value: string) {
  return Array.from(canonicalizeGrowthTitle(value)).length;
}

/** 识别“38岁gangga…”一类中英混杂乱码；AI、offer 等常见行业术语允许存在。 */
export function hasGarbledLatinCjkMix(value: string) {
  const normalized = canonicalizeGrowthTitle(value);
  const latinRuns = normalized.match(/[A-Za-z]{2,}/gu) ?? [];
  return latinRuns.some((run) => {
    const lowered = run.toLocaleLowerCase();
    if (ALLOWED_LATIN_TERMS.has(lowered)) return false;
    const index = normalized.toLocaleLowerCase().indexOf(lowered);
    const before = normalized.slice(Math.max(0, index - 2), index);
    const after = normalized.slice(index + run.length, index + run.length + 2);
    const nextToHan = /[\p{Script=Han}]/u.test(`${before}${after}`);
    return nextToHan && run.length >= 3;
  });
}

export function findUnsupportedTitleClaims(value: string, supportedFacts: readonly string[] = []) {
  const canonical = canonicalizeGrowthTitle(value);
  const claims = MONEY_OR_RESULT_PATTERNS.flatMap((pattern) => canonical.match(pattern) ?? []);
  return unique(claims.filter((claim) => !containsSupportedFact(claim, supportedFacts)));
}

export function findUnnaturalTitleJargon(value: string) {
  const canonical = canonicalizeGrowthTitle(value);
  return unique(UNNATURAL_JARGON_PATTERNS.flatMap((pattern) => canonical.match(pattern) ?? []));
}

export function findIncompleteTitleFragments(value: string) {
  const canonical = canonicalizeGrowthTitle(value);
  return unique(INCOMPLETE_TITLE_PATTERNS.flatMap((pattern) => canonical.match(pattern) ?? []));
}

const CONCRETE_TITLE_ANCHORS = /简历|岗位|秋招|校招|面试|offer|实习|学位|学校|项目|导师|校友|家长|合同|工资|客户|老板|团队|会议|工牌|猎头|离职|辞呈|绩效|预算|公司|部门|证据|招聘|投递|工作|名片|报价|办公室|花名册|年终奖|现金流|董事会|奖杯|续约|组织架构|扩编|季度报告|股权|年会|助理|继任|行业排名|并购|周报|供应商|调薪|人才盘点|差旅|出差|通勤|晨会|自我介绍|新人|90天|满意度|报销|年度战略|峰会|奖金|风控|保密协议|背调|办公地点|采购|市场份额|获客|述职|管培生|授权|招聘名额|OKR|敬业度|总部|危机预案|提案|达标|归属条件|个人品牌|市场反馈|能力资产|创业|服务方案|收入结构|停止条件|表达边界|补课|咨询客户|成交|供应链|交付周期|合作伙伴|反向面试|决策边界|团队配置|个人目标|家人支持|个人案例|转型/iu;

/**
 * 只有“过去/现在”的抽象情绪对照，既没有具体人物，也没有动作或场景，
 * 容易成为任何业务都能套的空壳标题。只拦这类非常窄的怀旧框架，避免误伤
 * 带有学校、岗位、工牌、简历等实际原力词的正常标题。
 */
export function isGenericAbstractTitle(value: string) {
  const title = canonicalizeGrowthTitle(value);
  return /^(?:以前|从前|过去|当年).*(?:现在|如今).*/u.test(title)
    && !CONCRETE_TITLE_ANCHORS.test(title);
}

export function classifyTitleFrame(value: string) {
  const title = canonicalizeGrowthTitle(value);
  if (/^(?:先|先别|先把).*(?:还是|or|vs|VS)|还是|\bvs\b/iu.test(title)) return "direct_choice";
  if (/(?:以前|当年|曾经).*(?:现在|如今)/u.test(title)) return "past_present";
  if (/不敢|害怕|怕/u.test(title)) return "identity_inhibition";
  if (/不是.*(?:而是|是)|不如|反而|越.+越/u.test(title)) return "contrast_reversal";
  if (/别|先查|先做|先算|先盘|先看/u.test(title)) return "warning_or_check";
  if (new RegExp(`[${NUMBER_WORDS}]+(?:个|项|步|条|笔|类|件|天|家|份)`, "u").test(title)) return "numbered";
  if (/[？?]$/u.test(title)) return "question";
  return "statement";
}

function classifyPromise(value: string) {
  const title = canonicalizeGrowthTitle(value);
  if (/还是|怎么选|选哪|两条|两份/u.test(title)) return "decision";
  if (/清单|盘点|查|表|路线图|步骤|项/u.test(title)) return "checklist";
  if (/别|最危险|最亏|最怕|先/u.test(title)) return "warning";
  if (/不是|不如|反而|越.+越/u.test(title)) return "reframe";
  if (/我|孩子|以前|当年/u.test(title)) return "experience";
  return "open";
}

/**
 * 可解释的标题语义指纹。它比关键词去重严格，但不会把“同属求职”一概视为重复。
 */
export function buildTitleSemanticSignature(value: string): TitleSemanticSignature {
  const title = canonicalizeGrowthTitle(value);
  const audience = findFirstKey(title, AUDIENCE_PATTERNS);
  const scenario = findFirstKey(title, SCENARIO_PATTERNS);
  const conflict = findFirstKey(title, CONFLICT_PATTERNS);
  const promise = classifyPromise(title);
  const frame = classifyTitleFrame(title);
  return {
    audience,
    scenario,
    conflict,
    promise,
    frame,
    anchors: unique([audience, scenario, conflict, promise, frame].filter((value) => value !== "open")),
  };
}

function bigrams(value: string) {
  const characters = Array.from(normalizeTitleForComparison(value));
  const result = new Set<string>();
  for (let index = 0; index < characters.length - 1; index += 1) {
    result.add(`${characters[index]}${characters[index + 1]}`);
  }
  return result;
}

function diceCoefficient(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const value of left) if (right.has(value)) overlap += 1;
  return (2 * overlap) / (left.size + right.size);
}

/**
 * 计算两个短标题的最长连续共同片段。换一批标题时，若主句只替换后半段，
 * 即使分类器没能抽到足够语义标签，也必须作为同一方向拦下。
 */
function longestCommonContiguousSegmentLength(left: string, right: string) {
  const a = Array.from(normalizeTitleForComparison(left));
  const b = Array.from(normalizeTitleForComparison(right));
  if (!a.length || !b.length) return 0;
  let longest = 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let index = 1; index <= a.length; index += 1) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let otherIndex = 1; otherIndex <= b.length; otherIndex += 1) {
      if (a[index - 1] === b[otherIndex - 1]) {
        current[otherIndex] = previous[otherIndex - 1] + 1;
        longest = Math.max(longest, current[otherIndex]);
      }
    }
    previous = current;
  }
  return longest;
}

/**
 * 家长视角里“催孩子先把秋招方向定下来，还是等他自己想明白”是一个非常具体的
 * 决策母题。把“定方向”替成“投简历”但仍落回“先定秋招方向”，并没有换题。
 *
 * 这里刻意要求同时出现「催孩子」「方向」和选择结构，避免把普通的家长求职标题
 * 或不同阶段的秋招建议一概挡掉。
 */
function isParentDirectionPromptingChoice(title: string, signature: TitleSemanticSignature) {
  const canonical = canonicalizeGrowthTitle(title);
  return signature.audience === "parent"
    && /催(?:娃|孩子|儿子|女儿|他|她)/u.test(canonical)
    && /方向/u.test(canonical)
    && /还是|不如|等.{0,8}自己/u.test(canonical);
}

/**
 * “孩子留完学，秋招到底投什么/往哪个方向走”是家长视角的一个具体焦虑母题。
 * 它必须同时有亲子关系、留学经历、秋招，以及“投什么/方向/犹豫/懵”等方向不确定
 * 信号才会命中；因此不会误挡住秋招时间线、实习选择等其它内容。
 */
function isParentOverseasJobDirectionUncertainty(title: string, signature: TitleSemanticSignature) {
  const canonical = canonicalizeGrowthTitle(title);
  return signature.audience === "parent"
    && /留完学|留学|留英|海外|读硕/u.test(canonical)
    && /秋招|校招/u.test(canonical)
    && /投(?:什么|啥)|方向|犹豫|迷茫|发懵|懵|拿不准/u.test(canonical);
}

/**
 * “学历/留学背景看起来很好，但求职并不会因此顺利”也是一个完整的反认知母题。
 * 只有同时具备学历证据、求职场景和否定结果时才命中；例如单纯讲秋招时间线、
 * 面试技巧或岗位选择，都不会被这个规则误判。
 */
function isCredentialJobSearchGap(title: string) {
  const canonical = canonicalizeGrowthTitle(title);
  const hasCredential = /学历|学校|背景|留学|海归|名校|读硕/u.test(canonical);
  const hasJobSearch = /秋招|求职|投递|简历|岗位|岗|面试/u.test(canonical);
  const hasNegativeOutcome = /白搭|未必|不(?:一定|见得)?(?:顺|顶用|好投|有用)|没用|不灵|不够/u.test(canonical);
  return hasCredential && hasJobSearch && hasNegativeOutcome;
}

/**
 * “海归吃香的过去”对比“今天仍要看岗位/简历”是同一条怀旧母题；
 * 不能只把末尾的岗位、简历换掉，就作为一批新标题再次交付。
 */
function isReturneeHaloToJobReadinessShift(title: string) {
  const canonical = canonicalizeGrowthTitle(title);
  return /(?:海归|留学|海外).*(?:吃香|光环|背景)|(?:吃香|光环|背景).*(?:海归|留学|海外)/u.test(canonical)
    && /当年|以前|过去|从前|那几年|现在|如今/u.test(canonical)
    && /岗位|简历|面试|秋招|投递/u.test(canonical);
}

/**
 * “过去看学校/学历、现在练面试”只替换了学历词，仍是同一条今昔反差母题。
 * 这里限于同一个“面试准备”落点，避免把不同的求职步骤一概判重。
 */
function isCredentialToInterviewShift(title: string) {
  const canonical = canonicalizeGrowthTitle(title);
  return /(?:以前|当年|过去|从前).*(?:学校|学历|名校|背景).*(?:现在|如今).*(?:练|补|准备).{0,4}面试|(?:练|补|准备).{0,4}面试.*(?:以前|当年|过去|从前).*(?:学校|学历|名校|背景)/u.test(canonical);
}

/**
 * “当年收到录取通知，如今等面试消息”以同一条人生阶段反差为卖点，
 * 不能仅替换“通知/信”或“开心/揪心”后作为新标题交付。
 * 这里要求现在仍是「等面试」而非「练面试」，避免挡住后续方法或行动类内容。
 */
function isAdmissionToInterviewWaitingContrast(title: string) {
  const canonical = canonicalizeGrowthTitle(title);
  return /(?:当年|以前|那年).{0,8}(?:收|收到|拿到|等到)?(?:录取(?:通知|信)?)/u.test(canonical)
    && /(?:现在|如今).{0,12}等.{0,6}面试/u.test(canonical);
}

/**
 * 判定“换一批”是否只是换了少量措辞。
 * 同时命中受众、场景、冲突时，即使词面相差较大，也属于同一标题方向。
 */
export function evaluateTitleSemanticDuplicate(leftTitle: string, rightTitle: string): SemanticDuplicateResult {
  const left = buildTitleSemanticSignature(leftTitle);
  const right = buildTitleSemanticSignature(rightTitle);
  const leftKey = normalizeTitleForComparison(leftTitle);
  const rightKey = normalizeTitleForComparison(rightTitle);
  const reasons: string[] = [];
  if (!leftKey || !rightKey) {
    return { duplicate: false, score: 0, reasons, left, right };
  }
  if (leftKey === rightKey) {
    return { duplicate: true, score: 1, reasons: ["规范化文本相同"], left, right };
  }

  const comparableFields: Array<keyof Pick<TitleSemanticSignature, "audience" | "scenario" | "conflict" | "promise" | "frame">> = [
    "audience", "scenario", "conflict", "promise", "frame",
  ];
  const matched = comparableFields.filter((field) => (
    left[field] !== "open" && left[field] === right[field]
  ));
  const bigramScore = diceCoefficient(bigrams(leftTitle), bigrams(rightTitle));
  const commonSegmentLength = longestCommonContiguousSegmentLength(leftTitle, rightTitle);
  const coreMatches = ["audience", "scenario", "conflict"].filter((field) => (
    left[field as keyof TitleSemanticSignature] !== "open"
    && left[field as keyof TitleSemanticSignature] === right[field as keyof TitleSemanticSignature]
  ));
  const isSameParentJobSearchPressureTheme = left.audience === "parent"
    && right.audience === "parent"
    && left.conflict === "parent_job_search_pressure"
    && right.conflict === "parent_job_search_pressure";
  const isSameTargetRoleOrOfferSafetyTheme = left.conflict === "target_role_or_offer_safety"
    && right.conflict === "target_role_or_offer_safety";
  const isSameOverseasJobSearchDisclosureShameTheme = left.conflict === "overseas_job_search_disclosure_shame"
    && right.conflict === "overseas_job_search_disclosure_shame";
  const isSameRecruitmentTimingMismatchTheme = left.conflict === "recruitment_timing_mismatch"
    && right.conflict === "recruitment_timing_mismatch";
  const isSameCredentialToEvidenceShiftTheme = left.conflict === "credential_to_evidence_shift"
    && right.conflict === "credential_to_evidence_shift";
  const isSameParentDirectionPromptingChoice = isParentDirectionPromptingChoice(leftTitle, left)
    && isParentDirectionPromptingChoice(rightTitle, right);
  const isSameParentOverseasJobDirectionUncertainty = isParentOverseasJobDirectionUncertainty(leftTitle, left)
    && isParentOverseasJobDirectionUncertainty(rightTitle, right);
  const isSameCredentialJobSearchGap = isCredentialJobSearchGap(leftTitle)
    && isCredentialJobSearchGap(rightTitle)
    && left.frame === right.frame;
  const isSameReturneeHaloToJobReadinessShift = isReturneeHaloToJobReadinessShift(leftTitle)
    && isReturneeHaloToJobReadinessShift(rightTitle);
  const isSameCredentialToInterviewShift = isCredentialToInterviewShift(leftTitle)
    && isCredentialToInterviewShift(rightTitle);
  const isSameAdmissionToInterviewWaitingContrast = isAdmissionToInterviewWaitingContrast(leftTitle)
    && isAdmissionToInterviewWaitingContrast(rightTitle);
  const isSameRoleMismatchTheme = left.scenario === "job_targeting"
    && right.scenario === "job_targeting"
    && left.conflict === "role_mismatch"
    && right.conflict === "role_mismatch"
    && left.frame === right.frame;
  // “投错岗/找不对岗 + 白搭”已经是足够具体的母题结果，不能仅替换前半句
  // 的优势来源（内推、学历、背景）就重新交付。只收紧这个共享结果，不把
  // 所有不同材料的选岗标题一概拦截。
  const isSameRoleMismatchWithSharedOutcome = left.scenario === "job_targeting"
    && right.scenario === "job_targeting"
    && left.conflict === "role_mismatch"
    && right.conflict === "role_mismatch"
    && ["白搭", "全白搭"].some((outcome) => leftTitle.includes(outcome) && rightTitle.includes(outcome));

  if (commonSegmentLength >= 9) {
    reasons.push(`连续核心短语重复（${commonSegmentLength}字）`);
  } else if (isSameParentJobSearchPressureTheme) {
    reasons.push("父母压力下的求职困境母题相同");
  } else if (isSameTargetRoleOrOfferSafetyTheme) {
    reasons.push("目标岗位与保底 offer 的二选一母题相同");
  } else if (isSameOverseasJobSearchDisclosureShameTheme) {
    reasons.push("留学求职中不敢说出口的困境母题相同");
  } else if (isSameRecruitmentTimingMismatchTheme) {
    reasons.push("招聘投递节奏错位母题相同");
  } else if (isSameCredentialToEvidenceShiftTheme) {
    reasons.push("学历背景转向项目证据的怀旧母题相同");
  } else if (isSameParentDirectionPromptingChoice) {
    reasons.push("家长催孩子先定求职方向的选择母题相同");
  } else if (isSameParentOverseasJobDirectionUncertainty) {
    reasons.push("家长视角下留学后秋招方向焦虑的母题相同");
  } else if (isSameCredentialJobSearchGap) {
    reasons.push("学历或留学背景不等于求职顺利的反认知母题相同");
  } else if (isSameReturneeHaloToJobReadinessShift) {
    reasons.push("海归光环转向求职准备的怀旧母题相同");
  } else if (isSameCredentialToInterviewShift) {
    reasons.push("学历转向面试准备的怀旧母题相同");
  } else if (isSameAdmissionToInterviewWaitingContrast) {
    reasons.push("当年录取、如今等面试的怀旧反差母题相同");
  } else if (isSameRoleMismatchTheme) {
    reasons.push("岗位方向错位的反认知母题相同");
  } else if (isSameRoleMismatchWithSharedOutcome) {
    reasons.push("岗位方向错位且结果表达相同");
  } else if (coreMatches.length === 3 && (left.frame === right.frame || left.promise === right.promise || bigramScore >= 0.22)) {
    reasons.push("受众、场景和冲突相同");
  } else if (matched.length >= 4 && bigramScore >= 0.18) {
    reasons.push("标题结构和核心语义高度重合");
  } else if (bigramScore >= 0.76) {
    reasons.push("词面高度重合");
  }

  const score = Math.min(1, (matched.length / comparableFields.length) * 0.68 + bigramScore * 0.32);
  return { duplicate: reasons.length > 0, score, reasons, left, right };
}

export function titlesAreSemanticDuplicates(leftTitle: string, rightTitle: string) {
  return evaluateTitleSemanticDuplicate(leftTitle, rightTitle).duplicate;
}

/**
 * 盘点法与资料法的固定外壳不是母题本身。
 *
 * “留学生求职，盘点4类……”会在不同标题中天然重复九个以上字符；若直接
 * 使用通用语义比较器，搬迁、学历认证、群面角色等不同盘点对象也会被误判
 * 为同题。这里仅剥离方法外壳后比较真实对象；同一对象只换数字仍会命中。
 */
export function titleForMethodSemanticComparison(methodId: string, value: string) {
  const canonical = canonicalizeGrowthTitle(value);
  if (methodId !== "inventory" && methodId !== "scarce_material") return canonical;
  return canonical
    .replace(/^(?:留学生求职|海归求职|秋招陪跑|高管转型|中高管转型|职业转型)[，,:：]*/u, "")
    .replace(/(?:盘点|梳理|核对|检查|查清)[数0-9一二三四五六七八九十百千万两这]*(?:项|类|种|个|份|笔|条|件|步)?/gu, "")
    .replace(/(?:清单|表格|看板|地图|题库|索引|卡片?)(?:公开|直接看|直接用|给你)?$/u, "")
    .replace(/^[，,:：\s]+|[，,:：\s]+$/gu, "")
    || canonical;
}

/**
 * 只收录“对象和冲突都足够明确”的强语义母题。
 *
 * 通用相似度擅长发现近句，却会漏掉“中英简历对不上 / 两版简历对不上”
 * 这种几乎没有共同长词组的同题改写。这里不尝试给所有标题分类，只为已经
 * 在线上反复出现、且不会因为行业大类相同就误杀的具体母题生成稳定 key。
 */
export function nativeTitleSemanticTopicKeys(methodId: string, value: string) {
  const title = canonicalizeGrowthTitle(value);
  const comparable = titleForMethodSemanticComparison(methodId, title);
  const keys: string[] = [];
  const add = (key: string, condition: boolean) => {
    if (condition && !keys.includes(key)) keys.push(key);
  };

  add(
    "resume:bilingual_version_mismatch",
    /(?:中英|双语|两版|中文版|英文版).{0,4}简历|简历.{0,4}(?:中英|双语|两版|中文版|英文版)/u.test(title)
      && /(?:对不上|不一致|不匹配|冲突|串版|乱|白投|心虚)/u.test(title),
  );
  add(
    "scene:headhunter_call_during_meeting",
    /猎头/u.test(title)
      && /(?:电话|来电|找|消息|联系)/u.test(title)
      && /(?:开会|会议|团队会|主持)/u.test(title),
  );
  add(
    "scene:board_praise_then_exit",
    /董事会/u.test(title)
      && /(?:夸|认可|表扬)/u.test(title)
      && /(?:想走|离职|换方向|转型)/u.test(title),
  );
  add(
    "scene:alumni_referral_no_reply",
    /校友/u.test(title)
      && /内推/u.test(title)
      && /(?:没下文|没了下文|没回应|不回复|失联|等了好久)/u.test(title),
  );
  add(
    "scene:many_alumni_but_role_unknown",
    /(?:校友|人脉)/u.test(title)
      && /(?:多|认识|广)/u.test(title)
      && /(?:不清楚|不了解|不知道|没弄清)/u.test(title)
      && /(?:岗位|岗|工作|职责)/u.test(title)
      && /(?:日常|内容|具体|实际)/u.test(title),
  );
  add(
    "scene:family_connection_hard_to_refuse",
    /(?:家里|父母|爸妈)/u.test(title)
      && /(?:托关系|找关系|介绍|内推)/u.test(title)
      && /(?:不敢说不|难拒绝|不好拒绝|不敢拒绝)/u.test(title),
  );
  add(
    "scene:too_many_mock_interviews_sound_unnatural",
    /(?:模拟面试|面试练)/u.test(title)
      && /(?:多|越)/u.test(title)
      && /(?:不自然|未必.{0,4}自然|机械|像背稿|答得更差|回答更差)/u.test(title),
  );
  add(
    "nostalgia:parent_club_to_job_evidence",
    /(?:孩子|娃|儿子|女儿)/u.test(title)
      && /社团/u.test(title)
      && /(?:工作|求职|能力|结果|胜任|证明|证)/u.test(title),
  );
  add(
    "material:cross_border_contact_check",
    /(?:跨境|海外|国外|境外|时差)/u.test(title)
      && /(?:联系|电话|手机|地址|邮箱|邮件)/u.test(title)
      && /(?:卡|清单|核对|检查|保证|确保|找到|联系到)/u.test(title),
  );
  add(
    "material:cross_border_tax_choice",
    /(?:跨境|海外|国外|境外|回国|两地)/u.test(title)
      && /(?:税务|税收|纳税|个税)/u.test(title),
  );
  add(
    "material:interview_reverse_question_bank",
    /(?:面试反问|反问题)/u.test(title)
      && /(?:题库|题单|问题|方向|清单|盘点|核验)/u.test(title),
  );
  add(
    "material:alumni_interview_questions",
    /(?:校友访谈|校友交流|找校友问)/u.test(title)
      && /(?:题单|问题|提问|验证|岗位日常)/u.test(title),
  );
  add(
    "material:compensation_terms_comparison",
    /(?:薪酬|底薪|奖金|签字费|总回报)/u.test(title)
      && /(?:口径|构成|比较|对照|条款)/u.test(title),
  );
  add(
    "material:recruiter_followup_timing",
    /招聘官/u.test(title)
      && /(?:跟进|沟通|触点|间隔|节奏)/u.test(title),
  );
  add(
    "material:rejection_reason_fields",
    /拒信/u.test(title)
      && /(?:原因|字段|记录|复盘)/u.test(title),
  );
  add(
    "material:collaboration_story_evidence",
    /协作故事/u.test(title)
      && /(?:素材|拆解|细节|证据|利益相关方)/u.test(title),
  );
  add(
    "material:regulatory_risk_check",
    /(?:监管|合规)/u.test(title)
      && /(?:风险|变化|问题|新赛道|方向)/u.test(title),
  );
  add(
    "material:background_reference_availability",
    /(?:背调|背景调查)/u.test(title)
      && /(?:证明人|联系人)/u.test(title)
      && /(?:失效|可用|联系|盘点)/u.test(title),
  );
  add(
    "material:consulting_responsibility_boundary",
    /(?:顾问|咨询)/u.test(title)
      && /(?:合同|交付)/u.test(title)
      && /责任边界|边界/u.test(title),
  );
  add(
    "material:first_customer_source",
    /(?:首批客户|第一批客户|客户线索)/u.test(title)
      && /(?:来源|从哪里|线索|高估|盘点)/u.test(title),
  );
  add(
    "material:portable_personal_brand_assets",
    /个人品牌/u.test(title)
      && /(?:资产|带走|归属|盘点|分清)/u.test(title),
  );
  add(
    "inventory:bilingual_expression_samples",
    /(?:中英|双语|中文版|英文版)/u.test(comparable)
      && /(?:表达|汇报|话术)/u.test(comparable)
      && /(?:样本|案例|范例)/u.test(comparable),
  );
  add(
    "decision:offer_direct_manager",
    /(?:offer|录用|机会)/iu.test(title)
      && /(?:直属经理|直接上级|汇报对象)/u.test(title),
  );
  add(
    "decision:specialist_vs_general_management",
    /(?:专业岗|专业负责人|专业线|专家岗|专家线)/u.test(title)
      && /(?:经营岗|综合经营|综合管理|管理岗|经营线)/u.test(title)
      && /(?:还是|选|转)/u.test(title),
  );
  add(
    "decision:job_label_vs_actual_work",
    /(?:岗位名|名头|头衔|职位名)/u.test(title)
      && /(?:实际内容|工作内容|实际职责|具体职责|做的事|内容扎实|内容不对口)/u.test(title)
      && /(?:还是|不如|比|反而|反倒)/u.test(title),
  );
  add(
    "contrarian:industry_depth_cross_role_needs_evidence",
    /行业经验/u.test(title)
      && /(?:深|多年|丰富)/u.test(title)
      && /(?:跨岗|跨行|换行业|新岗位)/u.test(title)
      && /(?:证据|证明|补证)/u.test(title),
  );
  add(
    "scene:budget_freeze_team_morale",
    /预算/u.test(title)
      && /(?:冻结|砍|缩)/u.test(title)
      && /团队/u.test(title)
      && /(?:画饼|前景|信心|士气)/u.test(title),
  );
  add(
    "scene:client_loss_platform_resource",
    /客户/u.test(title)
      && /(?:走|流失|没了)/u.test(title)
      && /平台/u.test(title)
      && /资源/u.test(title),
  );

  return keys;
}

export function titlesAreMethodAwareSemanticDuplicates(
  methodId: string,
  leftTitle: string,
  rightTitle: string,
) {
  const leftKeys = nativeTitleSemanticTopicKeys(methodId, leftTitle);
  const rightKeys = new Set(nativeTitleSemanticTopicKeys(methodId, rightTitle));
  if (leftKeys.some((key) => rightKeys.has(key))) return true;
  return evaluateTitleSemanticDuplicate(
    titleForMethodSemanticComparison(methodId, leftTitle),
    titleForMethodSemanticComparison(methodId, rightTitle),
  ).duplicate;
}

/**
 * 生成链路可直接使用的硬门禁结果。
 * 有传统字时返回 canonicalTitle 供“修复后再校验”使用，但本次模型输出仍不应放行。
 */
export function evaluateGrowthTitleQuality(title: string, options: TitleQualityOptions = {}): TitleQualityResult {
  const canonicalTitle = canonicalizeGrowthTitle(title);
  const maxLength = options.maxLength ?? 20;
  const reasons: TitleQualityReason[] = [];
  const hasTraditionalChinese = containsTraditionalChinese(title);
  const unsupportedClaims = findUnsupportedTitleClaims(canonicalTitle, options.supportedFacts ?? []);
  if (!canonicalTitle) reasons.push("empty");
  if (titleCharacterCount(canonicalTitle) > maxLength) reasons.push("too_long");
  if (hasTraditionalChinese) reasons.push("traditional_chinese");
  if (hasGarbledLatinCjkMix(canonicalTitle)) reasons.push("garbled_latin_cjk");
  if (unsupportedClaims.length) reasons.push("unsupported_factual_claim");
  if (findUnnaturalTitleJargon(canonicalTitle).length) reasons.push("unnatural_jargon");
  if (findIncompleteTitleFragments(canonicalTitle).length) reasons.push("incomplete_sentence");
  if (isGenericAbstractTitle(canonicalTitle)) reasons.push("generic_title");
  return {
    title,
    canonicalTitle,
    comparisonKey: normalizeTitleForComparison(canonicalTitle),
    characterCount: titleCharacterCount(canonicalTitle),
    hasTraditionalChinese,
    unsupportedClaims,
    reasons: unique(reasons),
    signature: buildTitleSemanticSignature(canonicalTitle),
    acceptable: reasons.length === 0,
  };
}

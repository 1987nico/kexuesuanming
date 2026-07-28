/**
 * 标题质量门禁（纯函数）。
 *
 * 这个模块不决定“该写什么”，只负责把明显不可交付的标题挡在生成链路内：
 * - 繁体字 / 乱码 / 超长；
 * - 没有业务事实依据的角色、金额、成绩、日期、公司断言；
 * - 明显不自然的生造黑话；
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
  | "unnatural_jargon";

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
  /(?:营收|年薪|月薪|收入|成交|融资|估值|赚了?|盈利)[^，。！？?；;]{0,10}[0-9一二三四五六七八九十百千万两]+(?:万|亿|千|w|W|k|K)/gu,
  /(?:[0-9一二三四五六七八九十百千万两]+(?:万|亿|千|w|W|k|K))[^，。！？?；;]{0,8}(?:营收|年薪|月薪|收入|成交|融资|估值|利润)/gu,
  /(?:创业|入职|转行|离职)[^，。！？?；;]{0,8}(?:首年|一年内|三个月内|半年内)[^，。！？?；;]{0,12}(?:营收|年薪|收入|赚|盈利|融资)/gu,
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
  /(?:玄学|黑话|邪门)[^，。！？?；;]{0,8}(?:漏斗|胜算|定价)/gu,
];

const ALLOWED_LATIN_TERMS = new Set([
  "ai", "offer", "hr", "ceo", "vp", "kpi", "okr", "saas", "excel", "ppt", "chatgpt", "to b", "tob", "b端",
]);

const AUDIENCE_PATTERNS: Array<[string, RegExp]> = [
  ["parent", /家长|妈妈|爸爸|爸妈|父母|我家孩子/gu],
  ["overseas_student", /留学生|留洋|海归|留英|留学|读硕|海外|工签/gu],
  ["executive", /中高管|高管|总监|中层|管理层|部门总|老板/gu],
  ["advisor", /顾问|老师|机构|陪跑|咨询师/gu],
  ["early_career", /秋招|校招|实习|毕业生|应届/gu],
];

const SCENARIO_PATTERNS: Array<[string, RegExp]> = [
  ["internship_vs_autumn_recruitment", /(?:实习|补实习).*(?:秋招|校招)|(?:秋招|校招).*(?:实习|补实习)/gu],
  ["return_job_search", /(?:回国|回来|回沪).*(?:投简历|投递|海投)|(?:投简历|投递|海投).*(?:回国|回来|回沪)/gu],
  ["stay_or_return", /(?:留英|留海外|海外|工签).*(?:回国|回沪)|(?:回国|回沪).*(?:留英|留海外|海外|工签)/gu],
  ["career_switch_on_platform", /(?:期权|工牌|平台|总监|头衔).*(?:转行|转型|换赛道|转方向)|(?:转行|转型|换赛道|转方向).*(?:期权|工牌|平台|总监|头衔)/gu],
  ["recruiting_timeline", /秋招|提前批|招聘节奏|时间线|截止|窗口|节点/gu],
  ["job_targeting", /岗位地图|选岗|岗位|定位|方向|赛道/gu],
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
  ["parent_job_search_pressure", /(?=[\s\S]*(?:爸妈|父母|家里|家长))(?=[\s\S]*(?:秋招|求职|投简历|面试|笔试))(?=[\s\S]*(?:不敢|没方向|方向模糊|全挂|没回音|没信|其实|以为|乱投))[\s\S]+/gu],
  ["internship_or_autumn_recruitment", /(?:实习|补实习).*(?:还是|or|vs|VS).*(?:秋招|校招)|(?:秋招|校招).*(?:还是|or|vs|VS).*(?:实习|补实习)/giu],
  ["misdirected_application", /瞎撞|乱投|海投|没回音|没人理|零回应/gu],
  ["stay_or_return_choice", /(?:留英|海外|工签).*(?:还是|or|vs|VS).*(?:回国|回沪)|(?:回国|回沪).*(?:还是|or|vs|VS).*(?:留英|海外|工签)/giu],
  ["career_switch_fear", /不敢.{0,6}(?:转行|转型|换赛道|离职)|怕.{0,6}(?:转行|转型|换赛道|离职)/gu],
  ["resignation_fear", /不敢.{0,6}(?:离职|辞职|裸辞)|怕.{0,6}(?:离职|辞职|裸辞)/gu],
  ["timing_risk", /赶不上|错过|来不及|提前批|截止|窗口/gu],
  ["role_mismatch", /方向错|岗不对|不匹配|选错岗|岗位不清/gu],
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

  if (commonSegmentLength >= 9) {
    reasons.push(`连续核心短语重复（${commonSegmentLength}字）`);
  } else if (isSameParentJobSearchPressureTheme) {
    reasons.push("父母压力下的求职困境母题相同");
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

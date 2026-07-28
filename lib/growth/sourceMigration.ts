import type {
  BenchmarkStructureCard,
  GrowthAccount,
  GrowthBusinessLine,
  GrowthPersona,
  TitleMethodId,
  TopicSourceSnapshot,
} from "./types";

export const SOURCE_MIGRATION_VERSION = "v3_7" as const;
const STRUCTURE_CARD_TTL_MS = 24 * 60 * 60 * 1000;

const STRUCTURE_CARD_CONTRACTS: Partial<Record<TitleMethodId, string>> = {
  traffic: "拆出热点事件、人物或社会冲突，以及它与当前目标人群决策问题的连接点。",
  same_product: "拆出产品形态、使用场景、购买理由和选择标准。",
  same_effect: "拆出用户问题、解决机制、降低的风险和行动结果。",
  similar_audience: "拆出人群身份、阶段处境、共同压力和身份冲突。",
  same_outcome: "拆出最终利益、主动权、安全感或职业结果。",
  viral_framework: "拆出句式骨架、信息顺序、冲突和反转。",
};

const PRODUCT_TOKENS = [
  "咨询", "规划", "辅导", "测评", "评估", "诊断", "报告", "顾问", "陪跑",
  "训练营", "教练", "简历修改", "面试辅导", "求职服务", "职业参谋", "参谋", "老师",
];

const BUSINESS_TOKENS: Record<GrowthBusinessLine, string[]> = {
  executive: [
    "职业", "职场", "工作", "求职", "离职", "裸辞", "跳槽", "转型", "高管",
    "管理", "创业", "裁员", "升职", "岗位", "上班", "体制", "事业",
  ],
  overseas_student: [
    "留学", "留学生", "海归", "秋招", "校招", "求职", "简历", "面试", "offer",
    "实习", "毕业", "岗位", "回国", "外企",
  ],
};

const AUDIENCE_TOKENS = [
  "普通人", "打工人", "职场人", "中层", "高管", "管理者", "老板", "30+", "35岁",
  "留学生", "海归", "毕业生", "应届生", "体制内", "宝妈", "家长", "创业者",
];

/**
 * “相似人群”不能只靠一条泛职业母题放行。新标题至少要把当前业务的人群
 * 放到台前，才能让操作者看见到底迁移了谁的处境，而不是套一个通用观点。
 */
const BUSINESS_AUDIENCE_TOKENS: Record<GrowthBusinessLine, string[]> = {
  executive: ["中高管", "高管", "中层", "管理者", "总监", "职场人", "35岁", "老板"],
  overseas_student: ["留学生", "海归", "留子", "毕业生", "应届生", "家长", "留学"],
};

const EFFECT_TOKENS = [
  "如何", "怎么", "方法", "技巧", "解法", "攻略", "步骤", "清单", "路线", "避坑",
  "风险", "信号", "防止", "避免", "别", "不要", "不知道", "选错", "踩坑", "危险",
  "入侵", "选哪个", "值不值", "判断", "比较",
];

const OUTCOME_TOKENS = [
  "上岸", "升职", "加薪", "成交", "找到工作", "入职", "offer", "转型", "创业",
  "选择权", "安全感", "匹配", "定价权", "职业起点", "自由", "不痛苦", "方向",
];

function includesAny(value: string, tokens: string[]) {
  const normalized = value.toLowerCase();
  return tokens.some((token) => normalized.includes(token.toLowerCase()));
}

export function titleStructureSignals(value: string) {
  const signals = new Set<string>();
  if (/不是.+(?:而是|是)/u.test(value)) signals.add("not_but");
  if (/越.+(?:越|反而)/u.test(value)) signals.add("more_but");
  if (/还是|到底.+选/u.test(value)) signals.add("choice");
  if (/为什么|为何/u.test(value)) signals.add("why");
  if (/如何|怎么/u.test(value)) signals.add("how");
  if (/不如/u.test(value)) signals.add("rather_than");
  if (/，?是(?:一种|个)?/u.test(value)) signals.add("is_a");
  if (/\d+|[一二三四五六七八九十两]+(?=[个项条步天年])/u.test(value)) signals.add("number");
  if (/却|没想到|结果|根本不知道/u.test(value)) signals.add("turn");
  if (/不要|别|千万/u.test(value)) signals.add("warning");
  return signals;
}

function effectSignals(value: string) {
  const signals = new Set<string>();
  if (/风险|信号|防止|避免|别|不要|不知道|选错|踩坑|危险|入侵/u.test(value)) signals.add("risk");
  if (/如何|怎么|方法|技巧|解法|攻略|步骤|清单|路线/u.test(value)) signals.add("method");
  if (/选哪个|怎么选|比较|判断|值不值|还是/u.test(value)) signals.add("choice");
  if (/更快|效率|省时|省钱|少走弯路/u.test(value)) signals.add("efficiency");
  return signals;
}

function outcomeSignals(value: string) {
  const signals = new Set<string>();
  if (/上岸|找到工作|入职|offer/u.test(value)) signals.add("job");
  if (/升职|加薪|收入|定价权/u.test(value)) signals.add("market_value");
  if (/选择权|自由|主动权/u.test(value)) signals.add("choice");
  if (/安全感|稳定|不痛苦|少焦虑/u.test(value)) signals.add("security");
  if (/匹配|方向|职业起点|转型|创业/u.test(value)) signals.add("direction");
  return signals;
}

function setsOverlap(left: Set<string>, right: Set<string>) {
  return [...left].some((item) => right.has(item));
}

/**
 * 每个对标法都至少应继承一个原题可核对的结构关系。没有可识别结构时，
 * 只依赖各自方法合同；有结构时不能把“结构迁移”降级成换业务词。
 */
function keepsSourceStructure(sourceTitle: string, newTitle: string) {
  const sourceSignals = titleStructureSignals(sourceTitle);
  return sourceSignals.size === 0
    || setsOverlap(sourceSignals, titleStructureSignals(newTitle));
}

function comparableTitle(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()【】\[\]《》<>—\-|｜]/gu, "");
}

function titleBigrams(value: string) {
  const characters = Array.from(comparableTitle(value));
  const result = new Set<string>();
  for (let index = 0; index < characters.length - 1; index += 1) {
    result.add(`${characters[index]}${characters[index + 1]}`);
  }
  return result;
}

/** 只阻止改几个词的照抄；不会把同一结构的真正业务替换误杀。 */
function isTooCloseToSource(sourceTitle: string, newTitle: string) {
  const source = comparableTitle(sourceTitle);
  const title = comparableTitle(newTitle);
  if (!source || !title) return false;
  if (source === title || source.includes(title) || title.includes(source)) return true;
  const left = titleBigrams(source);
  const right = titleBigrams(title);
  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;
  const dice = left.size && right.size ? (2 * shared) / (left.size + right.size) : 0;
  return dice >= 0.74;
}

export function sourceMethodFit(input: {
  methodId: TitleMethodId;
  businessLine: GrowthBusinessLine;
  title: string;
  description?: string;
}) {
  const text = `${input.title} ${input.description ?? ""}`.trim();
  const businessRelevant = includesAny(text, BUSINESS_TOKENS[input.businessLine]);

  switch (input.methodId) {
    case "traffic":
      return {
        passed: /工作制|裁员|AI|人工智能|大厂|热搜|新规|行业|赛道|政策|平台/u.test(text),
        reason: "母题必须包含可识别的近期事件、人物或社会冲突。",
      };
    case "same_product": {
      const productRelevant = includesAny(text, PRODUCT_TOKENS);
      return {
        passed: productRelevant && businessRelevant,
        reason: "“相同产品”必须同时属于咨询/辅导/测评/诊断/顾问/陪跑类服务，并与当前职业或求职业务相关。",
      };
    }
    case "same_effect":
      return {
        passed: includesAny(text, EFFECT_TOKENS),
        reason: "“相同功效”母题必须体现判断、比较、方法、避坑或降低风险等明确功效。",
      };
    case "similar_audience":
      return {
        passed: businessRelevant && includesAny(text, AUDIENCE_TOKENS),
        reason: "“相似人群”母题必须出现与当前业务相关的明确身份或人生阶段。",
      };
    case "same_outcome":
      return {
        passed: includesAny(text, OUTCOME_TOKENS),
        reason: "“终极结果相同”母题必须指向可识别的职业、收入、选择权、安全感或匹配结果。",
      };
    case "viral_framework":
      return {
        passed: titleStructureSignals(input.title).size > 0,
        reason: "“爆款框架”母题必须具有可识别的问句、对比、反转、数字、警告或冲突句式。",
      };
    default:
      return { passed: true, reason: "该方法不要求外部母题。" };
  }
}

export function sourceSnapshotFitsMethod(
  source: TopicSourceSnapshot,
  businessLine: GrowthBusinessLine,
) {
  return sourceMethodFit({
    methodId: source.method_id,
    businessLine,
    title: source.original_title,
  });
}

function cardText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

/**
 * 来源结构卡不能因为模型漏回一个字段就拖死整批标题。
 * 这个最小卡只复述真实原标题和方法合同，不编造来源事实；后续迁移标题仍要经过
 * 独立迁移审核，审核不可用时该槽位会暂停，而不会被放行。
 */
function minimumStructureFields(input: {
  source: TopicSourceSnapshot;
}) {
  const contract = STRUCTURE_CARD_CONTRACTS[input.source.method_id] || "保留原标题的结构关系";
  const structure = titleStructureSignals(input.source.original_title);
  const sentenceStructure = structure.has("not_but")
    ? "先否定一个常见判断，再给出反转后的关键判断。"
    : structure.has("more_but")
      ? "用“条件越强、结果越反常”的关系制造反差。"
      : structure.has("choice")
        ? "把两条路径并列，要求读者在真实约束下作选择。"
        : structure.has("why")
          ? "先抛出一个反常的“为什么”，再展开原因。"
          : structure.has("how")
            ? "先明确一个具体问题，再给出识别、判断或处理路径。"
          : structure.has("number")
            ? "用明确数量组织一个可执行的清单或步骤。"
            : structure.has("warning")
              ? "先发出具体风险提醒，再说明容易忽略的条件。"
              : "先给出具体处境，再放大其中的冲突或反转。";
  const conflictStructure = input.source.method_id === "same_effect"
    ? "用户想更快解决问题，但真正缺的是判断、比较或避坑机制。"
    : input.source.method_id === "similar_audience"
      ? "某类人群看似处在同一阶段，却被一个具体矛盾卡住。"
      : input.source.method_id === "same_outcome"
        ? "表面目标和真正想获得的选择权、安全感或方向感并不相同。"
        : input.source.method_id === "same_product"
          ? "用户以为自己需要一个产品，实际需要先判断是否适配与怎么使用。"
          : "母题通过具体处境制造了可识别的冲突或反转。";
  return {
    // 不把原标题逐字塞回生成提示，避免模型把“结构迁移”误做成改几个词。
    // 原题本身仍完整保存在 source_title，供运营查看迁移链路。
    sentence_structure: sentenceStructure,
    conflict_structure: conflictStructure,
    audience_situation: "保留母题中“人物正处在一个具体阶段”的关系，替换为当前业务的真实人群。",
    emotional_hook: "保留母题的反差、犹豫、风险或不甘心，不复制原题措辞。",
    promised_result: "保留母题承诺的判断、比较、避坑或最终利益层级，替换成当前业务能真实交付的结果。",
    inheritable_element: contract,
    replacement_requirement: "必须替换为当前业务、当前视角和真实职业场景，不复制原标题表达。",
  };
}

function cachedStructureCard(
  account: GrowthAccount,
  source: TopicSourceSnapshot,
) {
  const now = Date.now();
  return (account.benchmark_structure_cards ?? []).find((card) =>
    card.structure_version === SOURCE_MIGRATION_VERSION
    && card.status === "locked"
    && card.business_line === (account.business_line ?? "executive")
    && card.persona === account.persona
    && card.method_id === source.method_id
    && card.source_id === source.id
    && card.source_url === source.original_url
    && card.source_title === source.original_title
    && Date.parse(card.expires_at) > now
  );
}

function normalizeStructureCard(input: {
  account: GrowthAccount;
  source: TopicSourceSnapshot;
  raw: Record<string, unknown> | undefined;
  generatedAt: string;
}): BenchmarkStructureCard | null {
  const fit = sourceSnapshotFitsMethod(
    input.source,
    input.account.business_line ?? "executive",
  );
  if (!fit.passed) return null;
  const raw = input.raw ?? {};
  const fallback = minimumStructureFields({ source: input.source });
  const fields = {
    sentence_structure: cardText(raw.sentence_structure) || fallback.sentence_structure,
    conflict_structure: cardText(raw.conflict_structure) || fallback.conflict_structure,
    audience_situation: cardText(raw.audience_situation) || fallback.audience_situation,
    emotional_hook: cardText(raw.emotional_hook) || fallback.emotional_hook,
    promised_result: cardText(raw.promised_result) || fallback.promised_result,
    inheritable_element: cardText(raw.inheritable_element) || fallback.inheritable_element,
    replacement_requirement: cardText(raw.replacement_requirement) || fallback.replacement_requirement,
  };
  const forbidden = Array.isArray(raw.forbidden_copy_elements)
    ? raw.forbidden_copy_elements.map(cardText).filter(Boolean).slice(0, 8)
    : [];
  return {
    id: crypto.randomUUID(),
    account_id: input.account.id,
    business_line: input.account.business_line ?? "executive",
    persona: input.account.persona,
    method_id: input.source.method_id,
    source_id: input.source.id,
    source_url: input.source.original_url,
    source_title: input.source.original_title,
    source_author: input.source.author,
    ...fields,
    forbidden_copy_elements: forbidden,
    source_fit_status: "passed",
    source_fit_reason: fit.reason,
    status: "locked",
    structure_version: SOURCE_MIGRATION_VERSION,
    generated_at: input.generatedAt,
    expires_at: new Date(Date.parse(input.generatedAt) + STRUCTURE_CARD_TTL_MS).toISOString(),
  };
}

export async function ensureBenchmarkStructureCards(input: {
  account: GrowthAccount;
  sources: TopicSourceSnapshot[];
}): Promise<{
  cards: BenchmarkStructureCard[];
  rejected: Array<{ method_id: TitleMethodId; reason: string }>;
}> {
  const cards: BenchmarkStructureCard[] = [];
  const rejected: Array<{ method_id: TitleMethodId; reason: string }> = [];
  const pending: TopicSourceSnapshot[] = [];

  for (const source of input.sources) {
    const fit = sourceSnapshotFitsMethod(source, input.account.business_line ?? "executive");
    if (!fit.passed) {
      rejected.push({ method_id: source.method_id, reason: fit.reason });
      continue;
    }
    const cached = cachedStructureCard(input.account, source);
    if (cached) cards.push(cached);
    else pending.push(source);
  }
  if (!pending.length) return { cards, rejected };

  const generatedAt = new Date().toISOString();
  for (const source of pending) {
    // 结构卡必须快速、可复现，不能让一次“换一批标题”再多等一轮模型。
    // 结构关系由真实标题的句式和方法合同确定，原题和链接仍会连同卡片保存。
    const card = normalizeStructureCard({
      account: input.account,
      source,
      raw: undefined,
      generatedAt,
    });
    if (card) cards.push(card);
    else rejected.push({
      method_id: source.method_id,
      reason: "母题未形成可用的结构卡，本轮暂停。",
    });
  }
  return { cards, rejected };
}

export function deterministicMigrationFit(input: {
  methodId: TitleMethodId;
  businessLine: GrowthBusinessLine;
  sourceTitle: string;
  newTitle: string;
}) {
  const sourceFit = sourceMethodFit({
    methodId: input.methodId,
    businessLine: input.businessLine,
    title: input.sourceTitle,
  });
  if (!sourceFit.passed) return sourceFit;

  const structurePreserved = keepsSourceStructure(input.sourceTitle, input.newTitle);
  const structureReason = "新标题没有继承原题可识别的句式或冲突关系。";

  switch (input.methodId) {
    case "same_product":
      return {
        passed: structurePreserved
          && includesAny(input.newTitle, [...PRODUCT_TOKENS, "适配", "选择", "找老师", "第一步", "值不值"]),
        reason: !structurePreserved ? structureReason : "新标题没有体现同类产品、使用场景或选择逻辑。",
      };
    case "same_effect":
      return {
        passed: structurePreserved
          && setsOverlap(effectSignals(input.sourceTitle), effectSignals(input.newTitle)),
        reason: !structurePreserved ? structureReason : "新标题没有继承母题对应的判断、比较、方法或风险降低功效。",
      };
    case "similar_audience":
      return {
        passed: structurePreserved
          && includesAny(input.newTitle, BUSINESS_AUDIENCE_TOKENS[input.businessLine]),
        reason: !structurePreserved
          ? structureReason
          : "新标题没有呈现当前业务中与母题相似的人群或人生阶段。",
      };
    case "same_outcome":
      return {
        passed: structurePreserved
          && setsOverlap(outcomeSignals(input.sourceTitle), outcomeSignals(input.newTitle)),
        reason: !structurePreserved ? structureReason : "新标题没有继承母题指向的同一类最终利益。",
      };
    case "viral_framework": {
      return {
        passed: structurePreserved,
        reason: structureReason,
      };
    }
    default:
      return { passed: true, reason: "交由独立语义门禁判断。" };
  }
}

export interface SourceMigrationCandidate {
  candidateId: string;
  methodId: TitleMethodId;
  methodLabel: string;
  source: TopicSourceSnapshot;
  structureCard: BenchmarkStructureCard;
  title: string;
  inheritedStructure: string;
  replacedContent: string;
}

export interface SourceMigrationDecision {
  candidateId: string;
  passed: boolean;
  sourceFit: boolean;
  migrationFit: boolean;
  reason: string;
  evidence: string;
}

export async function validateSourceMigrations(input: {
  businessLine: GrowthBusinessLine;
  persona: GrowthPersona;
  targetUser: string;
  coreProblem: string;
  candidates: SourceMigrationCandidate[];
}): Promise<SourceMigrationDecision[]> {
  if (!input.candidates.length) return [];

  return input.candidates.map((candidate): SourceMigrationDecision => {
    const sourceFit = sourceSnapshotFitsMethod(candidate.source, input.businessLine).passed;
    const migration = deterministicMigrationFit({
      methodId: candidate.methodId,
      businessLine: input.businessLine,
      sourceTitle: candidate.source.original_title,
      newTitle: candidate.title,
    });
    const copied = isTooCloseToSource(candidate.source.original_title, candidate.title);
    const personaLabel: Record<GrowthPersona, string> = {
      buyer: "买家",
      expert: "专家",
      merchant: "商家",
    };
    const structure = candidate.structureCard.sentence_structure;
    const relationship = candidate.structureCard.conflict_structure;
    const replacement = `以${personaLabel[input.persona]}视角面向“${input.targetUser}”，围绕“${input.coreProblem}”替换人物、场景和业务内容。`;
    return {
      candidateId: candidate.candidateId,
      sourceFit,
      migrationFit: migration.passed && !copied,
      passed: sourceFit && migration.passed && !copied,
      reason: !sourceFit
        ? "原题不符合当前对标方法。"
        : copied
          ? "新标题与原题过于接近，未完成原创迁移。"
          : migration.reason,
      evidence: sourceFit && migration.passed && !copied
        ? `可复用结构：${structure} 关系：${relationship} 当前替换：${replacement}`
        : "",
    };
  });
}

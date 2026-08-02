import { TITLE_METHOD_BY_ID } from "./methods";
import { validateSourceLink } from "./sourceValidation";
import type {
  GrowthAccount,
  GrowthBusinessLine,
  TitleMethodId,
  TopicSourceSnapshot,
} from "./types";
import { benchmarkSourcePolicy, sourceIsUsable } from "./validation";
import {
  SOURCE_MIGRATION_VERSION,
  sourceMethodFit,
  sourceSnapshotFitsMethod,
} from "./sourceMigration";

const REDFOX_DAILY_URL = "https://redfox.hk/story/api/cozeSkill/getXhsCozeSkillDataOne";
const REDFOX_DAILY_SOURCE = "小红书单日数据爆款文章-GitHub";
const DAY_MS = 86_400_000;

/**
 * 来源发现是“换一批标题”的辅助步骤，不能反过来拖住整批标题。
 * 两个外部网络步骤都必须有很短、可预期的上限：排行榜最多 8 秒，
 * 每条原链接核验最多 4 秒（并行执行）。
 */
export const REDFOX_FETCH_TIMEOUT_MS = 8_000;
export const SOURCE_LINK_TIMEOUT_MS = 4_000;

export interface SourceDiscoverySummary {
  status: "cached" | "refreshed" | "unavailable" | "failed";
  provider: "redfox_daily";
  rank_date?: string;
  fetched_count: number;
  selected_count: number;
  usable_count: number;
  message: string;
}

export interface RedFoxNote {
  rank: number;
  title: string;
  description: string;
  author: string;
  original_url: string;
  published_at: string;
  heat_snapshot: string;
}

type RawRecord = Record<string, unknown>;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function countLabel(value: unknown) {
  const text = asString(value);
  return text || "0";
}

function shanghaiParts(at: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function redFoxRankDate(at = new Date()) {
  const parts = shanghaiParts(at);
  const dayOffset = Number(parts.hour) >= 19 ? 1 : 2;
  const dateAtUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return new Date(dateAtUtc - dayOffset * DAY_MS).toISOString().slice(0, 10);
}

function previousDate(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

function parsePublishedAt(value: unknown) {
  const text = asString(value);
  if (!text) return "";
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(" ", "T")}+08:00`
    : text;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function rawRows(payload: unknown): RawRecord[] {
  if (Array.isArray(payload)) return payload.filter((item): item is RawRecord => Boolean(item && typeof item === "object"));
  if (!payload || typeof payload !== "object") return [];
  const data = payload as RawRecord;
  let rows: unknown = data.data ?? data.list ?? data.articles ?? [];
  if (rows && typeof rows === "object" && !Array.isArray(rows)) {
    const objectRows = rows as RawRecord;
    rows = objectRows.list ?? objectRows.records ?? [];
  }
  return Array.isArray(rows) ? rows.filter((item): item is RawRecord => Boolean(item && typeof item === "object")) : [];
}

export function normalizeRedFoxNotes(payload: unknown): RedFoxNote[] {
  return rawRows(payload).flatMap((row, index) => {
    const title = asString(row.title);
    const author = asString(row.userName);
    const originalUrl = asString(row.photoJumpUrl);
    const publishedAt = parsePublishedAt(row.publicTime);
    const ana = row.anaAdd && typeof row.anaAdd === "object" ? row.anaAdd as RawRecord : {};
    if (!title || !author || !publishedAt || !/^https:\/\/(?:www\.)?xiaohongshu\.com\/explore\//i.test(originalUrl)) return [];
    return [{
      rank: index + 1,
      title: title.slice(0, 200),
      description: asString(row.desc).replace(/\s+/g, " ").slice(0, 280),
      author: author.slice(0, 100),
      original_url: originalUrl,
      published_at: publishedAt,
      heat_snapshot: [
        `每日榜第${index + 1}`,
        `互动${countLabel(ana.interactiveCount)}`,
        `新增${countLabel(ana.addInteractiveount)}`,
        `赞${countLabel(ana.useLikeCount)}`,
        `藏${countLabel(ana.collectedCount)}`,
        `评${countLabel(ana.useCommentCount)}`,
        `享${countLabel(ana.useShareCount)}`,
      ].join(" · ").slice(0, 300),
    }];
  });
}

export async function fetchDailyRank(
  apiKey: string,
  rankDate: string,
  timeoutMs = REDFOX_FETCH_TIMEOUT_MS,
) {
  const url = new URL(REDFOX_DAILY_URL);
  url.searchParams.set("rankDate", rankDate);
  url.searchParams.set("source", REDFOX_DAILY_SOURCE);
  url.searchParams.set("category", "职业发展");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`RedFox HTTP ${response.status}`);
    const payload = await response.json();
    if (payload && typeof payload === "object" && "code" in payload && payload.code !== 2000) {
      throw new Error(`RedFox API ${asString(payload.msg ?? payload.message ?? payload.code)}`);
    }
    return normalizeRedFoxNotes(payload);
  } finally {
    clearTimeout(timeout);
  }
}

const RELEVANCE_TOKENS: Record<GrowthBusinessLine, string[]> = {
  executive: ["职场", "高管", "管理", "领导", "工作", "离职", "转型", "创业", "职业", "裁员", "升职", "加薪", "老板", "体制", "公司", "上班", "副业", "能力"],
  overseas_student: ["留学", "求职", "校招", "秋招", "海归", "面试", "简历", "offer", "实习", "毕业", "工作", "职场", "岗位", "外企"],
};

const METHOD_PATTERNS: Partial<Record<TitleMethodId, RegExp>> = {
  traffic: /工作制|裁员|AI|人工智能|大厂|热搜|新规|行业|赛道/i,
  same_product: /咨询|规划|辅导|测评|报告|顾问|陪跑|训练营/i,
  same_effect: /如何|怎么|方法|技巧|解法|攻略|步骤|清单|路线/i,
  similar_audience: /普通人|打工人|中层|高管|老板|30\+|35岁|留学生|海归|毕业生|体制内/i,
  same_outcome: /上岸|升职|加薪|成交|财富|不痛苦|找到工作|入职|转型|创业|方向/i,
  viral_framework: /如何|怎么|唯一|最|一定|不要|别|真相|居然|原来|\d+/i,
};

function relevanceScore(note: RedFoxNote, businessLine: GrowthBusinessLine) {
  const text = `${note.title} ${note.description}`.toLowerCase();
  return RELEVANCE_TOKENS[businessLine].reduce((score, token) => score + (text.includes(token.toLowerCase()) ? 1 : 0), 0);
}

const PROFILE_IDENTITY_TOKENS: Partial<Record<NonNullable<GrowthAccount["profile_identity"]>, string[]>> = {
  overseas_student_self: ["留学生", "海归", "应届生", "毕业生", "秋招", "校招", "求职", "面试", "简历", "offer"],
  overseas_student_parent: ["家长", "父母", "孩子", "娃", "儿子", "女儿", "留学生", "秋招", "求职"],
  executive_self: ["中层", "高管", "总监", "管理者", "职场人", "35岁", "离职", "转型", "创业"],
  service_operator: ["服务", "咨询", "辅导", "陪跑", "课程", "产品", "价格", "报告", "方案"],
  professional_expert: ["方法", "判断", "比较", "区别", "测评", "建议", "避坑", "为什么", "如何"],
};

const PERSONA_TOKENS: Record<GrowthAccount["persona"], string[]> = {
  buyer: ["我", "亲历", "经历", "踩坑", "上岸", "离职", "裸辞", "转型", "孩子", "家长", "留学生"],
  expert: ["如何", "为什么", "方法", "判断", "比较", "区别", "测评", "建议", "避坑", "真相"],
  merchant: ["服务", "咨询", "辅导", "陪跑", "课程", "产品", "价格", "后付款", "报告", "方案", "适合"],
};

function matchedTokenCount(value: string, tokens: string[]) {
  const normalized = value.toLowerCase();
  return tokens.reduce((count, token) => count + (normalized.includes(token.toLowerCase()) ? 1 : 0), 0);
}

/**
 * 对标法不再“先找一个泛题再改写”，所以来源标题本身必须能被当前账号直接使用。
 * 这里将业务线作为硬门槛，将视角和具体账号人设作为排序信号；留学生本人号额外
 * 排除家长叙事，防止最危险的身份串线。
 */
export function directSourceAccountFit(note: Pick<RedFoxNote, "title" | "description">, account: GrowthAccount) {
  const businessLine = account.business_line ?? "executive";
  const text = `${note.title} ${note.description}`;
  const titleBusinessScore = matchedTokenCount(note.title, RELEVANCE_TOKENS[businessLine]);
  const businessScore = relevanceScore({ ...note, rank: 0, author: "", original_url: "", published_at: "", heat_snapshot: "" }, businessLine);
  if (titleBusinessScore === 0 || businessScore === 0) {
    return { passed: false, score: 0, evidence: "原标题与当前业务定位不匹配" };
  }
  if (account.profile_identity === "overseas_student_self" && /家长|父母|孩子|陪娃|儿子|女儿/u.test(note.title)) {
    return { passed: false, score: 0, evidence: "留学生本人账号不能直接使用家长叙事标题" };
  }
  if (account.profile_identity === "overseas_student_parent" && !/家长|父母|孩子|陪娃|陪孩子|儿子|女儿/u.test(note.title)) {
    return { passed: false, score: 0, evidence: "留学生家长账号只直接采用明确体现家长身份的标题" };
  }
  if (businessLine === "executive" && /留学生|留学|海归|秋招|校招/u.test(note.title)) {
    return { passed: false, score: 0, evidence: "中高管业务不能直接使用留学生标题" };
  }
  const identityScore = matchedTokenCount(text, PROFILE_IDENTITY_TOKENS[account.profile_identity ?? "executive_self"] ?? []);
  const personaScore = matchedTokenCount(text, PERSONA_TOKENS[account.persona]);
  if ((account.persona === "merchant" || account.persona === "expert") && personaScore === 0) {
    return {
      passed: false,
      score: 0,
      evidence: `原标题没有体现${account.persona === "merchant" ? "商家" : "专家"}视角，不能直接采用`,
    };
  }
  const accountText = [
    account.profile_name,
    account.one_liner,
    account.target_user,
    account.core_problem,
    account.account_value,
    ...Object.values(account.persona_specific ?? {}),
  ].filter(Boolean).join(" ");
  const accountKeywords = [...new Set((accountText.match(/[\u4e00-\u9fff]{2,6}|[a-zA-Z]{3,}/g) ?? [])
    .filter((token) => token.length <= 6))].slice(0, 40);
  const accountScore = matchedTokenCount(text, accountKeywords);
  return {
    passed: true,
    score: titleBusinessScore * 14 + businessScore * 5 + identityScore * 8 + personaScore * 4 + Math.min(accountScore, 5) * 3,
    evidence: `原标题已匹配${businessLine === "executive" ? "中高管" : "留学生"}业务、${account.persona === "merchant" ? "商家" : account.persona === "expert" ? "专家" : "买家"}视角和当前账号人设`,
  };
}

export function sourceSnapshotFitsAccount(source: TopicSourceSnapshot, account: GrowthAccount) {
  if (TITLE_METHOD_BY_ID[source.method_id]?.group !== "benchmark") return true;
  return directSourceAccountFit({ title: source.original_title, description: "" }, account).passed;
}

function candidatePool(notes: RedFoxNote[], account: GrowthAccount) {
  const relevant = notes
    .map((note) => ({
      note,
      fit: directSourceAccountFit(note, account),
      policy: benchmarkSourcePolicy({
        method_id: "similar_audience",
        original_title: note.title,
        published_at: note.published_at,
      }),
    }))
    .filter((candidate) => candidate.fit.passed && candidate.policy.eligible)
    .sort((a, b) => {
      if (a.fit.score !== b.fit.score) return b.fit.score - a.fit.score;
      if (a.policy.pool !== b.policy.pool) return a.policy.pool === "recent_opportunity" ? -1 : 1;
      return a.policy.ageDays - b.policy.ageDays;
    })
    .map((candidate) => candidate.note);
  return [...new Map(relevant.map((note) => [note.original_url, note])).values()].slice(0, 35);
}

/**
 * 不把母题筛选再交给模型：模型多一次调用会增加 20~30 秒不确定等待，
 * 还可能返回一条并不存在或不符合方法合同的来源。这里所有选择均来自
 * 已读取的真实榜单，且必须通过 sourceMethodFit；相同输入总是同一结果。
 */
export function selectDeterministicSources(
  notes: RedFoxNote[],
  account: GrowthAccount,
  methodIds: TitleMethodId[],
  occupied = new Set<string>(),
) {
  const businessLine = account.business_line ?? "executive";
  const selections = new Map<TitleMethodId, {
    note: RedFoxNote;
    pool: "recent_opportunity" | "evergreen_benchmark";
    validityDays: 7 | 90;
    matchScore: number;
    migrationNote: string;
  }>();
  const occupiedTitles = new Set<string>();
  for (const methodId of methodIds) {
    const pattern = METHOD_PATTERNS[methodId];
    const ranked = [...notes]
      .filter((note) => !occupied.has(note.original_url))
      .filter((note) => !occupiedTitles.has(note.title.trim().toLowerCase()))
      .filter((note) => sourceMethodFit({
        methodId,
        businessLine,
        title: note.title,
        description: note.description,
      }).passed)
      .map((note) => {
        const policy = benchmarkSourcePolicy({
          method_id: methodId,
          original_title: note.title,
          published_at: note.published_at,
        });
        return {
          note,
          policy,
          score: directSourceAccountFit(note, account).score
            + (pattern?.test(`${note.title} ${note.description}`) ? 12 : 0)
            + Math.max(0, 12 - note.rank / 4)
            + (policy.pool === "recent_opportunity" ? 6 : 0),
        };
      })
      .filter((candidate) => candidate.policy.eligible)
      .sort((a, b) => b.score - a.score);
    const winner = ranked[0];
    if (!winner) continue;
    occupied.add(winner.note.original_url);
    occupiedTitles.add(winner.note.title.trim().toLowerCase());
    selections.set(methodId, {
      note: winner.note,
      pool: winner.policy.pool,
      validityDays: winner.policy.validityDays,
      matchScore: winner.score,
      migrationNote: `自动从职业发展每日榜中选择，已匹配当前业务、视角与账号人设；${winner.policy.pool === "recent_opportunity" ? "属于7天内近期机会" : "属于90天内常青对标"}，系统直接采用真实原标题，不做改写。`,
    });
  }
  return selections;
}

function freshness(publishedAt: string): TopicSourceSnapshot["freshness"] {
  const days = Math.max(0, (Date.now() - Date.parse(publishedAt)) / DAY_MS);
  return days <= 3 ? "within_72h" : days <= 7 ? "day_4_to_7" : "historical";
}

export async function ensureRecentTopicSources(
  account: GrowthAccount,
  options: {
    force?: boolean;
    excludeUrls?: string[];
    excludeTitles?: string[];
    methodIds?: TitleMethodId[];
    dropExcluded?: boolean;
  } = {},
): Promise<{
  account: GrowthAccount;
  summary: SourceDiscoverySummary;
}> {
  // 只允许调用方明确点名要刷新哪些来源方法。默认“把所有方法都找一遍”
  // 会在每次换标题时额外拉榜、验链，既慢又会消耗本应留给下一批的母题。
  const methodIds = [...new Set(options.methodIds ?? [])]
    .filter((methodId) => TITLE_METHOD_BY_ID[methodId]?.sourceRequired);
  const plannedRankDate = redFoxRankDate();
  const sources = account.topic_sources ?? [];
  if (!methodIds.length) {
    return {
      account,
      summary: {
        status: "cached",
        provider: "redfox_daily",
        rank_date: plannedRankDate,
        fetched_count: 0,
        selected_count: 0,
        usable_count: 0,
        message: "未指定需要刷新的对标方法，保留当前来源，不请求热榜。",
      },
    };
  }

  const excluded = new Set(options.excludeUrls ?? []);
  const excludedTitles = new Set((options.excludeTitles ?? []).map((title) => title.trim().toLowerCase()));
  const complete = !options.force && methodIds.every((methodId) => sources.some((source) =>
    source.method_id === methodId &&
    sourceIsUsable(source) &&
    sourceSnapshotFitsMethod(source, account.business_line ?? "executive").passed &&
    sourceSnapshotFitsAccount(source, account) &&
    !excludedTitles.has(source.original_title.trim().toLowerCase()) &&
    !excluded.has(source.original_url)
  ));
  if (complete) {
    const usableCount = methodIds.filter((methodId) => sources.some((source) =>
      source.method_id === methodId
      && sourceIsUsable(source)
      && sourceSnapshotFitsMethod(source, account.business_line ?? "executive").passed
      && sourceSnapshotFitsAccount(source, account)
      && !excludedTitles.has(source.original_title.trim().toLowerCase())
      && !excluded.has(source.original_url)
    )).length;
    return {
      account,
      summary: {
        status: "cached",
        provider: "redfox_daily",
        rank_date: plannedRankDate,
        fetched_count: 0,
        selected_count: usableCount,
        usable_count: usableCount,
        message: "已有未使用且在24小时内核验过的近期或常青真实标题，不重复请求热榜。",
      },
    };
  }

  const apiKey = process.env.REDFOX_API_KEY?.trim();
  if (!apiKey) {
    return {
      account,
      summary: {
        status: "unavailable",
        provider: "redfox_daily",
        rank_date: plannedRankDate,
        fetched_count: 0,
        selected_count: 0,
        usable_count: 0,
        message: "生产环境未配置小红书热榜API，暂时只能使用人工来源。",
      },
    };
  }

  try {
    let rankDate = plannedRankDate;
    let notes = await fetchDailyRank(apiKey, rankDate);
    if (!notes.length) {
      rankDate = previousDate(rankDate);
      notes = await fetchDailyRank(apiKey, rankDate);
    }
    const pool = candidatePool(notes, account)
      .filter((note) => !excluded.has(note.original_url))
      .filter((note) => !excludedTitles.has(note.title.trim().toLowerCase()));
    if (!pool.length) throw new Error("职业榜没有与当前账号高度匹配的近期或常青真实标题");
    const selections = selectDeterministicSources(pool, account, methodIds);
    const checked = await Promise.all([...selections.entries()].map(async ([methodId, selection]) => {
      const validation = await validateSourceLink(selection.note.original_url, SOURCE_LINK_TIMEOUT_MS);
      const existing = sources.find((source) => source.method_id === methodId && source.original_url === selection.note.original_url);
      const source: TopicSourceSnapshot = {
        id: existing?.id ?? crypto.randomUUID(),
        method_id: methodId,
        platform: "小红书",
        author: selection.note.author,
        original_title: selection.note.title,
        original_url: selection.note.original_url,
        published_at: selection.note.published_at,
        heat_snapshot: selection.note.heat_snapshot,
        collected_at: validation.checked_at,
        migration_note: selection.migrationNote,
        link_status: validation.link_status,
        verified_by_operator: validation.link_status === "accessible",
        freshness: freshness(selection.note.published_at),
        source_provider: "redfox_daily",
        rank_date: rankDate,
        rank_position: selection.note.rank,
        source_method_fit_status: "passed",
        source_method_fit_version: SOURCE_MIGRATION_VERSION,
        source_method_fit_evidence: selection.migrationNote,
        benchmark_pool: selection.pool,
        source_validity_days: selection.validityDays,
        source_match_score: selection.matchScore,
      };
      return source;
    }));
    const checkedMethods = new Set(checked.map((source) => source.method_id));
    const updated: GrowthAccount = {
      ...account,
      topic_sources: [
        ...checked,
        ...sources.filter((source) => {
          if (checkedMethods.has(source.method_id)) return false;
          if (
            methodIds.includes(source.method_id)
            && (
              !sourceSnapshotFitsMethod(source, account.business_line ?? "executive").passed
              || !sourceSnapshotFitsAccount(source, account)
            )
          ) return false;
          if (options.dropExcluded && excluded.has(source.original_url)) return false;
          return true;
        }),
      ],
      updated_at: new Date().toISOString(),
    };
    const usableCount = checked.filter((source) => sourceIsUsable(source)).length;
    return {
      account: updated,
      summary: {
        status: "refreshed",
        provider: "redfox_daily",
        rank_date: rankDate,
        fetched_count: notes.length,
        selected_count: checked.length,
        usable_count: usableCount,
        message: `已从${rankDate}职业发展每日榜获取${notes.length}条笔记，按账号匹配度筛选${checked.length}条真实标题（7天内优先，常青标题最长90天），${usableCount}条通过链接与内容时效校验。`,
      },
    };
  } catch (error) {
    return {
      account,
      summary: {
        status: "failed",
        provider: "redfox_daily",
        rank_date: plannedRankDate,
        fetched_count: 0,
        selected_count: 0,
        usable_count: 0,
        message: `自动获取近期或常青对标标题失败：${(error as Error).message}`,
      },
    };
  }
}

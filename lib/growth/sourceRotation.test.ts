import { describe, expect, it } from "vitest";
import {
  freshBenchmarkSourcePlan,
  historicalSourceUrlsByMethod,
  mergeRotatedTopicPool,
  recordBenchmarkSourceSelection,
  recentSourceUrls,
  sourceMethodsDueForRotation,
  sourceUsageCount,
  updateBenchmarkSourceUsage,
  withHistoricalBenchmarkSourceUsage,
} from "./sourceRotation";
import type {
  GrowthAccount,
  GrowthRun,
  TitleMethodId,
  TopicCandidate,
  TopicSourceSnapshot,
} from "./types";

const source = (
  methodId: TitleMethodId,
  id: string,
  url = `https://www.xiaohongshu.com/explore/${id}`,
): TopicSourceSnapshot => ({
  id,
  method_id: methodId,
  platform: "小红书",
  author: "作者",
  original_title: `${methodId}原题`,
  original_url: url,
  published_at: "2026-07-21T00:00:00.000Z",
  heat_snapshot: "互动1000",
  collected_at: "2026-07-23T00:00:00.000Z",
  link_status: "accessible",
  verified_by_operator: true,
  freshness: "within_72h",
});

const topic = (
  methodId: TitleMethodId,
  title: string,
  snapshot?: TopicSourceSnapshot,
): TopicCandidate => ({
  id: `${methodId}-${title}`,
  method_group: methodId === "viral_framework" || methodId === "similar_audience"
    ? "benchmark"
    : "native",
  method_id: methodId,
  method_label: methodId,
  generation_mode: "default",
  title,
  title_promise: "兑现标题",
  target_user: "目标用户",
  pain: "核心问题",
  hook: title,
  source_snapshot: snapshot,
  follow_reason: "持续获得判断",
  test_variable: "标题",
  expected_signal: "有效咨询",
  repeatable_angle: "继续测试",
  broad_traffic_risk: 3,
  priority: "A",
});

const account = (): GrowthAccount => ({
  id: "account",
  tenant_id: "mianbajun",
  business_line: "executive",
  persona: "buyer",
  name: "账号",
  target_user: "中高管",
  core_problem: "方向",
  account_value: "判断",
  trust_source: "案例",
  one_liner: "人设",
  follow_reason: "持续判断",
  not_doing: "不夸大",
  compliance_redline: "不夸大",
  hypotheses: [],
  persona_specific: {},
  content_directions: [],
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-23T00:00:00.000Z",
});

describe("对标法双层换批", () => {
  it("同一母题第一次生成后，下次换一批即进入必须换源状态", () => {
    const item = source("viral_framework", "source-1");
    let current = account();
    current.topic_sources = [item];
    current = {
      ...current,
      benchmark_source_usage: updateBenchmarkSourceUsage({
        account: current,
        topics: [topic("viral_framework", "标题0", item)],
        timestamp: "2026-07-23T00:00:00.000Z",
      }),
    };
    expect(sourceUsageCount(current, item)).toBe(1);
    expect(sourceMethodsDueForRotation(current)).toEqual(["viral_framework"]);
    expect(current.benchmark_source_usage?.[0]?.rotation_status).toBe("rotation_recommended");
  });

  it("换一个母题只替换目标槽位", () => {
    const previous = [
      topic("human_pain", "原生标题"),
      topic("viral_framework", "旧对标", source("viral_framework", "old")),
    ];
    const replacement = topic(
      "viral_framework",
      "新对标",
      source("viral_framework", "new"),
    );
    expect(mergeRotatedTopicPool({
      previous,
      generated: [replacement],
      mode: "rotate_single_source",
      methodId: "viral_framework",
    })).toEqual([previous[0], replacement]);
  });

  it("运营选用对标标题后累计来源被选次数", () => {
    const item = source("viral_framework", "selected-source");
    const current = account();
    const usages = recordBenchmarkSourceSelection({
      account: current,
      topic: topic("viral_framework", "选中的标题", item),
      timestamp: "2026-07-23T03:00:00.000Z",
    });
    expect(usages[0]).toMatchObject({
      original_url: item.original_url,
      selected_count: 1,
    });
  });

  it("全部换新对标保留原生法，移除未生成成功的旧对标", () => {
    const native = topic("human_pain", "原生标题");
    const oldA = topic("similar_audience", "旧相似人群", source("similar_audience", "a"));
    const oldB = topic("viral_framework", "旧爆款", source("viral_framework", "b"));
    const nextA = topic("similar_audience", "新相似人群", source("similar_audience", "c"));
    expect(mergeRotatedTopicPool({
      previous: [native, oldA, oldB],
      generated: [nextA],
      mode: "rotate_all_sources",
    })).toEqual([native, nextA]);
  });

  it("30天来源历史包含账号使用记录和历史批次，超过30天的不再排除", () => {
    const current = account();
    current.benchmark_source_usage = [{
      business_line: "executive",
      persona: "buyer",
      method_id: "viral_framework",
      source_id: "usage-source",
      original_url: "https://www.xiaohongshu.com/explore/usage-source",
      first_used_at: "2026-07-20T00:00:00.000Z",
      last_used_at: "2026-07-20T00:00:00.000Z",
      generated_batch_count: 1,
      selected_count: 0,
      rotation_status: "active",
    }];
    const run = {
      created_at: "2026-07-10T00:00:00.000Z",
      topic_pool: [topic(
        "similar_audience",
        "历史标题",
        source("similar_audience", "run-source"),
      )],
    } as GrowthRun;
    const oldRun = {
      created_at: "2026-05-01T00:00:00.000Z",
      topic_pool: [topic(
        "viral_framework",
        "过期历史",
        source("viral_framework", "old-source"),
      )],
    } as GrowthRun;
    expect(recentSourceUrls({
      account: current,
      runs: [run, oldRun],
      now: new Date("2026-07-23T00:00:00.000Z"),
    })).toEqual(expect.arrayContaining([
      "https://www.xiaohongshu.com/explore/usage-source",
      "https://www.xiaohongshu.com/explore/run-source",
    ]));
    expect(recentSourceUrls({
      account: current,
      runs: [run, oldRun],
      now: new Date("2026-07-23T00:00:00.000Z"),
    })).not.toContain("https://www.xiaohongshu.com/explore/old-source");
  });

  it("强制来源去重读取全部历史，不会因超过30天而重新使用母题", () => {
    const current = account();
    current.benchmark_source_usage = [{
      business_line: "executive",
      persona: "buyer",
      method_id: "viral_framework",
      source_id: "old-usage",
      original_url: "https://www.xiaohongshu.com/explore/old-usage",
      first_used_at: "2026-01-01T00:00:00.000Z",
      last_used_at: "2026-01-01T00:00:00.000Z",
      generated_batch_count: 1,
      selected_count: 0,
      rotation_status: "rotation_recommended",
    }, {
      business_line: "overseas_student",
      persona: "buyer",
      method_id: "viral_framework",
      source_id: "other-business",
      original_url: "https://www.xiaohongshu.com/explore/other-business",
      first_used_at: "2026-07-20T00:00:00.000Z",
      last_used_at: "2026-07-20T00:00:00.000Z",
      generated_batch_count: 1,
      selected_count: 0,
      rotation_status: "rotation_recommended",
    }];
    const oldRun = {
      created_at: "2025-12-01T00:00:00.000Z",
      topic_pool: [topic(
        "viral_framework",
        "很早的历史标题",
        source("viral_framework", "old-run-source"),
      )],
    } as GrowthRun;

    const history = historicalSourceUrlsByMethod({
      account: current,
      runs: [oldRun],
      methodIds: ["viral_framework"],
    });
    expect(history.get("viral_framework")).toEqual(expect.arrayContaining([
      "https://www.xiaohongshu.com/explore/old-usage",
      "https://www.xiaohongshu.com/explore/old-run-source",
    ]));
    expect(history.get("viral_framework")).not.toContain(
      "https://www.xiaohongshu.com/explore/other-business",
    );
  });

  it("同一账号内按方法判断历史来源，不会误伤另一个对标方法", () => {
    const current = account();
    const sharedUrl = "https://www.xiaohongshu.com/explore/shared-source";
    current.benchmark_source_usage = [{
      business_line: "executive",
      persona: "buyer",
      method_id: "viral_framework",
      source_id: "viral-old",
      original_url: sharedUrl,
      first_used_at: "2026-07-20T00:00:00.000Z",
      last_used_at: "2026-07-20T00:00:00.000Z",
      generated_batch_count: 1,
      selected_count: 0,
      rotation_status: "rotation_recommended",
    }];
    const plans = freshBenchmarkSourcePlan({
      account: current,
      runs: [],
      methodIds: ["viral_framework", "similar_audience"],
      candidateSources: [
        source("viral_framework", "viral-old", sharedUrl),
        source("similar_audience", "similar-new", sharedUrl),
      ],
    });
    expect(plans).toEqual([
      expect.objectContaining({
        method_id: "viral_framework",
        status: "paused",
        pause_reason: "no_unused_source",
      }),
      expect.objectContaining({
        method_id: "similar_audience",
        status: "ready",
        unused_source_urls: [sharedUrl],
      }),
    ]);
  });

  it("来源池没有从未使用过的母题时，明确暂停该槽位", () => {
    const current = account();
    const old = source("viral_framework", "only-source");
    current.topic_sources = [old];
    current.benchmark_source_usage = [{
      business_line: "executive",
      persona: "buyer",
      method_id: "viral_framework",
      source_id: old.id,
      original_url: old.original_url,
      first_used_at: "2026-07-20T00:00:00.000Z",
      last_used_at: "2026-07-20T00:00:00.000Z",
      generated_batch_count: 1,
      selected_count: 0,
      rotation_status: "rotation_recommended",
    }];
    expect(freshBenchmarkSourcePlan({
      account: current,
      runs: [],
      methodIds: ["viral_framework"],
    })).toEqual([expect.objectContaining({
      method_id: "viral_framework",
      used_source_urls: [old.original_url],
      unused_source_urls: [],
      status: "paused",
      pause_reason: "no_unused_source",
    })]);
  });

  it("历史来源使用记录不会在第301条时被截断", () => {
    let current = account();
    for (let index = 0; index < 301; index += 1) {
      const item = source("viral_framework", `history-${index}`);
      current = {
        ...current,
        benchmark_source_usage: updateBenchmarkSourceUsage({
          account: current,
          topics: [topic("viral_framework", `历史标题${index}`, item)],
          timestamp: `2026-07-23T00:${String(index % 60).padStart(2, "0")}.000Z`,
        }),
      };
    }
    expect(current.benchmark_source_usage).toHaveLength(301);
  });

  it("旧账号首次读取时根据历史批次补齐母题使用次数", () => {
    const item = source("viral_framework", "legacy-source");
    const legacy = account();
    const run = {
      created_at: "2026-07-20T00:00:00.000Z",
      topic_pool: [topic("viral_framework", "历史标题", item)],
    } as GrowthRun;
    const hydrated = withHistoricalBenchmarkSourceUsage(legacy, [run, {
      ...run,
      id: "run-2",
      created_at: "2026-07-21T00:00:00.000Z",
    }]);
    expect(sourceUsageCount(hydrated, item)).toBe(2);
  });
});

import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { methodsForPersona } from "./methods";
import { createGrowthPreviewFixture } from "./previewFixture";
import {
  buildTopicDiversitySignature,
  generateTopicBatch,
  titlePersonaProblems,
  topicBatchDuplicateProblems,
  type TopicTitleHistoryEntry,
} from "./runner";
import { evaluateGrowthTitleQuality } from "./titleQuality";

const RUN_REAL_STRESS = process.env.RUN_GROWTH_TITLE_STRESS === "1";
const ROUNDS_PER_SPACE = 20;
const LEDGER_PATH = "/private/tmp/growth-title-stress-ledger.json";

interface StressSpaceState {
  key: string;
  account: ReturnType<typeof createGrowthPreviewFixture>["accounts"][number];
  historyTitles: string[];
  historyTopics: TopicTitleHistoryEntry[];
  batches: Array<{
    round: number;
    elapsed_ms: number;
    titles: string[];
    fallback_count: number;
    generation_attempts: number;
  }>;
}

function stressFailure(message: string, details: Record<string, unknown>) {
  return Object.assign(new Error(message), { details });
}

describe.runIf(RUN_REAL_STRESS)("真实模型标题120批压力验收", () => {
  it("六个业务视角各连续20批都交付全新、自然且视角一致的原生标题", async () => {
    const states: StressSpaceState[] = createGrowthPreviewFixture().accounts.map((account) => ({
      key: `${account.business_line}/${account.persona}`,
      account: { ...account, sources: [] },
      historyTitles: [],
      historyTopics: [],
      batches: [],
    }));
    const ledger = {
      objective: "6个业务视角×20批真实模型标题压力验收",
      started_at: new Date().toISOString(),
      status: "running",
      rounds_per_space: ROUNDS_PER_SPACE,
      batches_passed: 0,
      batches_required: states.length * ROUNDS_PER_SPACE,
      fallback_titles: 0,
      total_titles: 0,
      spaces: states.map((state) => ({ key: state.key, batches: state.batches })),
      failure: null as null | Record<string, unknown>,
    };

    try {
      for (let round = 0; round < ROUNDS_PER_SPACE; round += 1) {
        const roundResults = await Promise.all(states.map(async (state) => {
          const methods = methodsForPersona(
            state.account.persona,
            "default",
            state.account.method_overrides,
          ).filter((method) => !method.sourceRequired);
          const startedAt = Date.now();
          const result = await generateTopicBatch({
            account: state.account,
            methodIds: methods.map((method) => method.id),
            historyTitles: state.historyTitles,
            historyTopics: state.historyTopics,
            allowSourcePause: true,
          });
          const elapsedMs = Date.now() - startedAt;
          const expectedIds = methods.map((method) => method.id).sort();
          const deliveredIds = result.topics.map((topic) => topic.method_id).sort();
          if (JSON.stringify(deliveredIds) !== JSON.stringify(expectedIds)) {
            throw stressFailure("原生槽位没有完整交付", {
              space: state.key,
              round: round + 1,
              expected_method_ids: expectedIds,
              delivered_method_ids: deliveredIds,
              deliveries: result.methodDeliveries,
            });
          }
          if (elapsedMs > 120_000) {
            throw stressFailure("单批生成超过120秒", {
              space: state.key,
              round: round + 1,
              elapsed_ms: elapsedMs,
            });
          }
          const duplicateProblems = topicBatchDuplicateProblems(
            result.topics,
            state.historyTitles,
            state.historyTopics,
            state.account.business_line,
          );
          if (duplicateProblems.length) {
            throw stressFailure("新批次出现历史重复或批内换皮", {
              space: state.key,
              round: round + 1,
              problems: duplicateProblems,
              titles: result.topics.map((topic) => topic.title),
            });
          }
          for (const topic of result.topics) {
            const quality = evaluateGrowthTitleQuality(topic.title);
            if (!quality.acceptable) {
              throw stressFailure("标题未通过确定性质量门禁", {
                space: state.key,
                round: round + 1,
                title: topic.title,
                reasons: quality.reasons,
              });
            }
            const personaProblems = titlePersonaProblems(topic, state.account);
            if (personaProblems.length) {
              throw stressFailure("标题发生业务或视角串线", {
                space: state.key,
                round: round + 1,
                title: topic.title,
                problems: personaProblems,
              });
            }
            if (!topic.title_promise?.trim() || topic.title_promise.trim().length < 8) {
              throw stressFailure("标题没有绑定可交付的独立正文承诺", {
                space: state.key,
                round: round + 1,
                title: topic.title,
                title_promise: topic.title_promise,
              });
            }
          }
          const fallbackCount = result.topics.filter((topic) => Boolean(topic.fallback_premise_key)).length;
          return {
            state,
            result,
            elapsedMs,
            fallbackCount,
          };
        }));

        for (const { state, result, elapsedMs, fallbackCount } of roundResults) {
          state.historyTopics = [
            ...result.topics.map((topic) => ({
              method_id: topic.method_id,
              title: topic.title,
              ...buildTopicDiversitySignature(topic, state.account.business_line),
              batch_index: 0,
            })),
            ...state.historyTopics.map((item) => ({
              ...item,
              batch_index: (item.batch_index ?? 0) + 1,
            })),
          ];
          state.historyTitles = [
            ...result.topics.map((topic) => topic.title),
            ...state.historyTitles,
          ];
          state.batches.push({
            round: round + 1,
            elapsed_ms: elapsedMs,
            titles: result.topics.map((topic) => topic.title),
            fallback_count: fallbackCount,
            generation_attempts: result.generationAttempts,
          });
          ledger.batches_passed += 1;
          ledger.fallback_titles += fallbackCount;
          ledger.total_titles += result.topics.length;
        }
        await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
      }

      const fallbackRatio = ledger.total_titles
        ? ledger.fallback_titles / ledger.total_titles
        : 1;
      expect(
        fallbackRatio,
        `静态兜底占比${(fallbackRatio * 100).toFixed(1)}%，不能成为主要供题来源`,
      ).toBeLessThanOrEqual(0.2);
      expect(ledger.batches_passed).toBe(ledger.batches_required);
      ledger.status = "passed";
      Object.assign(ledger, {
        finished_at: new Date().toISOString(),
        fallback_ratio: fallbackRatio,
        under_90_seconds: states.flatMap((state) => state.batches)
          .filter((batch) => batch.elapsed_ms <= 90_000).length,
      });
      await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    } catch (error) {
      ledger.status = "failed";
      ledger.failure = {
        message: (error as Error).message,
        ...((error as Error & { details?: Record<string, unknown> }).details ?? {}),
      };
      Object.assign(ledger, { finished_at: new Date().toISOString() });
      await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
      throw error;
    }
  }, 10_800_000);
});

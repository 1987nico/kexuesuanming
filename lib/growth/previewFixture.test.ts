import { describe, expect, it } from "vitest";
import { assertGrowthPreviewIsSafe, createGrowthPreviewFixture, growthPreviewEnabled } from "./previewFixture";

describe("growth v3.2 local preview fixture", () => {
  it("seeds two business lines with three isolated personas and keeps legacy samples separate", () => {
    const fixture = createGrowthPreviewFixture();
    expect(fixture.accounts).toHaveLength(6);
    expect(new Set(fixture.accounts.map((item) => item.business_line))).toEqual(new Set(["executive", "overseas_student"]));
    for (const businessLine of ["executive", "overseas_student"] as const) {
      expect(fixture.accounts.filter((item) => item.business_line === businessLine).map((item) => item.persona).sort()).toEqual(["buyer", "expert", "merchant"]);
    }
    expect(fixture.drafts.filter((item) => item.schema_version === "legacy_v1")).not.toHaveLength(0);
    expect(fixture.drafts.filter((item) => item.schema_version === "method_v3_2").every((item) => item.eligible_for_method_learning)).toBe(true);
    const legacy = fixture.drafts.find((item) => item.schema_version === "legacy_v1")!;
    expect(Object.prototype.hasOwnProperty.call(legacy, "method_id")).toBe(false);
  });

  it("enables only the explicit fixture flag and rejects production", () => {
    expect(growthPreviewEnabled({ NODE_ENV: "development", GROWTH_PREVIEW_MODE: "fixture" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(() => assertGrowthPreviewIsSafe({ NODE_ENV: "production", GROWTH_PREVIEW_MODE: "fixture" } as unknown as NodeJS.ProcessEnv)).toThrow(/仅允许本地/);
  });
});

describe("growth v3.3 preview fixture", () => {
  it("keeps three recoverable title batches per workspace", () => {
    const fixture = createGrowthPreviewFixture();
    for (const account of fixture.accounts) {
      const batches = fixture.runs.filter((run) =>
        run.account_id === account.id
        && run.generation_mode === "default"
        && run.topic_pool.length > 0);
      expect(batches).toHaveLength(3);
      expect(new Set(batches.map((run) => run.id)).size).toBe(3);
      expect(batches.every((run) => run.topic_pool.every((topic) => topic.title_promise_status === "synced"))).toBe(true);
    }
  });

  it("only seeds benchmark titles with usable recent sources", () => {
    const fixture = createGrowthPreviewFixture();
    const buyer = fixture.accounts.find((account) =>
      account.business_line === "overseas_student" && account.persona === "buyer");
    expect(buyer).toBeTruthy();
    const current = fixture.runs.find((run) =>
      run.account_id === buyer?.id
      && run.generation_mode === "default"
      && run.topic_pool.length > 0);
    const benchmark = current?.topic_pool.filter((topic) => topic.method_group === "benchmark") ?? [];
    expect(benchmark.map((topic) => topic.method_id)).toEqual(["similar_audience"]);
    expect(benchmark[0]?.source_snapshot?.link_status).toBe("accessible");
  });
});

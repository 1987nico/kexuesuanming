import { describe, expect, it } from "vitest";
import { assertGrowthPreviewIsSafe, createGrowthPreviewFixture, growthPreviewEnabled } from "./previewFixture";
import { isProfileTitleCompatible } from "./accountIdentity";
import { bodyProfileIdentityProblem } from "./runner";

describe("growth v3.2 local preview fixture", () => {
  it("seeds two business lines with three isolated personas and keeps legacy samples separate", () => {
    const fixture = createGrowthPreviewFixture();
    expect(fixture.accounts).toHaveLength(7);
    expect(new Set(fixture.accounts.map((item) => item.business_line))).toEqual(new Set(["executive", "overseas_student"]));
    for (const businessLine of ["executive", "overseas_student"] as const) {
      expect(new Set(fixture.accounts.filter((item) => item.business_line === businessLine).map((item) => item.persona))).toEqual(new Set(["buyer", "expert", "merchant"]));
    }
    expect(fixture.drafts.filter((item) => item.schema_version === "legacy_v1")).not.toHaveLength(0);
    expect(fixture.drafts.filter((item) => item.schema_version === "method_v3_2").every((item) => item.eligible_for_method_learning)).toBe(true);
    const legacy = fixture.drafts.find((item) => item.schema_version === "legacy_v1")!;
    expect(Object.prototype.hasOwnProperty.call(legacy, "method_id")).toBe(false);
  });

  it("seeds two isolated account personas under the overseas buyer perspective", () => {
    const fixture = createGrowthPreviewFixture();
    const profiles = fixture.accounts.filter((item) =>
      item.business_line === "overseas_student" && item.persona === "buyer");
    expect(profiles.map((item) => item.profile_name)).toEqual([
      "留学生家长号",
      "留学生本人号",
    ]);
    expect(profiles.filter((item) => item.is_default_profile)).toHaveLength(1);
    expect(profiles.every((item) => item.platform_binding?.binding_status === "bound")).toBe(true);
    for (const profile of profiles) {
      const topics = fixture.runs
        .filter((run) => run.account_id === profile.id)
        .flatMap((run) => run.topic_pool);
      expect(
        topics
          .filter((topic) => !isProfileTitleCompatible(topic.title, profile))
          .map((topic) => topic.title),
      ).toEqual([]);
      const currentBodies = fixture.drafts
        .filter((draft) => draft.account_id === profile.id && draft.schema_version === "method_v3_2")
        .map((draft) => ({ title: draft.title, problem: bodyProfileIdentityProblem(draft.body, profile) }))
        .filter((item) => item.problem);
      expect(currentBodies).toEqual([]);
    }
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FileReportStore, SupabaseReportStore } from "./store";
import type { AssessmentProfile } from "./assessmentProfile";
import { withTimeout } from "./timeout";

const mocks = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock("@/lib/db/supabase", () => ({ supabaseServer: () => mocks.client }));

const profile: AssessmentProfile = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  tenant_id: "mianbajun",
  submission_hash: "synthetic-hash",
  customer_name: "模拟用户",
  survey_answers: {},
  value_profile: { liked_values: ["学习"], excluded_values: ["重复"], like_summary: "学习", exclude_summary: "重复", filter_sentence: "学习" },
  talent_answers: { 1: 4 },
  talent_profile: { mode: "local", answer_distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0, 6: 0, 7: 0 }, top_archetypes: [], high_traits: [], low_traits: [] },
  created_at: "2026-10-12T00:00:00.000Z",
  updated_at: "2026-10-12T00:00:00.000Z",
};
const orderInput = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  tenant_id: "mianbajun", assessment_profile_id: profile.id, report_type: "lite" as const, status: "delivering" as const,
};
let fetchMock: ReturnType<typeof vi.fn>;
let rows: Map<string, Record<string, any>>;

beforeEach(() => {
  rows = new Map();
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop()!;
    if (init?.method === "POST") {
      const row = JSON.parse(String(init.body));
      const key = `${table}:${row.id}`;
      if (rows.has(key)) return Response.json({ code: "23505", message: "duplicate primary key" }, { status: 409 });
      rows.set(key, row);
      return Response.json(table === "assessment_profiles" ? { payload: row.payload } : row, { status: 201 });
    }
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    const row = rows.get(`${table}:${id}`);
    return Response.json(row ? [table === "assessment_profiles" ? { payload: row.payload } : row] : []);
  });
  // Run the real Supabase/PostgREST client against an in-process fake transport only.
  mocks.client = createClient("https://database.example.invalid", "synthetic-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchMock as typeof fetch },
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unmocked network is forbidden"); }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("submission storage with synthetic data", () => {
  it("uses primary-key conflict recovery across distinct Supabase store instances", async () => {
    const first = new SupabaseReportStore();
    const second = new SupabaseReportStore();
    const profiles = await Promise.all([
      first.createAssessmentProfileIfAbsent(profile),
      second.createAssessmentProfileIfAbsent({ ...profile, customer_name: "冲突内容不应覆盖" }),
    ]);
    expect(profiles).toEqual([profile, profile]);
    const orders = await Promise.all([first.createReportOrder(orderInput), second.createReportOrder(orderInput)]);
    expect(orders[0].id).toBe(orders[1].id);
    expect(rows.size).toBe(2);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
  });

  it("does not reset a paid order during duplicate insertion", async () => {
    const store = new SupabaseReportStore();
    rows.set(`report_orders:${orderInput.id}`, { ...orderInput, status: "paid", price_cents: 19900 });
    expect(await store.createReportOrder(orderInput)).toMatchObject({ status: "paid", price_cents: 19900 });
  });

  it("propagates non-conflict database failures instead of claiming success", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: "XX000", message: "database unavailable" }, { status: 500 }));
    await expect(new SupabaseReportStore().createAssessmentProfileIfAbsent(profile)).rejects.toMatchObject({ code: "XX000" });
  });

  it.each(["profile read", "profile insert", "order read", "order insert"])("propagates cancellation to actual PostgREST %s", async (stage) => {
    vi.useFakeTimers();
    let receivedSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_, reject) => {
      receivedSignal = init?.signal as AbortSignal;
      receivedSignal.addEventListener("abort", () => reject(receivedSignal!.reason), { once: true });
    }));
    const store = new SupabaseReportStore();
    const operations = {
      "profile read": (signal: AbortSignal) => store.getAssessmentProfile(profile.id, signal),
      "profile insert": (signal: AbortSignal) => store.createAssessmentProfileIfAbsent(profile, signal),
      "order read": (signal: AbortSignal) => store.getReportOrder(orderInput.id, signal),
      "order insert": (signal: AbortSignal) => store.createReportOrder(orderInput, signal),
    };
    const pending = withTimeout(operations[stage as keyof typeof operations] as (signal: AbortSignal) => Promise<unknown>, 10);
    const rejected = expect(pending).rejects.toThrow("operation_timeout");
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    expect(receivedSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps local development retries idempotent after a store restart", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "assessment-store-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    try {
      const first = new FileReportStore();
      await first.createAssessmentProfileIfAbsent(profile);
      await first.createReportOrder(orderInput);
      await first.updateReportOrderStatus(orderInput.id, "delivered");
      const restarted = new FileReportStore();
      expect(await restarted.createAssessmentProfileIfAbsent({ ...profile, customer_name: "不要覆盖" })).toEqual(profile);
      expect(await restarted.createReportOrder(orderInput)).toMatchObject({ id: orderInput.id, status: "delivered" });
      expect(await restarted.listAssessmentProfiles("mianbajun")).toHaveLength(1);
      expect(await restarted.listReportOrders("mianbajun")).toHaveLength(1);
    } finally {
      vi.restoreAllMocks();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

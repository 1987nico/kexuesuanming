import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryReportStore } from "@/lib/reports/store";
import { SUBMISSION_BUDGET } from "@/lib/reports/assessmentSubmission";
import { buildNeutralTalentAnswers } from "@/lib/reports/principlesyouQuestions";
import * as localScoring from "@/lib/reports/principlesyouLocal";
import { POST, maxDuration } from "./route";

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryReportStore,
  settings: vi.fn(),
  activity: vi.fn(),
}));
vi.mock("@/lib/reports/store", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/reports/store")>(),
  reportStore: () => mocks.store,
}));
vi.mock("@/lib/growth/store", () => ({ growthStore: () => ({ getBusinessSettings: mocks.settings }) }));
vi.mock("@/lib/auth/activity", () => ({ logActivity: mocks.activity }));

function body() {
  return {
    submission_id: "550e8400-e29b-41d4-a716-446655440000",
    customer_name: "自动化测试用户",
    customer_contact: "test@example.invalid",
    survey_answers: { goal: "测试", constraint: "模拟" },
    value_profile: { liked_values: ["学习"], excluded_values: ["重复"], like_summary: "学习", exclude_summary: "重复", filter_sentence: "学习" },
    talent_answers: buildNeutralTalentAnswers(),
  };
}

function request(input = body()) {
  return new Request("http://localhost/api/reports/assessment-profiles", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  vi.stubEnv("PRINCIPLESYOU_COLLECT_PATH", "");
  vi.stubEnv("MIANBA_AUTH_SECRET", "unit-test-signing-secret-only");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.store = new MemoryReportStore();
  mocks.settings.mockReset().mockResolvedValue({ report_lite_price: "199元" });
  mocks.activity.mockReset().mockResolvedValue(undefined);
  // No test can call the real provider. Normal fallback exercises the actual local scorer.
  fetchMock = vi.fn().mockRejectedValue(new Error("mock provider unavailable"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("assessment submission reliability", () => {
  it("aborts two slow attempts, saves all answers and a local profile, and responds below maxDuration", async () => {
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_, reject) => {
      const signal = init.signal as AbortSignal;
      signals.push(signal);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const started = performance.now();
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(SUBMISSION_BUDGET.syncMs);
    const response = await pending;
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result).toMatchObject({ talent_source: "local", attempts: 2, order: { status: "delivering", price_cents: 19900 } });
    expect(result.profile.talent_answers).toEqual(body().talent_answers);
    expect(result.profile.talent_profile.high_traits.length).toBeGreaterThan(0);
    expect(result.links.initial_report_url).toContain("access_token=");
    expect(await mocks.store.listAssessmentProfiles("mianbajun")).toHaveLength(1);
    expect(await mocks.store.listReportOrders("mianbajun")).toHaveLength(1);
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(performance.now() - started).toBeLessThan(maxDuration * 1000);
    expect(maxDuration * 1000).toBe(SUBMISSION_BUDGET.runtimeMs);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("subtracts earlier delays from the sync budget and reserves time for slow persistence", async () => {
    const req = request();
    vi.spyOn(req, "json").mockImplementation(async () => { await delay(4900); return body(); });
    for (const method of ["getAssessmentProfile", "createAssessmentProfileIfAbsent", "getReportOrder", "createReportOrder"] as const) {
      const original = mocks.store[method].bind(mocks.store) as (...args: any[]) => Promise<any>;
      vi.spyOn(mocks.store, method).mockImplementation(async (...args: any[]) => { await delay(4900); return original(...args); });
    }
    mocks.settings.mockImplementation(async () => { await delay(4900); return { report_lite_price: "199" }; });
    mocks.activity.mockImplementation(() => delay(900));
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    let finishedAt = Infinity;
    const pending = POST(req).then((response) => { finishedAt = performance.now(); return response; });
    await vi.advanceTimersByTimeAsync(SUBMISSION_BUDGET.responseMs);
    expect((await pending).status).toBe(200);
    expect(finishedAt).toBeLessThan(SUBMISSION_BUDGET.responseMs);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns the existing result on retry and preserves delivered order status", async () => {
    const first = await (await POST(request())).json();
    await mocks.store.updateReportOrderStatus(first.order.id, "delivered");
    const retry = await (await POST(request())).json();
    expect(retry.profile).toEqual(first.profile);
    expect(retry.order).toMatchObject({ id: first.order.id, status: "delivered" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.settings).toHaveBeenCalledTimes(1);
    expect(await mocks.store.listAssessmentProfiles("mianbajun")).toHaveLength(1);
    expect(await mocks.store.listReportOrders("mianbajun")).toHaveLength(1);
  });

  it("arbitrates concurrent identical submissions through stable primary keys", async () => {
    const responses = await Promise.all([POST(request()), POST(request()), POST(request())]);
    const results = await Promise.all(responses.map((response) => response.json()));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(new Set(results.map((result) => result.profile.id)).size).toBe(1);
    expect(new Set(results.map((result) => result.order.id)).size).toBe(1);
    expect(await mocks.store.listAssessmentProfiles("mianbajun")).toHaveLength(1);
    expect(await mocks.store.listReportOrders("mianbajun")).toHaveLength(1);
  });

  it("rejects conflicting key reuse without exposing or overwriting the existing profile", async () => {
    const first = await (await POST(request())).json();
    const response = await POST(request({ ...body(), customer_name: "另一个测试用户" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "submission_conflict", message: "同一提交编号不能用于不同测评内容。", retryable: false });
    expect(await mocks.store.getAssessmentProfile(first.profile.id)).toEqual(first.profile);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("also rejects a conflicting request that loses a concurrent insert race", async () => {
    const responses = await Promise.all([POST(request()), POST(request({ ...body(), customer_name: "另一个测试用户" }))]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await mocks.store.listAssessmentProfiles("mianbajun")).toHaveLength(1);
    expect(await mocks.store.listReportOrders("mianbajun")).toHaveLength(1);
  });

  it("treats reordered JSON keys as the same submission", async () => {
    const first = await (await POST(request())).json();
    const input = body();
    input.survey_answers = { constraint: "模拟", goal: "测试" };
    expect((await (await POST(request(input))).json()).profile.id).toBe(first.profile.id);
  });

  it("does not merge separate submissions from the same customer", async () => {
    const first = await (await POST(request())).json();
    const second = await (await POST(request({ ...body(), submission_id: crypto.randomUUID() }))).json();
    expect(first.profile.id).not.toBe(second.profile.id);
    expect(await mocks.store.listReportOrders("mianbajun")).toHaveLength(2);
  });

  it("recovers a profile write that committed before its response was lost", async () => {
    const create = mocks.store.createAssessmentProfileIfAbsent.bind(mocks.store);
    vi.spyOn(mocks.store, "createAssessmentProfileIfAbsent").mockImplementationOnce(async (...args) => {
      await create(...args);
      throw new Error("connection lost after commit");
    });
    expect((await POST(request())).status).toBe(503);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await mocks.store.listAssessmentProfiles("mianbajun")).toHaveLength(1);
    expect(await mocks.store.listReportOrders("mianbajun")).toHaveLength(1);
  });

  it("repairs a missing order on retry without rescoring or losing answers", async () => {
    vi.spyOn(mocks.store, "createReportOrder").mockRejectedValueOnce(new Error("database unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ retryable: true, profile_saved: true });
    expect((await mocks.store.listAssessmentProfiles("mianbajun"))[0].talent_answers).toEqual(body().talent_answers);
    expect((await POST(request())).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await mocks.store.listReportOrders("mianbajun")).toHaveLength(1);
  });

  it("reuses an order that committed before its response was lost", async () => {
    const create = mocks.store.createReportOrder.bind(mocks.store);
    vi.spyOn(mocks.store, "createReportOrder").mockImplementationOnce(async (...args) => {
      await create(...args);
      throw new Error("connection lost after commit");
    });
    expect((await POST(request())).status).toBe(503);
    const [order] = await mocks.store.listReportOrders("mianbajun");
    await mocks.store.updateReportOrderStatus(order.id, "paid");
    const result = await (await POST(request())).json();
    expect(result.order).toMatchObject({ id: order.id, status: "paid" });
    expect(mocks.store.createReportOrder).toHaveBeenCalledTimes(1);
    expect(await mocks.store.listReportOrders("mianbajun")).toHaveLength(1);
  });

  it.each(["getAssessmentProfile", "createAssessmentProfileIfAbsent", "getReportOrder", "createReportOrder"] as const)(
    "returns a bounded retryable result if %s stalls, then succeeds on retry",
    async (method) => {
      let signal: AbortSignal | undefined;
      const spy = vi.spyOn(mocks.store, method).mockImplementationOnce((...args: any[]) => {
        signal = args[1];
        return new Promise<never>(() => {});
      });
      const pending = POST(request());
      await vi.advanceTimersByTimeAsync(5000);
      const response = await pending;
      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("2");
      expect(signal?.aborted).toBe(true);
      spy.mockRestore();
      expect((await POST(request())).status).toBe(200);
      expect(await mocks.store.listAssessmentProfiles("mianbajun")).toHaveLength(1);
      expect(await mocks.store.listReportOrders("mianbajun")).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("returns an explicit partial result when business settings stall", async () => {
    mocks.settings.mockImplementationOnce(() => new Promise(() => {}));
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(5000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ profile_saved: true });
    expect((await POST(request())).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not make a successful submission fail when audit logging stalls", async () => {
    mocks.activity.mockImplementationOnce(() => new Promise(() => {}));
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).status).toBe(200);
  });

  it("returns a clear retryable error if local scoring fails", async () => {
    vi.spyOn(localScoring, "generateLocalTalentProfile").mockImplementationOnce(() => { throw new Error("scoring failure"); });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ retryable: true, profile_saved: false });
    expect(await mocks.store.listAssessmentProfiles("mianbajun")).toHaveLength(0);
  });

  it("rejects incomplete or unknown question IDs and missing submission keys before any I/O", async () => {
    const input = body();
    const question = Number(Object.keys(input.talent_answers)[0]);
    delete input.talent_answers[question];
    input.talent_answers[999999] = 4;
    expect((await POST(request(input))).status).toBe(400);
    expect((await POST(request({ ...body(), submission_id: "" }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await mocks.store.listAssessmentProfiles("mianbajun")).toHaveLength(0);
  });
});

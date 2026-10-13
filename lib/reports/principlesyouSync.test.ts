import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateTalentProfileWithFallback } from "./principlesyouSync";
import { buildNeutralTalentAnswers } from "./principlesyouQuestions";

const answers = buildNeutralTalentAnswers();
const results = { all_archetypes: [{ key: "test", display_name: "测试原型", percentile: 80 }], dimensions: [] };
const home = '<meta name="csrf-token" content="test"><div data-react-class="src/Home/Home" data-react-props="{&quot;questions_path&quot;:&quot;/questions&quot;}">';
let fetchMock: ReturnType<typeof vi.fn>;

function stageOf(url: string, init?: RequestInit) {
  const path = new URL(url).pathname;
  return path === "/questions" && init?.method === "POST" ? "/answers" : path;
}

function responseFor(stage: string) {
  switch (stage) {
    case "/home": return new Response(home);
    case "/questions": return Response.json({ questions: [{ number: 1 }] });
    case "/answers": return Response.json({ assessment_complete: true });
    case "/score_user": return new Response("");
    case "/full_results_json": return Response.json(results);
    default: throw new Error(`Unexpected mocked request: ${stage}`);
  }
}

function stalled(signal: AbortSignal) {
  return new Promise<Response>((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  vi.stubEnv("PRINCIPLESYOU_COLLECT_PATH", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(responseFor(stageOf(url, init))));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("bounded PrinciplesYou sync using only mocked HTTP", () => {
  it("accepts a slow successful result inside the budget", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const stage = stageOf(url, init);
      if (stage === "/full_results_json") return new Promise((resolve) => setTimeout(() => resolve(responseFor(stage)), 75));
      return Promise.resolve(responseFor(stage));
    });
    const pending = generateTalentProfileWithFallback(answers, { timeoutMs: 100, totalTimeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(75);
    const result = await pending;
    expect(result).toMatchObject({ source: "original-sync", attempts: 1 });
    expect(result.profile.top_archetypes[0].key).toBe("test");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["/home", "/questions", "/answers", "/score_user", "/full_results_json"])(
    "cancels continuous timeouts at %s and starts local scoring at the shared deadline",
    async (slowStage) => {
      const signals: AbortSignal[] = [];
      fetchMock.mockImplementation((url: string, init?: RequestInit) => {
        const stage = stageOf(url, init);
        if (stage === slowStage) {
          signals.push(init!.signal as AbortSignal);
          return stalled(init!.signal as AbortSignal);
        }
        return Promise.resolve(responseFor(stage));
      });
      const pending = generateTalentProfileWithFallback(answers, { retries: 4, timeoutMs: 30, totalTimeoutMs: 50 });
      let settled = false;
      void pending.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(49);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const result = await pending;
      expect(result).toMatchObject({ source: "local", attempts: 2 });
      expect(result.profile.evidence).toMatchObject({ retry_count: 1, fallback_reason: "original_sync_timeout" });
      expect(result.profile.top_archetypes.length).toBeGreaterThan(0);
      expect(Object.values(result.profile.answer_distribution).reduce((a, b) => a + b, 0)).toBe(252);
      expect(signals).toHaveLength(2);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
      const calls = fetchMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10000);
      expect(fetchMock).toHaveBeenCalledTimes(calls);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("times out response body consumption even after successful headers", async () => {
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const stage = stageOf(url, init);
      if (stage === "/full_results_json") {
        const signal = init!.signal as AbortSignal;
        signals.push(signal);
        const response = responseFor(stage);
        response.json = () => stalled(signal);
        return Promise.resolve(response);
      }
      return Promise.resolve(responseFor(stage));
    });
    const pending = generateTalentProfileWithFallback(answers, { retries: 0, timeoutMs: 20, totalTimeoutMs: 20 });
    await vi.advanceTimersByTimeAsync(20);
    expect((await pending).source).toBe("local");
    expect(signals[0].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels result polling and clears its pending sleep", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const stage = stageOf(url, init);
      return Promise.resolve(stage === "/full_results_json" ? new Response(null, { status: 202 }) : responseFor(stage));
    });
    const pending = generateTalentProfileWithFallback(answers, { retries: 0, timeoutMs: 2500, totalTimeoutMs: 2500 });
    await vi.advanceTimersByTimeAsync(2500);
    expect((await pending).source).toBe("local");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/full_results_json"))).toHaveLength(2);
    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(200000);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries a transient failure and reports the actual attempt count", async () => {
    fetchMock.mockRejectedValueOnce(new Error("temporary outage"));
    const result = await generateTalentProfileWithFallback(answers, { retries: 1 });
    expect(result).toMatchObject({ source: "original-sync", attempts: 2 });
    expect(result.profile.evidence?.retry_count).toBe(1);
  });

  it("uses a finite budget by default", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => stalled(init!.signal as AbortSignal));
    const pending = generateTalentProfileWithFallback(answers);
    await vi.advanceTimersByTimeAsync(80000);
    expect(await pending).toMatchObject({ source: "local", attempts: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips network attempts when no time remains", async () => {
    expect(await generateTalentProfileWithFallback(answers, { totalTimeoutMs: 0 })).toMatchObject({ source: "local", attempts: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not start another stage when a timed-out transport resolves late", async () => {
    fetchMock.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(new Response(home)), 100)));
    const pending = generateTalentProfileWithFallback(answers, { retries: 0, timeoutMs: 10, totalTimeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect((await pending).source).toBe("local");
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back without calling legacy external collectors that cannot cancel I/O", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "assessment-collector-test-"));
    const collectorPath = path.join(directory, "legacy.mjs");
    writeFileSync(collectorPath, 'export async function createSession() { throw new Error("must not start"); }');
    vi.stubEnv("PRINCIPLESYOU_COLLECT_PATH", collectorPath);
    try {
      const result = await generateTalentProfileWithFallback(answers, { retries: 0 });
      expect(result.source).toBe("local");
      expect(result.profile.evidence?.fallback_reason).toBe("original_sync_collector_missing_abort_support");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails fast on unavailable scoring and falls back locally", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const stage = stageOf(url, init);
      return Promise.resolve(stage === "/score_user" ? new Response("unavailable", { status: 503 }) : responseFor(stage));
    });
    expect(await generateTalentProfileWithFallback(answers, { retries: 1 })).toMatchObject({ source: "local", attempts: 2 });
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/full_results_json"))).toBe(false);
  });

  it("rejects non-progressing pagination without exhausting the runtime", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const stage = stageOf(url, init);
      return Promise.resolve(stage === "/questions" ? Response.json({ questions: [] }) : responseFor(stage));
    });
    const result = await generateTalentProfileWithFallback(answers, { retries: 0 });
    expect(result.profile.evidence?.fallback_reason).toBe("original_sync_no_progress");
  });
});

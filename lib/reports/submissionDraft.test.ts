import { describe, expect, it } from "vitest";
import { prepareSubmission } from "./submissionDraft";

describe("browser submission recovery", () => {
  it("persists the full pending request before sending, and reuses its key after a lost response or refresh", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const body = { customer_name: "测试用户", talent_answers: { 1: 4 } };
    const first = prepareSubmission(storage, "submission", body);
    expect(JSON.parse(storage.getItem("submission")!).body).toBe(JSON.stringify(body));
    expect(prepareSubmission(storage, "submission", JSON.parse(JSON.stringify(body)))).toEqual(first);
    expect(prepareSubmission(storage, "submission", { ...body, talent_answers: { 1: 5 } }).submission_id).not.toBe(first.submission_id);
    data.delete("submission");
    expect(prepareSubmission(storage, "submission", body).submission_id).not.toBe(first.submission_id);
  });

  it("does not prepare a sendable request if durable browser storage fails", () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error("storage full"); } };
    expect(() => prepareSubmission(storage, "submission", { answers: [4] })).toThrow("storage full");
  });
});

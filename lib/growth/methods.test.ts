import { describe, expect, it } from "vitest";
import { methodsForPersona, methodApplicability } from "./methods";

describe("13种标题方法适配矩阵", () => {
  it.each([
    ["buyer", 7, 5],
    ["expert", 11, 2],
    ["merchant", 7, 5],
  ] as const)("%s默认%d个、探索%d个", (persona, defaults, explores) => {
    expect(methodsForPersona(persona, "default")).toHaveLength(defaults);
    expect(methodsForPersona(persona, "explore")).toHaveLength(explores);
  });

  it("禁用方法不能被覆盖为默认", () => {
    expect(methodApplicability("buyer", "same_product", { same_product: "default" })).toBe("disabled");
    expect(methodApplicability("merchant", "nostalgia", { nostalgia: "explore" })).toBe("disabled");
  });
});

import { describe, expect, it } from "vitest";
import {
  GROWTH_BUSINESS_LINES,
  GROWTH_PERSONAS,
} from "./types";
import { personaGenerationStrategy } from "./personaCreation";

describe("人设首次创建策略", () => {
  it.each(
    GROWTH_BUSINESS_LINES.flatMap((businessLine) =>
      GROWTH_PERSONAS.map((persona) => [businessLine, persona] as const),
    ),
  )("%s × %s 首次创建时直接保存", (businessLine, persona) => {
    expect(personaGenerationStrategy(null)).toEqual({
      previewOnly: false,
      savesImmediately: true,
    });
    expect(businessLine).toBeTruthy();
    expect(persona).toBeTruthy();
  });

  it("已有账号时只生成修改预览", () => {
    expect(personaGenerationStrategy({ id: "account-existing" })).toEqual({
      previewOnly: true,
      regenerateAccountId: "account-existing",
      savesImmediately: false,
    });
  });
});

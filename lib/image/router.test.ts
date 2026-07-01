import { describe, expect, it } from "vitest";
import { isImageProviderConfigured } from "./router";

describe("image provider config", () => {
  it("detects when OpenAI image provider is configured", () => {
    expect(isImageProviderConfigured({ OPENAI_API_KEY: "sk-test" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it("detects when no image provider is configured", () => {
    expect(isImageProviderConfigured({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});

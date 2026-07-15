import { describe, expect, it } from "vitest";
import { isImageProviderConfigured, OPENAI_IMAGE_MODEL } from "./router";

describe("image provider config", () => {
  it("detects when OpenAI image provider is configured", () => {
    expect(isImageProviderConfigured({ OPENAI_API_KEY: "sk-test" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it("detects when no image provider is configured", () => {
    expect(isImageProviderConfigured({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("does not fall back to Volcengine credentials", () => {
    expect(
      isImageProviderConfigured({
        IMAGE_PROVIDER: "volcengine",
        VOLCENGINE_AK: "test-ak",
        VOLCENGINE_SK: "test-sk",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("uses GPT Image 2 as the fixed image model", () => {
    expect(OPENAI_IMAGE_MODEL).toBe("gpt-image-2");
  });
});

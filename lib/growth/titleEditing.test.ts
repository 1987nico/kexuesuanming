import { describe, expect, it } from "vitest";
import {
  MANUAL_TITLE_MAX_LENGTH,
  manualTitleLength,
  manualTitleValidationError,
} from "./titleEditing";

describe("manual title editing", () => {
  it("counts final Chinese text instead of the temporary pinyin composition", () => {
    expect(manualTitleLength("38岁尴尬降薪去小公司，还是去创业")).toBe(17);
    expect(manualTitleValidationError("38岁尴尬降薪去小公司，还是去创业")).toBeNull();
  });

  it("reports but never truncates a temporary pinyin composition above 20 characters", () => {
    const composingTitle = "38岁gangga降薪去小公司，还是去创业";
    expect(manualTitleLength(composingTitle)).toBe(21);
    expect(manualTitleValidationError(composingTitle)).toBe("超出1字，请删减后保存");
    expect(composingTitle.endsWith("去创业")).toBe(true);
  });

  it("accepts exactly 20 characters", () => {
    const title = "一".repeat(MANUAL_TITLE_MAX_LENGTH);
    expect(manualTitleValidationError(title)).toBeNull();
  });

  it("rejects an empty or over-limit final title without changing it", () => {
    const title = "一".repeat(MANUAL_TITLE_MAX_LENGTH + 3);
    expect(manualTitleValidationError("   ")).toBe("标题不能为空");
    expect(manualTitleValidationError(title)).toBe("超出3字，请删减后保存");
    expect(title).toHaveLength(MANUAL_TITLE_MAX_LENGTH + 3);
  });
});

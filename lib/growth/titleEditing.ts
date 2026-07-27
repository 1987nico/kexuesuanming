export const MANUAL_TITLE_MAX_LENGTH = 20;

export function manualTitleLength(title: string) {
  return Array.from(title.trim()).length;
}

export function manualTitleValidationError(title: string): string | null {
  const length = manualTitleLength(title);
  if (length === 0) return "标题不能为空";
  if (length > MANUAL_TITLE_MAX_LENGTH) {
    return `超出${length - MANUAL_TITLE_MAX_LENGTH}字，请删减后保存`;
  }
  return null;
}

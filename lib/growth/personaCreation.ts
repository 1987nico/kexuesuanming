import type { GrowthAccount } from "./types";

export interface PersonaGenerationStrategy {
  previewOnly: boolean;
  regenerateAccountId?: string;
  savesImmediately: boolean;
}

/**
 * 首次创建没有可覆盖的数据，应直接落库并解锁后续流程。
 * 已有人设时只生成预览，继续由运营确认后保存。
 */
export function personaGenerationStrategy(
  account: Pick<GrowthAccount, "id"> | null | undefined,
): PersonaGenerationStrategy {
  if (!account) {
    return {
      previewOnly: false,
      savesImmediately: true,
    };
  }

  return {
    previewOnly: true,
    regenerateAccountId: account.id,
    savesImmediately: false,
  };
}

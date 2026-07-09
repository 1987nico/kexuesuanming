export interface DirectionSwipeProgressInput {
  confirmedLikes: number;
  confirmedSwipedCount: number;
  targetLikes: number;
  pendingSwipes: Record<string, boolean>;
  completed: boolean;
}

export interface DirectionSwipeProgress {
  visibleLikes: number;
  visibleSwipedCount: number;
  pendingSwipeCount: number;
  pendingLikedCount: number;
  waitingForFinalConfirmation: boolean;
  isComplete: boolean;
}

export function getDirectionSwipeProgress(input: DirectionSwipeProgressInput): DirectionSwipeProgress {
  const targetLikes = Math.max(1, input.targetLikes);
  const confirmedLikes = Math.min(targetLikes, Math.max(0, input.confirmedLikes));
  const confirmedSwipedCount = Math.max(0, input.confirmedSwipedCount);
  const pendingSwipeValues = Object.values(input.pendingSwipes);
  const pendingSwipeCount = pendingSwipeValues.length;
  const pendingLikedCount = pendingSwipeValues.filter(Boolean).length;
  const isComplete = input.completed || confirmedLikes >= targetLikes;

  return {
    visibleLikes: confirmedLikes,
    visibleSwipedCount: confirmedSwipedCount,
    pendingSwipeCount,
    pendingLikedCount,
    waitingForFinalConfirmation:
      !isComplete && pendingLikedCount > 0 && confirmedLikes < targetLikes && confirmedLikes + pendingLikedCount >= targetLikes,
    isComplete,
  };
}

export function shouldRestoreFailedSwipe(input: {
  cardId: string;
  confirmedSwipedIds: Set<string>;
  confirmedLikes: number;
  targetLikes: number;
  completed: boolean;
}) {
  if (input.completed || input.confirmedLikes >= input.targetLikes) return false;
  return !input.confirmedSwipedIds.has(input.cardId);
}

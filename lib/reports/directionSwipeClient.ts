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

export function shouldIgnoreStaleServerSession(input: {
  trustServer: boolean;
  serverStatus: "active" | "completed";
  serverLikes: number;
  serverSwipedCount: number;
  serverUpdatedAt: string;
  currentLikes: number;
  currentSwipedCount: number;
  currentUpdatedAt: string;
}) {
  if (input.trustServer || input.serverStatus === "completed") return false;
  const serverUpdatedAt = Date.parse(input.serverUpdatedAt || "");
  const currentUpdatedAt = Date.parse(input.currentUpdatedAt || "");
  return (
    input.serverSwipedCount < input.currentSwipedCount ||
    (input.serverSwipedCount === input.currentSwipedCount && input.serverLikes < input.currentLikes) ||
    (Number.isFinite(serverUpdatedAt) &&
      Number.isFinite(currentUpdatedAt) &&
      serverUpdatedAt < currentUpdatedAt &&
      input.serverSwipedCount <= input.currentSwipedCount)
  );
}

export function reconcileDirectionCardQueue<T extends { id: string }>(input: {
  currentQueue: T[];
  serverCards: T[];
  pendingCardIds: Set<string>;
  confirmedSwipedIds: Set<string>;
  replace: boolean;
}): T[] {
  const next = input.replace
    ? []
    : input.currentQueue.filter(
        (card) => !input.pendingCardIds.has(card.id) && !input.confirmedSwipedIds.has(card.id)
      );
  const knownIds = new Set(next.map((card) => card.id));

  for (const card of input.serverCards) {
    if (knownIds.has(card.id) || input.pendingCardIds.has(card.id) || input.confirmedSwipedIds.has(card.id)) {
      continue;
    }
    knownIds.add(card.id);
    next.push(card);
  }

  return next;
}

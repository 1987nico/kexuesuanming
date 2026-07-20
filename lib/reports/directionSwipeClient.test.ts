import { describe, expect, it } from "vitest";
import {
  getDirectionSwipeProgress,
  reconcileDirectionCardQueue,
  shouldIgnoreStaleServerSession,
  shouldRestoreFailedSwipe,
} from "./directionSwipeClient";

describe("direction swipe client progress", () => {
  it("does not show a fake 10/10 while the final liked swipe is still pending", () => {
    const progress = getDirectionSwipeProgress({
      confirmedLikes: 9,
      confirmedSwipedCount: 24,
      targetLikes: 10,
      pendingSwipes: { c25: true },
      completed: false,
    });

    expect(progress.visibleLikes).toBe(9);
    expect(progress.visibleSwipedCount).toBe(24);
    expect(progress.waitingForFinalConfirmation).toBe(true);
    expect(progress.isComplete).toBe(false);
  });

  it("only reports completion after confirmed likes reach the target", () => {
    const progress = getDirectionSwipeProgress({
      confirmedLikes: 10,
      confirmedSwipedCount: 25,
      targetLikes: 10,
      pendingSwipes: {},
      completed: false,
    });

    expect(progress.visibleLikes).toBe(10);
    expect(progress.waitingForFinalConfirmation).toBe(false);
    expect(progress.isComplete).toBe(true);
  });

  it("does not let pending non-final swipes advance the official counters", () => {
    const progress = getDirectionSwipeProgress({
      confirmedLikes: 4,
      confirmedSwipedCount: 10,
      targetLikes: 10,
      pendingSwipes: { c11: true, c12: false },
      completed: false,
    });

    expect(progress.visibleLikes).toBe(4);
    expect(progress.visibleSwipedCount).toBe(10);
    expect(progress.pendingSwipeCount).toBe(2);
    expect(progress.waitingForFinalConfirmation).toBe(false);
  });

  it("restores a failed swipe only when the server has not confirmed it", () => {
    expect(
      shouldRestoreFailedSwipe({
        cardId: "c10",
        confirmedSwipedIds: new Set(["c1", "c2"]),
        confirmedLikes: 9,
        targetLikes: 10,
        completed: false,
      })
    ).toBe(true);

    expect(
      shouldRestoreFailedSwipe({
        cardId: "c10",
        confirmedSwipedIds: new Set(["c10"]),
        confirmedLikes: 10,
        targetLikes: 10,
        completed: true,
      })
    ).toBe(false);
  });

  it("ignores older background responses but accepts trusted server revalidation", () => {
    const base = {
      serverStatus: "active" as const,
      serverLikes: 0,
      serverSwipedCount: 0,
      serverUpdatedAt: "2026-07-08T12:00:00.000Z",
      currentLikes: 7,
      currentSwipedCount: 20,
      currentUpdatedAt: "2026-07-09T02:30:00.000Z",
    };

    expect(shouldIgnoreStaleServerSession({ ...base, trustServer: false })).toBe(true);
    expect(shouldIgnoreStaleServerSession({ ...base, trustServer: true })).toBe(false);
  });

  it("replaces stale local cards when syncing from a trusted server state", () => {
    const queue = reconcileDirectionCardQueue({
      currentQueue: [{ id: "old-local" }, { id: "already-swiped" }],
      serverCards: [{ id: "server-1" }, { id: "server-2" }],
      pendingCardIds: new Set(),
      confirmedSwipedIds: new Set(["already-swiped"]),
      replace: true,
    });

    expect(queue.map((card) => card.id)).toEqual(["server-1", "server-2"]);
  });

  it("does not show pending or confirmed cards after a server card merge", () => {
    const queue = reconcileDirectionCardQueue({
      currentQueue: [{ id: "current" }, { id: "pending" }],
      serverCards: [{ id: "pending" }, { id: "confirmed" }, { id: "new" }],
      pendingCardIds: new Set(["pending"]),
      confirmedSwipedIds: new Set(["confirmed"]),
      replace: false,
    });

    expect(queue.map((card) => card.id)).toEqual(["current", "new"]);
  });
});

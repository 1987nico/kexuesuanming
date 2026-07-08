import { describe, expect, it } from "vitest";
import { mergeDirectionSessions, sessionLikes, type DirectionCard, type DirectionSession } from "./directionSession";

function card(id: string, round = 1): DirectionCard {
  return {
    id,
    round,
    title: `方向${id}`,
    one_liner: "一句话说明",
    typical_day: "早上访谈，中午拆解，晚上输出方案。",
    work_content: "访谈/判断/输出",
    scene: "测试场景",
    role: "测试角色",
  };
}

function session(overrides: Partial<DirectionSession> = {}): DirectionSession {
  const now = new Date().toISOString();
  return {
    status: "active",
    target_likes: 10,
    cards: [card("c1"), card("c2"), card("c3")],
    swipes: [],
    rounds_generated: 1,
    generating: false,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe("direction session merge", () => {
  it("preserves newer swipes when a stale generation result adds cards", () => {
    const startedAt = new Date().toISOString();
    const latest = session({
      cards: [card("c1"), card("c2"), card("c3"), card("c4")],
      swipes: [
        { card_id: "c1", liked: true, swiped_at: "2026-07-08T00:00:01.000Z" },
        { card_id: "c2", liked: false, swiped_at: "2026-07-08T00:00:02.000Z" },
        { card_id: "c3", liked: true, swiped_at: "2026-07-08T00:00:03.000Z" },
        { card_id: "c4", liked: true, swiped_at: "2026-07-08T00:00:04.000Z" },
      ],
      generating: true,
      generating_started_at: startedAt,
      rounds_generated: 1,
    });
    const incoming = session({
      cards: [card("c1"), card("c2"), card("c3"), card("c4"), card("c5", 2), card("c6", 2)],
      swipes: [
        { card_id: "c1", liked: true, swiped_at: "2026-07-08T00:00:01.000Z" },
        { card_id: "c2", liked: false, swiped_at: "2026-07-08T00:00:02.000Z" },
      ],
      generating: false,
      generating_started_at: startedAt,
      rounds_generated: 2,
    });

    const merged = mergeDirectionSessions(latest, incoming, { preferIncomingGenerationState: true });

    expect(merged?.cards).toHaveLength(6);
    expect(merged?.swipes).toHaveLength(4);
    expect(sessionLikes(merged!)).toBe(3);
    expect(merged?.rounds_generated).toBe(2);
    expect(merged?.generating).toBe(false);
  });

  it("keeps an active generation lock while merging a swipe response", () => {
    const latest = session({
      cards: [card("c1"), card("c2"), card("c3")],
      swipes: [{ card_id: "c1", liked: true, swiped_at: "2026-07-08T00:00:01.000Z" }],
      generating: true,
      generating_started_at: new Date().toISOString(),
    });
    const incoming = session({
      cards: [card("c1"), card("c2"), card("c3")],
      swipes: [
        { card_id: "c1", liked: true, swiped_at: "2026-07-08T00:00:01.000Z" },
        { card_id: "c2", liked: true, swiped_at: "2026-07-08T00:00:02.000Z" },
      ],
      generating: false,
    });

    const merged = mergeDirectionSessions(latest, incoming);

    expect(merged?.swipes.map((swipe) => swipe.card_id)).toEqual(["c1", "c2"]);
    expect(merged?.generating).toBe(true);
  });

  it("marks the merged session completed once combined likes reach the target", () => {
    const latest = session({
      target_likes: 3,
      cards: [card("c1"), card("c2"), card("c3")],
      swipes: [
        { card_id: "c1", liked: true, swiped_at: "2026-07-08T00:00:01.000Z" },
        { card_id: "c2", liked: true, swiped_at: "2026-07-08T00:00:02.000Z" },
      ],
    });
    const incoming = session({
      target_likes: 3,
      cards: [card("c1"), card("c2"), card("c3")],
      swipes: [{ card_id: "c3", liked: true, swiped_at: "2026-07-08T00:00:03.000Z" }],
    });

    const merged = mergeDirectionSessions(latest, incoming);

    expect(sessionLikes(merged!)).toBe(3);
    expect(merged?.status).toBe("completed");
    expect(merged?.completed_at).toBeTruthy();
    expect(merged?.generating).toBe(false);
  });
});

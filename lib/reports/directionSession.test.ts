import { describe, expect, it } from "vitest";
import {
  DIRECTION_MAX_ROUNDS,
  finalizeDirectionSessionIfNeeded,
  lockDirectionGenerationIfNeeded,
  mergeDirectionSessions,
  recordSwipe,
  sessionClientView,
  sessionLikes,
  type DirectionCard,
  type DirectionSession,
} from "./directionSession";
import type { AssessmentProfile } from "./assessmentProfile";

function card(id: string, round = 1): DirectionCard {
  return {
    id,
    round,
    title: `方向${id}`,
    one_liner: "一句话说明",
    typical_day: "早上访谈，中午拆解，晚上输出方案。",
    work_content: "访谈/判断/输出",
    scene: `测试场景${id}`,
    role: `测试角色${id}`,
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

  it("clears an older generation lock when the completed generation state is newer", () => {
    const latest = session({
      cards: [card("c1"), card("c2")],
      generating: true,
      generating_started_at: "2026-07-08T00:00:01.000Z",
      updated_at: "2026-07-08T00:00:01.000Z",
    });
    const incoming = session({
      cards: [card("c1"), card("c2"), card("c3", 2), card("c4", 2)],
      rounds_generated: 2,
      generating: false,
      generating_started_at: undefined,
      updated_at: "2026-07-08T00:01:00.000Z",
    });

    const merged = mergeDirectionSessions(latest, incoming, { preferIncomingGenerationState: true });

    expect(merged?.cards).toHaveLength(4);
    expect(merged?.rounds_generated).toBe(2);
    expect(merged?.generating).toBe(false);
    expect(merged?.generating_started_at).toBeUndefined();
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

  it("does not complete a session below target even when the old max-round fallback had completed it", () => {
    const cards = Array.from({ length: 10 }, (_, index) => card(`c${index + 1}`, DIRECTION_MAX_ROUNDS));
    const latest = session({
      status: "completed",
      target_likes: 10,
      cards,
      swipes: cards.map((item, index) => ({
        card_id: item.id,
        liked: index < 8,
        swiped_at: `2026-07-08T00:00:${String(index + 1).padStart(2, "0")}.000Z`,
      })),
      rounds_generated: DIRECTION_MAX_ROUNDS,
      completed_at: "2026-07-08T00:01:00.000Z",
    });

    const merged = mergeDirectionSessions(latest, latest);

    expect(sessionLikes(merged!)).toBe(8);
    expect(merged?.status).toBe("active");
    expect(merged?.completed_at).toBeUndefined();
  });

  it("only recordSwipe-completes when likes reach target", () => {
    const cards = [card("c1"), card("c2"), card("c3")];
    const s = session({
      target_likes: 3,
      cards,
      swipes: [
        { card_id: "c1", liked: true, swiped_at: "2026-07-08T00:00:01.000Z" },
        { card_id: "c2", liked: false, swiped_at: "2026-07-08T00:00:02.000Z" },
      ],
      rounds_generated: DIRECTION_MAX_ROUNDS,
    });

    recordSwipe(s, "c3", false);

    expect(sessionLikes(s)).toBe(1);
    expect(s.status).toBe("active");
    expect(s.completed_at).toBeUndefined();
  });

  it("exposes confirmed swipe ids in the client view so pending progress cannot roll back", () => {
    const s = session({
      swipes: [
        { card_id: "c1", liked: true, swiped_at: "2026-07-08T00:00:01.000Z" },
        { card_id: "c2", liked: false, swiped_at: "2026-07-08T00:00:02.000Z" },
      ],
      updated_at: "2026-07-08T00:00:03.000Z",
    });

    const view = sessionClientView(s);

    expect(view.swiped_card_ids).toEqual(["c1", "c2"]);
    expect(view.updated_at).toBe("2026-07-08T00:00:03.000Z");
  });

  it("hides duplicate options from the client view", () => {
    const s = session({
      cards: [
        { ...card("c1"), title: "AI社媒增长方案工作室主理人", role: "增长方案工作室主理人" },
        { ...card("c2"), title: "AI社媒增长工作室主理人", role: "增长方案工作室主理人" },
        { ...card("c3"), title: "本地商家AI获客服务站老板", role: "本地获客服务站老板" },
      ],
    });

    const view = sessionClientView(s);

    expect(view.cards.map((item) => item.id)).toEqual(["c1", "c3"]);
  });

  it("does not expose more options after completion", () => {
    const s = session({
      target_likes: 1,
      cards: [card("c1"), card("c2")],
      swipes: [{ card_id: "c1", liked: true, swiped_at: "2026-07-08T00:00:01.000Z" }],
    });

    const view = sessionClientView(s);

    expect(view.status).toBe("completed");
    expect(view.cards).toEqual([]);
    expect(view.generating).toBe(false);
  });

  it("finalizes active sessions that already reached the target", () => {
    const s = session({
      target_likes: 2,
      cards: [card("c1"), card("c2"), card("c3")],
      swipes: [
        { card_id: "c1", liked: true, swiped_at: "2026-07-08T00:00:01.000Z" },
        { card_id: "c2", liked: true, swiped_at: "2026-07-08T00:00:02.000Z" },
      ],
      generating: true,
      generating_started_at: "2026-07-08T00:00:03.000Z",
    });

    expect(finalizeDirectionSessionIfNeeded(s)).toBe(true);
    expect(s.status).toBe("completed");
    expect(s.generating).toBe(false);
    expect(s.generating_started_at).toBeUndefined();
    expect(sessionClientView(s)).toMatchObject({
      status: "completed",
      cards: [],
      generating: false,
    });
  });

  it("ignores new swipes after a session is complete", () => {
    const s = session({
      status: "completed",
      target_likes: 1,
      cards: [card("c1"), card("c2")],
      swipes: [{ card_id: "c1", liked: true, swiped_at: "2026-07-08T00:00:01.000Z" }],
      completed_at: "2026-07-08T00:00:02.000Z",
    });

    const result = recordSwipe(s, "c2", true);

    expect(result.duplicate).toBe(true);
    expect(s.swipes.map((swipe) => swipe.card_id)).toEqual(["c1"]);
    expect(sessionLikes(s)).toBe(1);
  });

  it("locks generation without blocking on new cards", async () => {
    const s = session({
      cards: [],
      rounds_generated: 0,
      updated_at: "2026-07-08T00:00:00.000Z",
    });
    const profile = {
      id: "profile-1",
      direction_session: s,
      updated_at: s.updated_at,
    } as AssessmentProfile;
    let saved: DirectionSession | undefined;

    const locked = await lockDirectionGenerationIfNeeded(profile, async (nextProfile) => {
      saved = nextProfile.direction_session;
    });

    expect(locked).toBeTruthy();
    expect(saved?.generating).toBe(true);
    expect(saved?.rounds_generated).toBe(0);
    expect(saved?.cards).toEqual([]);
    expect(sessionClientView(saved!)).toMatchObject({
      cards: [],
      generating: true,
      likes: 0,
      swiped_count: 0,
    });
  });
});

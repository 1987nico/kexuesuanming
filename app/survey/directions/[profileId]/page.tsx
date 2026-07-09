"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";

interface DirectionCard {
  id: string;
  title: string;
  one_liner: string;
  typical_day: string;
  work_content: string;
  scene: string;
  role: string;
}

interface SessionView {
  status: "active" | "completed";
  likes: number;
  target_likes: number;
  swiped_count: number;
  swiped_card_ids: string[];
  cards: DirectionCard[];
  generating: boolean;
  updated_at: string;
}

const SWIPE_THRESHOLD = 90;
const SESSION_FETCH_TIMEOUT_MS = 15_000;
const SWIPE_POST_TIMEOUT_MS = 15_000;
const PENDING_SWIPE_STALE_MS = 12_000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = SESSION_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default function DirectionSwipePage({ params }: { params: { profileId: string } }) {
  const { profileId } = params;
  const [accessQuery, setAccessQuery] = useState<string | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [loadError, setLoadError] = useState("");
  // 本地卡片队列：滑掉的立刻出队（乐观更新），服务器状态到达后合并新卡
  const [queue, setQueue] = useState<DirectionCard[]>([]);
  const [likes, setLikes] = useState(0);
  const [swipedCount, setSwipedCount] = useState(0);
  const [pendingSwipes, setPendingSwipes] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState(false);
  const [exitDirection, setExitDirection] = useState<1 | -1>(1);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCardIds = useRef(new Map<string, number>());
  const swipePostQueue = useRef(Promise.resolve());
  const serverProgress = useRef({ likes: 0, swipedCount: 0, updatedAt: "" });

  const mergeServerCards = useCallback((cards: DirectionCard[]) => {
    if (cards.length === 0) return;
    const now = Date.now();
    const stalePendingIds: string[] = [];
    for (const card of cards) {
      const startedAt = pendingCardIds.current.get(card.id);
      if (startedAt && now - startedAt > PENDING_SWIPE_STALE_MS) {
        pendingCardIds.current.delete(card.id);
        stalePendingIds.push(card.id);
      }
    }
    if (stalePendingIds.length > 0) {
      setPendingSwipes((current) => {
        let changed = false;
        const next = { ...current };
        for (const id of stalePendingIds) {
          if (id in next) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }
    setQueue((current) => {
      const currentIds = new Set(current.map((card) => card.id));
      const next = [...current];
      for (const card of cards) {
        if (currentIds.has(card.id) || pendingCardIds.current.has(card.id)) continue;
        currentIds.add(card.id);
        next.push(card);
      }
      return next;
    });
  }, []);

  const applyServerSession = useCallback((server: SessionView) => {
    const current = serverProgress.current;
    const serverUpdatedAt = Date.parse(server.updated_at || "");
    const currentUpdatedAt = Date.parse(current.updatedAt || "");
    const staleProgress =
      server.status !== "completed" &&
      (server.swiped_count < current.swipedCount ||
        (server.swiped_count === current.swipedCount && server.likes < current.likes) ||
        (Number.isFinite(serverUpdatedAt) &&
          Number.isFinite(currentUpdatedAt) &&
          serverUpdatedAt < currentUpdatedAt &&
          server.swiped_count <= current.swipedCount));
    if (staleProgress) {
      // 后台生成和滑动提交可能交错返回：进度旧可以丢，但新卡不能丢。
      mergeServerCards(server.cards);
      return;
    }

    serverProgress.current = {
      likes: server.likes,
      swipedCount: server.swiped_count,
      updatedAt: server.updated_at,
    };
    setSession(server);
    setLikes(server.likes);
    setSwipedCount(server.swiped_count);
    const confirmedIds = new Set(server.swiped_card_ids ?? []);
    if (confirmedIds.size > 0) {
      setPendingSwipes((current) => {
        let changed = false;
        const next = { ...current };
        for (const id of confirmedIds) {
          if (id in next) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }
    if (server.status === "completed" || server.likes >= server.target_likes) {
      setCompleted(true);
      setQueue([]);
      setPendingSwipes({});
      return;
    }
    mergeServerCards(server.cards);
  }, [mergeServerCards]);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(
        `/api/reports/direction-sessions/${profileId}${accessQuery ?? ""}`,
        { cache: "no-store" },
        SESSION_FETCH_TIMEOUT_MS
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "加载失败，请稍后重试。");
      applyServerSession(data.session);
      setLoadError("");
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, [accessQuery, applyServerSession, profileId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("access_token") || params.get("token") || "";
    setAccessQuery(token ? `?access_token=${encodeURIComponent(token)}` : "");
  }, []);

  useEffect(() => {
    if (accessQuery === null) return;
    fetchSession();
  }, [accessQuery, fetchSession]);

  // 队列见底但会话未完成时轮询等新卡
  useEffect(() => {
    if (accessQuery === null || completed || queue.length > 0 || !session) return;
    pollTimer.current = setTimeout(fetchSession, 1500);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [accessQuery, completed, queue.length, session, fetchSession]);

  const swipe = useCallback(
    (card: DirectionCard, liked: boolean) => {
      if (pendingCardIds.current.has(card.id)) return;
      pendingCardIds.current.set(card.id, Date.now());
      setExitDirection(liked ? 1 : -1);
      setQueue((current) => current.filter((item) => item.id !== card.id));
      setPendingSwipes((current) => ({ ...current, [card.id]: liked }));

      if (accessQuery === null) {
        pendingCardIds.current.delete(card.id);
        setPendingSwipes((current) => {
          const next = { ...current };
          delete next[card.id];
          return next;
        });
        return;
      }

      swipePostQueue.current = swipePostQueue.current
        .catch(() => undefined)
        .then(async () => {
          const res = await fetchWithTimeout(
            `/api/reports/direction-sessions/${profileId}/swipes${accessQuery}`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ card_id: card.id, liked }),
            },
            SWIPE_POST_TIMEOUT_MS
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || "提交失败");
          if (data.session) applyServerSession(data.session);
        })
        .catch(async () => {
          // 网络失败时用服务器状态校正，避免本地显示假进度。
          pendingCardIds.current.delete(card.id);
          setPendingSwipes((current) => {
            const next = { ...current };
            delete next[card.id];
            return next;
          });
          await fetchSession();
        })
        .finally(() => {
          pendingCardIds.current.delete(card.id);
        });
    },
    [accessQuery, applyServerSession, fetchSession, profileId]
  );

  const targetLikes = session?.target_likes ?? 10;
  const pendingSwipeEntries = Object.entries(pendingSwipes);
  const pendingLikedCount = pendingSwipeEntries.filter(([, liked]) => liked).length;
  const pendingSwipeCount = pendingSwipeEntries.length;
  const visibleLikes = Math.min(targetLikes, likes + pendingLikedCount);
  const visibleSwipedCount = swipedCount + pendingSwipeCount;
  const topCard = queue[0];

  return (
    <main className="min-h-dvh bg-[#09090b] text-[#f4efe6]">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-28 pt-5 sm:py-6 [@media(max-height:680px)]:pb-32 [@media(max-height:680px)]:pt-3">
        {/* 头部与进度 */}
        <header className="mb-4 [@media(max-height:680px)]:mb-2">
          <div className="text-xs tracking-[0.32em] text-[#f4efe6]/45">方向感性验证</div>
          <h1 className="serif mt-1.5 text-xl text-[#b9a36b] [@media(max-height:680px)]:mt-1 [@media(max-height:680px)]:text-lg">哪种日子是你想过的？</h1>
          <p className="mt-1.5 text-[13px] leading-5 text-[#f4efe6]/55 [@media(max-height:680px)]:hidden">
            凭直觉滑：心动右滑点亮，无感左滑划走。点亮 {targetLikes} 个即完成。
          </p>
          <div className="mt-3 [@media(max-height:680px)]:mt-2">
            <div className="flex items-baseline justify-between text-xs text-[#f4efe6]/55">
              <span>已点亮 {visibleLikes} / {targetLikes}</span>
              <span>已看 {visibleSwipedCount} 个方向</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#22201c]">
              <div
                className="h-full rounded-full bg-[#b9a36b] transition-all duration-500"
                style={{ width: `${Math.min(100, (visibleLikes / targetLikes) * 100)}%` }}
              />
            </div>
          </div>
        </header>

        {/* 卡片区：高度由内容决定，文字完整展示，无内部滚动 */}
        <div className="relative">
          {loadError && !session ? (
            <CenterNote title="暂时打不开" body={loadError} />
          ) : completed ? (
            <CenterNote
              title="已收集完成，谢谢你！"
              body={`你一共点亮了 ${likes} 个方向。你的参谋顾问会基于这些直觉信号，为你完成后续的市场验证、胜算分析和深度诊断报告。`}
            />
          ) : !session ? (
            <CenterNote title="正在加载..." body="第一批方向正在准备中。" pulsing />
          ) : visibleLikes >= targetLikes ? (
            <CenterNote title="正在确认完成..." body="正在保存最后一次点亮，保存成功后会自动结束。" pulsing />
          ) : !topCard ? (
            <CenterNote
              title="正在为你准备新的方向..."
              body="系统会自动拉取下一批方向；如果网络慢，可以点下面按钮立即重试。"
              pulsing
              actionLabel="立即重试"
              onAction={fetchSession}
            />
          ) : (
            <>
              {/* 下一张卡的装饰性预览（跟随顶卡高度，不参与交互） */}
              {queue[1] && (
                <div className="pointer-events-none absolute inset-0 translate-y-3 scale-[0.96] overflow-hidden rounded-2xl border border-[#2c2820] bg-[#141311] opacity-50" />
              )}
              <AnimatePresence mode="popLayout" initial={false}>
                <SwipeCard
                  key={topCard.id}
                  card={topCard}
                  exitDirection={exitDirection}
                  onSwipe={(liked) => swipe(topCard, liked)}
                />
              </AnimatePresence>
            </>
          )}
        </div>

        {/* 操作按钮：固定底部，长卡片时仍可点 */}
        {!completed && visibleLikes < targetLikes && topCard && (
          <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#09090b] via-[#09090b]/95 to-transparent" />
            <div className="relative flex items-center justify-center gap-6">
              <button
                onClick={() => swipe(topCard, false)}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-[#3a352c] bg-[#111111] text-xl transition active:scale-90"
                aria-label="不感兴趣"
              >
                ✕
              </button>
              <button
                onClick={() => swipe(topCard, true)}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[#b9a36b] text-2xl text-[#09090b] shadow-[0_0_40px_rgba(185,163,107,0.35)] transition active:scale-90"
                aria-label="想试试"
              >
                ♥
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function SwipeCard({
  card,
  exitDirection,
  onSwipe,
}: {
  card: DirectionCard;
  exitDirection: 1 | -1;
  onSwipe: (liked: boolean) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-13, 13]);
  const likeOpacity = useTransform(x, [30, 130], [0, 1]);
  const nopeOpacity = useTransform(x, [-130, -30], [1, 0]);

  return (
    <motion.div
      className="relative"
      style={{ x, rotate, zIndex: 10 }}
      initial={{ scale: 0.96, y: 12, opacity: 0.7 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{
        x: exitDirection * 480,
        rotate: exitDirection * 18,
        opacity: 0,
        transition: { duration: 0.32 },
      }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE_THRESHOLD) onSwipe(true);
        else if (info.offset.x < -SWIPE_THRESHOLD) onSwipe(false);
      }}
    >
      <div className="overflow-hidden rounded-2xl border border-[#2c2820] bg-[#141311] shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
        {/* 滑动方向提示章 */}
        <motion.div
          className="absolute left-4 top-4 z-10 rotate-[-12deg] rounded border-2 border-[#b9a36b] px-3 py-1 text-lg font-bold text-[#b9a36b]"
          style={{ opacity: likeOpacity }}
        >
          想试试
        </motion.div>
        <motion.div
          className="absolute right-4 top-4 z-10 rotate-[12deg] rounded border-2 border-[#8a8378] px-3 py-1 text-lg font-bold text-[#8a8378]"
          style={{ opacity: nopeOpacity }}
        >
          无感
        </motion.div>

        <div className="border-b border-[#2c2820] bg-[#191713] px-5 pb-4 pt-5 [@media(max-height:680px)]:px-4 [@media(max-height:680px)]:pb-3 [@media(max-height:680px)]:pt-4">
          <h2 className="serif text-xl leading-snug text-[#f4efe6] [@media(max-height:680px)]:text-lg">{card.title}</h2>
          <p className="mt-1.5 text-[13px] leading-5 text-[#b9a36b] [@media(max-height:680px)]:mt-1 [@media(max-height:680px)]:text-[12px] [@media(max-height:680px)]:leading-[1.45]">{card.one_liner}</p>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 [@media(max-height:680px)]:gap-2 [@media(max-height:680px)]:px-4 [@media(max-height:680px)]:py-3">
          <CardSection label="典型一天" body={card.typical_day} />
          <CardSection label="做什么" body={card.work_content} />
          <CardSection label="在哪做" body={card.scene} />
          <CardSection label="角色" body={card.role} />
        </div>
      </div>
    </motion.div>
  );
}

function CardSection({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] font-semibold tracking-[0.18em] text-[#f4efe6]/40">{label}</div>
      <p className="text-[13px] leading-[1.6] text-[#f4efe6]/80 [@media(max-height:680px)]:text-[12px] [@media(max-height:680px)]:leading-[1.5]">{body}</p>
    </div>
  );
}

function CenterNote({
  title,
  body,
  pulsing,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  pulsing?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-[#2c2820] bg-[#141311] px-8 py-10 text-center">
      <div className={`serif text-xl text-[#b9a36b] ${pulsing ? "animate-pulse" : ""}`}>{title}</div>
      <p className="mt-3 text-sm leading-6 text-[#f4efe6]/55">{body}</p>
      {actionLabel && onAction && (
        <button
          className="mt-5 rounded-full border border-[#b9a36b]/45 px-5 py-2 text-sm font-semibold text-[#d9c27d] transition active:scale-95"
          type="button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

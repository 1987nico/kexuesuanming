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
  cards: DirectionCard[];
  generating: boolean;
}

const SWIPE_THRESHOLD = 90;

export default function DirectionSwipePage({ params }: { params: { profileId: string } }) {
  const { profileId } = params;
  const [accessQuery, setAccessQuery] = useState<string | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [loadError, setLoadError] = useState("");
  // 本地卡片队列：滑掉的立刻出队（乐观更新），服务器状态到达后合并新卡
  const [queue, setQueue] = useState<DirectionCard[]>([]);
  const [likes, setLikes] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [exitDirection, setExitDirection] = useState<1 | -1>(1);
  const seenIds = useRef(new Set<string>());
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyServerSession = useCallback((server: SessionView) => {
    setSession(server);
    setLikes(server.likes);
    if (server.status === "completed") setCompleted(true);
    // 注意：去重标记必须放在 setState 更新函数外面（更新函数会被 React 严格模式双调用）
    const fresh = server.cards.filter((card) => !seenIds.current.has(card.id));
    for (const card of fresh) seenIds.current.add(card.id);
    if (fresh.length) {
      setQueue((current) => [...current, ...fresh]);
    }
  }, []);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/direction-sessions/${profileId}${accessQuery ?? ""}`, { cache: "no-store" });
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
    pollTimer.current = setTimeout(fetchSession, 3000);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [accessQuery, completed, queue.length, session, fetchSession]);

  const swipe = useCallback(
    (card: DirectionCard, liked: boolean) => {
      setExitDirection(liked ? 1 : -1);
      setQueue((current) => current.filter((item) => item.id !== card.id));
      if (liked) setLikes((current) => Math.min(current + 1, session?.target_likes ?? 10));

      if (accessQuery === null) return;

      fetch(`/api/reports/direction-sessions/${profileId}/swipes${accessQuery}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ card_id: card.id, liked }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.session) applyServerSession(data.session);
        })
        .catch(() => {
          // 网络失败不阻断滑卡体验；下一次轮询会校正状态
        });
    },
    [accessQuery, applyServerSession, profileId, session?.target_likes]
  );

  const targetLikes = session?.target_likes ?? 10;
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
              <span>已点亮 {likes} / {targetLikes}</span>
              <span>已看 {session?.swiped_count ?? 0} 个方向</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#22201c]">
              <div
                className="h-full rounded-full bg-[#b9a36b] transition-all duration-500"
                style={{ width: `${Math.min(100, (likes / targetLikes) * 100)}%` }}
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
          ) : !topCard ? (
            <CenterNote title="正在为你准备新的方向..." body="系统正根据你刚才的选择生成更贴合你的方向，几秒钟后自动出现。" pulsing />
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
        {!completed && topCard && (
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

function CenterNote({ title, body, pulsing }: { title: string; body: string; pulsing?: boolean }) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-[#2c2820] bg-[#141311] px-8 py-10 text-center">
      <div className={`serif text-xl text-[#b9a36b] ${pulsing ? "animate-pulse" : ""}`}>{title}</div>
      <p className="mt-3 text-sm leading-6 text-[#f4efe6]/55">{body}</p>
    </div>
  );
}

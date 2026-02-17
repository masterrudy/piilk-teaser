// lib/ga4.ts
// ═══════════════════════════════════════════
// GA4 + Supabase 이벤트 트래킹
// variant: "type" (모든 이벤트에 자동 포함)
// DebugView 안정화: debug_mode 지원 + gtag 준비 전 큐잉
// ═══════════════════════════════════════════

const VARIANT = "type";

// 이벤트 파라미터 타입(확장 가능)
type Params = Record<string, string | number | boolean | null | undefined>;

// DebugView 강제 플래그: URL에 ?debug_ga=1 붙이면 활성화
function isDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("debug_ga") === "1";
  } catch {
    return false;
  }
}

// ─── Visitor ID (localStorage — 브라우저 영구) ───
function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("piilk_vid");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("piilk_vid", id);
  }
  return id;
}

// ─── Session ID (sessionStorage — 탭 닫으면 초기화) ───
function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem("piilk_sid");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("piilk_sid", id);
  }
  return id;
}

// ─── GA4 gtag 준비 전 이벤트 큐 ───
type QueuedEvent = { event: string; params: Params };
const gaQueue: QueuedEvent[] = [];
let flushTimer: number | null = null;

function tryFlushGAQueue() {
  if (typeof window === "undefined") return;
  const gtag = (window as any).gtag as undefined | ((...args: any[]) => void);
  if (!gtag) return;

  // 큐에 쌓인 이벤트 모두 전송
  while (gaQueue.length) {
    const item = gaQueue.shift()!;
    gtag("event", item.event, item.params);
  }

  if (flushTimer) {
    window.clearInterval(flushTimer);
    flushTimer = null;
  }
}

function ensureFlushLoop() {
  if (typeof window === "undefined") return;
  if (flushTimer) return;

  // gtag가 뒤늦게 로드되는 케이스 대비: 200ms 간격으로 최대 10초 체크
  const startedAt = Date.now();
  flushTimer = window.setInterval(() => {
    tryFlushGAQueue();
    if (Date.now() - startedAt > 10_000) {
      // 10초 지나면 포기(무한 루프 방지)
      if (flushTimer) window.clearInterval(flushTimer);
      flushTimer = null;
      gaQueue.length = 0;
    }
  }, 200);
}

// GA4 전송
function sendGA4(event: string, params: Params = {}) {
  if (typeof window === "undefined") return;

  const payload: Params = {
    ...params,
    variant: VARIANT,
    // ✅ DebugView 안정화
    debug_mode: isDebugMode(),
  };

  const gtag = (window as any).gtag as undefined | ((...args: any[]) => void);

  // gtag가 없으면 큐잉 후 나중에 flush
  if (!gtag) {
    gaQueue.push({ event, params: payload });
    ensureFlushLoop();
    return;
  }

  gtag("event", event, payload);
}

// Supabase 전송 (fire-and-forget)
function sendSupabase(event_type: string, metadata: Params = {}) {
  fetch("/api/type-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_type,
      variant: VARIANT,
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
      metadata,
    }),
  }).catch(() => {});
}

// 듀얼 전송 (GA4 + Supabase 동시)
function send(event: string, params: Params = {}) {
  sendGA4(event, params);
  sendSupabase(event, params);
}

export const track = {
  quizStart: () => send("quiz_start"),

  quizComplete: (type: string) => send("quiz_complete", { afterfeel_type: type }),

  typeResult: (type: string) => send("type_result", { afterfeel_type: type }),

  shareClick: (channel: string, type: string) =>
    send("share_click", { share_channel: channel, afterfeel_type: type }),

  emailSubmit: (type: string) => {
    send("email_submit", { afterfeel_type: type });

    // Meta Pixel
    if (typeof window !== "undefined" && (window as any).fbq) {
      (window as any).fbq("track", "Lead", {
        content_name: "piilk_quiz_type",
        content_category: "quiz_signup",
      });
      (window as any).fbq("track", "CompleteRegistration", {
        content_name: "piilk_quiz_type",
        value: 1,
        currency: "USD",
      });
    }

    // TikTok Pixel
    if (typeof window !== "undefined" && (window as any).ttq) {
      (window as any).ttq.track("SubmitForm", {
        content_name: "piilk_quiz_type",
      });
      (window as any).ttq.track("CompleteRegistration", {
        content_name: "piilk_quiz_type",
        value: 1,
        currency: "USD",
      });
    }
  },

  declarationTap: (statementKey: string) =>
    send("declaration_tap", { statement_key: statementKey }),

  referralShare: (channel: string) => send("referral_share", { share_channel: channel }),
};

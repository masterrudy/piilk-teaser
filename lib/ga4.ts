// lib/ga4.ts
// ═══════════════════════════════════════════
// GA4 + Supabase 이벤트 트래킹
// variant: "type" (모든 이벤트에 자동 포함)
// DebugView 안정화: debug_mode 지원 + gtag 준비 전 큐잉
// ═══════════════════════════════════════════

const VARIANT = "type";

type Params = Record<string, string | number | boolean | null | undefined>;

function isDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("debug_ga") === "1";
  } catch {
    return false;
  }
}

function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("piilk_vid");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("piilk_vid", id);
  }
  return id;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem("piilk_sid");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("piilk_sid", id);
  }
  return id;
}

function getTrackingData() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") || null,
    utm_medium: params.get("utm_medium") || null,
    utm_campaign: params.get("utm_campaign") || null,
  };
}

type QueuedEvent = { event: string; params: Params };
const gaQueue: QueuedEvent[] = [];
let flushTimer: number | null = null;

function tryFlushGAQueue() {
  if (typeof window === "undefined") return;
  const gtag = (window as any).gtag as undefined | ((...args: any[]) => void);
  if (!gtag) return;

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

  const startedAt = Date.now();
  flushTimer = window.setInterval(() => {
    tryFlushGAQueue();
    if (Date.now() - startedAt > 10_000) {
      if (flushTimer) window.clearInterval(flushTimer);
      flushTimer = null;
      gaQueue.length = 0;
    }
  }, 200);
}

function sendGA4(event: string, params: Params = {}) {
  if (typeof window === "undefined") return;

  const payload: Params = {
    ...params,
    variant: VARIANT,
    debug_mode: isDebugMode(),
  };

  const gtag = (window as any).gtag as undefined | ((...args: any[]) => void);

  if (!gtag) {
    gaQueue.push({ event, params: payload });
    ensureFlushLoop();
    return;
  }

  gtag("event", event, payload);
}

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
      tracking: getTrackingData(),
    }),
  }).catch(() => {});
}

function send(event: string, params: Params = {}) {
  sendGA4(event, params);
  sendSupabase(event, params);
}

export const track = {
  quizStart: () => send("quiz_start"),

  // ✅ NEW: 퀴즈 단계별 추적 — 어느 문항에서 어떤 답을 골랐는지
  // GA4에서 quiz_step_1, quiz_step_2, quiz_step_3 으로 확인 가능
  quizStep: (step: number, answer: string) =>
    send(`quiz_step_${step}`, { step, answer }),

  quizComplete: (type: string) => send("quiz_complete", { afterfeel_type: type }),
  typeResult: (type: string) => send("type_result", { afterfeel_type: type }),
  shareClick: (channel: string, type: string) =>
    send("share_click", { share_channel: channel, afterfeel_type: type }),

  // ✅ NEW: 이메일 입력창 최초 클릭 추적 — emailFocus → emailSubmit 이탈 포착
  emailFocus: (type: string) =>
    send("email_focus", { afterfeel_type: type }),

  emailSubmit: (type: string) => {
    send("email_submit", { afterfeel_type: type });

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

    if (typeof window !== "undefined" && (window as any).ttq) {
      (window as any).ttq.track("SubmitForm", { content_name: "piilk_quiz_type" });
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

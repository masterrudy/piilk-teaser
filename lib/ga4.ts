// ═══════════════════════════════════════════
// 📁 lib/ga4.ts
// GA4 + Supabase + Meta Pixel + TikTok Pixel 이벤트 트래킹
// variant: "type" (모든 이벤트에 자동 포함)
// ✅ v3: quizStep에 fbq 추가 — 모든 pixel 호출을 ga4.ts에서 일괄 관리
//        page.tsx에서 fbq 직접 호출 완전 제거됨
// ═══════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */

const VARIANT = "type";

type Params = Record<string, string | number | boolean | null | undefined>;

// ─── window를 any로 안전하게 접근 (TypeScript strict 우회) ───
function w(): any {
  if (typeof window === "undefined") return undefined;
  return window;
}

// ─── Safe UUID (crypto.randomUUID 미지원 브라우저 fallback) ───
function safeUUID(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isDebugMode(): boolean {
  if (!w()) return false;
  try {
    return new URLSearchParams(window.location.search).get("debug_ga") === "1";
  } catch {
    return false;
  }
}

function getVisitorId(): string {
  if (!w()) return "";
  let id = localStorage.getItem("piilk_vid");
  if (!id) {
    id = safeUUID();
    localStorage.setItem("piilk_vid", id);
  }
  return id;
}

function getSessionId(): string {
  if (!w()) return "";
  let id = sessionStorage.getItem("piilk_sid");
  if (!id) {
    id = safeUUID();
    sessionStorage.setItem("piilk_sid", id);
  }
  return id;
}

function getTrackingData() {
  if (!w()) return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") || null,
    utm_medium: params.get("utm_medium") || null,
    utm_campaign: params.get("utm_campaign") || null,
  };
}

// ─── GA4 큐잉 시스템 (gtag 로드 전 이벤트 손실 방지) ───
type QueuedEvent = { event: string; params: Params };
const gaQueue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function tryFlushGAQueue() {
  if (!w()) return;
  const gtag = w()?.gtag;
  if (typeof gtag !== "function") return;

  while (gaQueue.length) {
    const item = gaQueue.shift()!;
    gtag("event", item.event, item.params);
  }

  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

function ensureFlushLoop() {
  if (!w()) return;
  if (flushTimer) return;

  const startedAt = Date.now();
  flushTimer = setInterval(() => {
    tryFlushGAQueue();
    if (Date.now() - startedAt > 10_000) {
      if (flushTimer) clearInterval(flushTimer);
      flushTimer = null;
      gaQueue.length = 0;
    }
  }, 200);
}

// ─── GA4 이벤트 전송 ───
function sendGA4(event: string, params: Params = {}) {
  if (!w()) return;

  const payload: Params = {
    ...params,
    variant: VARIANT,
    debug_mode: isDebugMode(),
  };

  const gtag = w()?.gtag;

  if (typeof gtag !== "function") {
    gaQueue.push({ event, params: payload });
    ensureFlushLoop();
    return;
  }

  gtag("event", event, payload);
}

// ─── Supabase 이벤트 전송 ───
function sendSupabase(event_name: string, metadata: Params = {}) {
  const utm = getTrackingData();
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_name,
      event_data: metadata,
      variant: VARIANT,
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
      device_type: /Mobile|Android|iPhone/i.test(navigator?.userAgent || '') ? 'mobile' : 'desktop',
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
    }),
  }).catch(() => {});
}

// ─── Meta Pixel ───
function fbq(event: string, name: string, params?: Record<string, unknown>) {
  const fn = w()?.fbq;
  if (typeof fn === "function") {
    fn(event, name, params);
  }
}

// ─── TikTok Pixel ───
function ttqTrack(event: string, params?: Record<string, unknown>) {
  const ttq = w()?.ttq;
  if (ttq && typeof ttq.track === "function") {
    ttq.track(event, params);
  }
}

// ─── 통합 전송 ───
function send(event: string, params: Params = {}) {
  sendGA4(event, params);
  sendSupabase(event, params);
}

// ═══════════════════════════════════════════
// Public track API
// ═══════════════════════════════════════════
export const track = {
  // 페이지 로드 시 자동 호출 — 모든 방문자 카운트
  pageView: () => {
    send("page_view");
  },

  // 퀴즈 시작
  quizStart: () => {
    send("quiz_start");
    fbq("trackCustom", "QuizStart");
  },

  // 퀴즈 단계별 답변 추적
  // GA4 DebugView: quiz_step_1, quiz_step_2, quiz_step_3
  // ✅ v3: fbq 추가 — page.tsx에서 직접 호출하던 것을 여기로 통합
  quizStep: (step: number, answer: string) => {
    send(`quiz_step_${step}`, { step, answer });
    fbq("trackCustom", "QuizStep", { step, answer });
  },

  // 퀴즈 완료 (타입 결정)
  quizComplete: (type: string) => {
    send("quiz_complete", { afterfeel_type: type });
    fbq("trackCustom", "QuizComplete", { afterfeel_type: type });
    ttqTrack("ViewContent", { content_name: `quiz_complete_${type}` });
  },

  // 결과 페이지 진입
  typeResult: (type: string) => {
    send("type_result", { afterfeel_type: type });
    fbq("trackCustom", "TypeResult", { afterfeel_type: type });
  },

  // 공유 버튼 클릭
  shareClick: (channel: string, type: string) =>
    send("share_click", { share_channel: channel, afterfeel_type: type }),

  // 이메일 입력창 최초 포커스 — emailFocus → emailSubmit 이탈률 포착
  emailFocus: (type: string) => {
    send("email_focus", { afterfeel_type: type });
    fbq("trackCustom", "EmailFocus", { afterfeel_type: type });
  },

  // 이메일 제출 완료 — 가장 중요한 전환 이벤트
  emailSubmit: (type: string) => {
    send("email_submit", { afterfeel_type: type });

    // Meta Pixel — Lead (이메일 수집) + CompleteRegistration (가입 완료)
    fbq("track", "Lead", {
      content_name: "piilk_quiz_type",
      content_category: "quiz_signup",
    });
    fbq("track", "CompleteRegistration", {
      content_name: "piilk_quiz_type",
      value: 1,
      currency: "USD",
    });

    // TikTok Pixel
    ttqTrack("SubmitForm", { content_name: "piilk_quiz_type" });
    ttqTrack("CompleteRegistration", {
      content_name: "piilk_quiz_type",
      value: 1,
      currency: "USD",
    });
  },

  // Declaration 탭 클릭
  declarationTap: (statementKey: string) =>
    send("declaration_tap", { statement_key: statementKey }),

  // 리퍼럴 공유 클릭
  referralShare: (channel: string) => {
    send("referral_share", { share_channel: channel });
    fbq("trackCustom", "ReferralShare", { share_channel: channel });
  },
};

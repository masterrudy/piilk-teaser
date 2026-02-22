// ═══════════════════════════════════════════
// 📁 lib/ga4-main.ts
// GA4 + Supabase + Meta Pixel + TikTok Pixel 이벤트 트래킹
// variant: "main" (메인 티저 페이지 전용)
//
// ✅ ga4.ts (type 페이지)와 동일한 아키텍처
//   - GA4 큐잉 시스템 (gtag 로드 전 이벤트 손실 방지)
//   - Supabase /api/track 내부 대시보드 이벤트
//   - Meta Pixel (Lead, CompleteRegistration)
//   - TikTok Pixel (SubmitForm, CompleteRegistration)
//   - visitor_id + session_id 세션 관리
// ═══════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */

const VARIANT = "main";

type Params = Record<string, string | number | boolean | null | undefined>;

// ─── window를 any로 안전하게 접근 (TypeScript strict 우회) ───
function w(): any {
  if (typeof window === "undefined") return undefined;
  return window;
}

// ─── Safe UUID ───
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

// ─── GA4 큐잉 시스템 ───
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
function sendSupabase(event_type: string, metadata: Params = {}) {
  fetch("/api/track", {
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
  // 페이지 로드
  pageView: () => {
    send("page_view");
  },

  // 스크롤 깊이 (50vh 등)
  scrollDepth: (depth: string) => {
    send("scroll_depth", { depth });
  },

  // Screen 전환 (Screen 2, Screen 3 진입)
  screenView: (screen: string) => {
    send("screen_view", { screen });
  },

  // 이메일 입력창 최초 포커스
  emailFocus: () => {
    send("email_focus");
    fbq("trackCustom", "EmailFocus", { source: "main_teaser" });
  },

  // 이메일 제출 완료 — 가장 중요한 전환 이벤트
  emailSubmit: () => {
    send("email_submit");

    // Meta Pixel — Lead + CompleteRegistration
    fbq("track", "Lead", {
      content_name: "piilk_main_teaser",
      content_category: "main_signup",
      value: 2.99,
      currency: "USD",
    });
    fbq("track", "CompleteRegistration", {
      content_name: "piilk_main_teaser",
      value: 1,
      currency: "USD",
    });

    // TikTok Pixel
    ttqTrack("SubmitForm", { content_name: "piilk_main_teaser" });
    ttqTrack("CompleteRegistration", {
      content_name: "piilk_main_teaser",
      value: 1,
      currency: "USD",
    });
  },

  // Sticky bar 클릭
  stickyClick: () => {
    send("sticky_cta_click");
  },
};

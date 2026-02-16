// ═══════════════════════════════════════════
// GA4 + Supabase 이벤트 트래킹
// variant: "type" (모든 이벤트에 자동 포함)
// ═══════════════════════════════════════════
const VARIANT = "type";

// GA4 전송
function sendGA4(event: string, params: Record<string, string> = {}) {
  if (typeof window !== "undefined" && (window as any).gtag) {
    (window as any).gtag("event", event, { ...params, variant: VARIANT });
  }
}

// Supabase 전송 (fire-and-forget)
function sendSupabase(event_type: string, metadata: Record<string, string> = {}) {
  fetch("/api/type-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type, variant: VARIANT, metadata }),
  }).catch(() => {});
}

// 듀얼 전송 (GA4 + Supabase 동시)
function send(event: string, params: Record<string, string> = {}) {
  sendGA4(event, params);
  sendSupabase(event, params);
}

export const track = {
  quizStart: () => send("quiz_start"),
  quizComplete: (type: string) =>
    send("quiz_complete", { afterfeel_type: type }),
  typeResult: (type: string) =>
    send("type_result", { afterfeel_type: type }),
  shareClick: (channel: string, type: string) =>
    send("share_click", { share_channel: channel, afterfeel_type: type }),
  emailSubmit: (type: string) =>
    send("email_submit", { afterfeel_type: type }),
  declarationTap: (statementKey: string) =>
    send("declaration_tap", { statement_key: statementKey }),
  referralShare: (channel: string) =>
    send("referral_share", { share_channel: channel }),
};

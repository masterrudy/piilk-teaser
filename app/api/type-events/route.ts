// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/type-events/route.ts
// 📌 역할: /type 전용 이벤트 로깅 API
// 📌 기존 events API와 완전 분리 (A안 영향 없음)
// ═══════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
  const { event_type, variant, visitor_id, session_id, metadata, tracking } = await req.json();
    
    if (!event_type) {
      return NextResponse.json({ error: "missing_event_type" }, { status: 400 });
    }

    // ─── IP & Device 추출 (헤더 기반) ───
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    const ua = req.headers.get("user-agent") || "";
    const device_type = /Mobile|Android|iPhone/i.test(ua) ? "mobile" : "desktop";

    await supabase.from("piilk_events").insert({
      event_name: event_type,
      event_data: metadata || {},
      variant: variant || "type",
      visitor_id: visitor_id || null,
      session_id: session_id || null,
      device_type,
      ip_address: ip,
utm_source: tracking?.utm_source || null,
utm_medium: tracking?.utm_medium || null,
utm_campaign: tracking?.utm_campaign || null,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Type-events error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

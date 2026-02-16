// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/type-subscribe/route.ts
// 📌 역할: /type 전용 이메일 수집 API
// 📌 기존 subscribe/route.ts와 완전 분리 (A안 영향 없음)
// 📌 기능: Supabase 저장 + Klaviyo 연동 + IP Geo + Referral
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KLAVIYO_API_KEY = process.env.KLAVIYO_PRIVATE_KEY || process.env.KLAVIYO_API_KEY;
const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID_TYPE || process.env.KLAVIYO_LIST_ID;

// ─── IP → 위치 변환 ───
async function getGeoFromIP(ip: string) {
  const defaultGeo = { country: null, region: null, city: null };
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return defaultGeo;
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    if (data.status === "success") {
      return { country: data.country || null, region: data.regionName || null, city: data.city || null };
    }
  } catch (err) {
    console.error("Geo lookup failed:", err);
  }
  return defaultGeo;
}

// ─── IP 추출 ───
function getClientIP(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const cfIP = request.headers.get("cf-connecting-ip");
  if (cfIP) return cfIP;
  const xReal = request.headers.get("x-real-ip");
  if (xReal) return xReal;
  return "0.0.0.0";
}

export async function POST(request: NextRequest) {
  try {
    const { email, afterfeel_type, referred_by, tracking } = await request.json();

    if (!email || !email.includes("@") || !email.includes(".")) {
      return NextResponse.json({ success: false, error: "invalid_email" }, { status: 400 });
    }

    const emailClean = email.toLowerCase().trim();

    // ── 중복 체크 ──
    const { data: existing } = await supabase
      .from("piilk_subscribers")
      .select("id, referral_code, queue_position")
      .eq("email", emailClean)
      .single();

    if (existing) {
      return NextResponse.json({
        success: true,
        already_exists: true,
        referral_code: existing.referral_code,
        queue_position: existing.queue_position,
      });
    }

    // ── IP + Geo ──
    const ip = getClientIP(request);
    const geo = await getGeoFromIP(ip);

    // ── 트래킹 데이터 ──
    const deviceType = tracking?.device_type || null;
    const language = tracking?.language || null;
    const timezone = tracking?.timezone || null;
    const referrer = tracking?.referrer || null;
    const utmSource = tracking?.utm_source || null;
    const utmMedium = tracking?.utm_medium || null;
    const utmCampaign = tracking?.utm_campaign || null;

    // ── 대기열 번호 ──
    const { data: posData } = await supabase.rpc("get_next_queue_position");
    const queue_position = posData || 1;

    // ── 레퍼럴 코드 생성 ──
    const referral_code = crypto.randomUUID().slice(0, 8);

    // ── Supabase 저장 ──
    const { data, error: dbError } = await supabase
      .from("piilk_subscribers")
      .insert({
        email: emailClean,
        variant: "type",
        segment: "afterfeel_quiz",
        afterfeel_type: afterfeel_type || null,
        referral_code,
        referred_by: referred_by || null,
        referral_count: 0,
        queue_position,
        source: "teaser",
        ip_address: ip,
        device_type: deviceType,
        language,
        timezone,
        referrer,
        country: geo.country,
        region: geo.region,
        city: geo.city,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id, referral_code, queue_position")
      .single();

    if (dbError) {
      console.error("Supabase error:", dbError);
      return NextResponse.json({ success: false, error: "subscribe_failed" }, { status: 500 });
    }

    // ── 레퍼럴 처리 ──
    if (referred_by) {
      await supabase.rpc("process_referral", { p_referral_code: referred_by });
    }

    // ── 이벤트 기록 ──
    await supabase.from("piilk_events").insert({
      event_type: "email_submit",
      variant: "type",
      metadata: { afterfeel_type, has_referral: !!referred_by },
      created_at: new Date().toISOString(),
    });

    // ── Klaviyo 연동 ──
    if (KLAVIYO_API_KEY && KLAVIYO_LIST_ID) {
      try {
        // Step 1: 프로필 생성/업데이트
        const profileRes = await fetch("https://a.klaviyo.com/api/profiles/", {
          method: "POST",
          headers: {
            Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
            "Content-Type": "application/json",
            revision: "2023-12-15",
          },
          body: JSON.stringify({
            data: {
              type: "profile",
              attributes: {
                email: emailClean,
                properties: {
                  segment: "afterfeel_quiz",
                  afterfeel_type: afterfeel_type || null,
                  source: "piilk_teaser_type",
                  variant: "type",
                  device_type: deviceType,
                  language,
                  timezone,
                  country: geo.country,
                  region: geo.region,
                  city: geo.city,
                  utm_source: utmSource,
                  utm_medium: utmMedium,
                  utm_campaign: utmCampaign,
                  referral_code,
                  referred_by: referred_by || null,
                },
              },
            },
          }),
        });

        let profileId: string | null = null;
        const profileResult = await profileRes.text();

        if (profileRes.status === 201) {
          profileId = JSON.parse(profileResult).data?.id;
        } else if (profileRes.status === 409) {
          profileId = JSON.parse(profileResult).errors?.[0]?.meta?.duplicate_profile_id;
        }

        // Step 2: 리스트 구독
        if (profileId) {
          await fetch(
            `https://a.klaviyo.com/api/lists/${KLAVIYO_LIST_ID}/relationships/profiles/`,
            {
              method: "POST",
              headers: {
                Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
                "Content-Type": "application/json",
                revision: "2023-12-15",
              },
              body: JSON.stringify({
                data: [{ type: "profile", id: profileId }],
              }),
            }
          );
        }
      } catch (klaviyoError) {
        console.error("Klaviyo error:", klaviyoError);
        // Klaviyo 실패해도 가입은 성공
      }
    }

    return NextResponse.json({
      success: true,
      referral_code: data.referral_code,
      queue_position: data.queue_position,
    });
  } catch (error) {
    console.error("Type-subscribe error:", error);
    return NextResponse.json({ success: false, error: "server_error" }, { status: 500 });
  }
}

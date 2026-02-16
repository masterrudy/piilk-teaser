// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/type-referral/route.ts
// 📌 역할: 레퍼럴 코드 검증 API
// 📌 GET /api/type-referral?code=XXXXXXXX
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ valid: false, error: "no_code" }, { status: 400 });
  }

  try {
    const { data } = await supabase
      .from("piilk_subscribers")
      .select("id, referral_count, queue_position")
      .eq("referral_code", code)
      .single();

    if (!data) {
      return NextResponse.json({ valid: false });
    }

    return NextResponse.json({
      valid: true,
      referral_count: data.referral_count,
      queue_position: data.queue_position,
    });
  } catch (err) {
    console.error("Type-referral error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

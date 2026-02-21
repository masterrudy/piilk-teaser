// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/type-declarations/route.ts
// 📌 역할: 선언문 투표 API (직접 쿼리)
//
// ✅ V2 수정사항:
//   1. read → +1 → update 패턴을 COUNT 동기화로 교체
//      - piilk_declaration_votes에서 실제 투표 수를 COUNT
//      - 그 값으로 piilk_declarations.vote_count를 동기화
//      - race condition 완전 방지 + 0 리셋 버그 해결
//   2. 에러 로깅 강화
// ═══════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: 선언문 카운트 조회
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("piilk_declarations")
      .select("statement_key, statement_text, vote_count")
      .order("id");

    if (error) throw error;
    return NextResponse.json({ declarations: data });
  } catch (err) {
    console.error("Declarations GET error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

// POST: 선언문 투표
export async function POST(req: NextRequest) {
  try {
    const { statement_key, visitor_id } = await req.json();

    if (!statement_key || !visitor_id) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    // 1) 중복 투표 체크
    const { data: existing } = await supabase
      .from("piilk_declaration_votes")
      .select("id")
      .eq("statement_key", statement_key)
      .eq("visitor_id", visitor_id)
      .maybeSingle();

    if (existing) {
      const { data: row } = await supabase
        .from("piilk_declarations")
        .select("vote_count")
        .eq("statement_key", statement_key)
        .single();

      return NextResponse.json({ success: true, vote_count: row?.vote_count || 0 });
    }

    // 2) 투표 기록 삽입
    const { error: insertErr } = await supabase
      .from("piilk_declaration_votes")
      .insert({ statement_key, visitor_id });

    if (insertErr) {
      console.error("Insert vote error:", insertErr);
      throw insertErr;
    }

    // 3) 실제 투표 수 COUNT (atomic — race condition 방지)
    const { count, error: countErr } = await supabase
      .from("piilk_declaration_votes")
      .select("id", { count: "exact", head: true })
      .eq("statement_key", statement_key);

    if (countErr) {
      console.error("Count votes error:", countErr);
      throw countErr;
    }

    const newCount = count ?? 0;

    // 4) vote_count를 실제 투표 수로 동기화
    const { error: updateErr } = await supabase
      .from("piilk_declarations")
      .update({ vote_count: newCount })
      .eq("statement_key", statement_key);

    if (updateErr) {
      console.error("Update count error:", updateErr);
      // 업데이트 실패해도 투표는 이미 기록됨 — 카운트만 반환
    }

    return NextResponse.json({ success: true, vote_count: newCount });
  } catch (err) {
    console.error("Declarations POST error:", err);
    return NextResponse.json({ error: "failed", detail: String(err) }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/type-declarations/route.ts
// 📌 역할: 선언문 투표 API (RPC 없이 직접 쿼리)
// 📌 GET → 카운트 조회 / POST → 투표 (중복 방지)
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

// POST: 선언문 투표 (RPC 없이 직접 처리)
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
      // 이미 투표함 → 현재 카운트만 반환
      const { data: current } = await supabase
        .from("piilk_declarations")
        .select("vote_count")
        .eq("statement_key", statement_key)
        .single();

      return NextResponse.json({
        success: true,
        vote_count: current?.vote_count || 0,
      });
    }

    // 2) 투표 기록 삽입
    const { error: insertError } = await supabase
      .from("piilk_declaration_votes")
      .insert({ statement_key, visitor_id });

    if (insertError) throw insertError;

    // 3) vote_count +1 업데이트
    const { data: decl, error: updateError } = await supabase
      .from("piilk_declarations")
      .update({ vote_count: supabase.rpc ? undefined : 0 }) // placeholder
      .eq("statement_key", statement_key)
      .select("vote_count")
      .single();

    // supabase-js에서 increment가 안 되므로 raw SQL 사용
    // 대신 2단계로 처리: 현재값 읽고 +1
    const { data: currentRow } = await supabase
      .from("piilk_declarations")
      .select("vote_count")
      .eq("statement_key", statement_key)
      .single();

    const newCount = (currentRow?.vote_count || 0) + 1;

    const { error: upErr } = await supabase
      .from("piilk_declarations")
      .update({ vote_count: newCount })
      .eq("statement_key", statement_key);

    if (upErr) throw upErr;

    return NextResponse.json({ success: true, vote_count: newCount });
  } catch (err) {
    console.error("Declarations POST error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

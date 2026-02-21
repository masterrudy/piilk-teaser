// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/type-declarations/route.ts
// 📌 역할: 선언문 투표 API
//
// ✅ V3 수정사항:
//   piilk_declarations.vote_count 컬럼 UPDATE를 완전 제거.
//   GET/POST 모두 piilk_declaration_votes 테이블에서 직접 COUNT.
//   이유: UPDATE가 RLS/권한 문제로 실패하는 환경에서도 안정적으로 동작.
//   piilk_declarations 테이블은 statement_key + statement_text 마스터 목록으로만 사용.
// ═══════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── 헬퍼: statement_key별 실제 투표 수 조회 ───
async function getVoteCounts(): Promise<Record<string, number>> {
  // piilk_declarations에서 마스터 목록 가져오기
  const { data: declarations, error: declErr } = await supabase
    .from("piilk_declarations")
    .select("statement_key, statement_text")
    .order("id");

  if (declErr) throw declErr;
  if (!declarations) return {};

  // 각 key별 실제 투표 수 COUNT
  const counts: Record<string, number> = {};
  await Promise.all(
    declarations.map(async (d) => {
      const { count, error } = await supabase
        .from("piilk_declaration_votes")
        .select("id", { count: "exact", head: true })
        .eq("statement_key", d.statement_key);

      counts[d.statement_key] = error ? 0 : (count ?? 0);
    })
  );

  return counts;
}

// GET: 선언문 목록 + 투표 수 조회
export async function GET() {
  try {
    const { data: declarations, error } = await supabase
      .from("piilk_declarations")
      .select("statement_key, statement_text")
      .order("id");

    if (error) throw error;

    // 실제 투표 수를 votes 테이블에서 COUNT
    const counts = await getVoteCounts();

    const result = (declarations || []).map((d) => ({
      statement_key: d.statement_key,
      statement_text: d.statement_text,
      vote_count: counts[d.statement_key] || 0,
    }));

    return NextResponse.json({ declarations: result });
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
      // 이미 투표함 — 현재 실제 카운트 반환
      const { count } = await supabase
        .from("piilk_declaration_votes")
        .select("id", { count: "exact", head: true })
        .eq("statement_key", statement_key);

      return NextResponse.json({ success: true, vote_count: count ?? 0 });
    }

    // 2) 투표 기록 삽입
    const { error: insertErr } = await supabase
      .from("piilk_declaration_votes")
      .insert({ statement_key, visitor_id });

    if (insertErr) {
      console.error("Insert vote error:", insertErr);
      throw insertErr;
    }

    // 3) 삽입 후 실제 투표 수 COUNT
    const { count, error: countErr } = await supabase
      .from("piilk_declaration_votes")
      .select("id", { count: "exact", head: true })
      .eq("statement_key", statement_key);

    if (countErr) {
      console.error("Count votes error:", countErr);
      throw countErr;
    }

    return NextResponse.json({ success: true, vote_count: count ?? 0 });
  } catch (err) {
    console.error("Declarations POST error:", err);
    return NextResponse.json({ error: "failed", detail: String(err) }, { status: 500 });
  }
}

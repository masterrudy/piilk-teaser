// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/type-declarations/route.ts
// 📌 역할: 선언문 투표 API
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

// POST: 선언문 투표
export async function POST(req: NextRequest) {
  try {
    const { statement_key, visitor_id } = await req.json();

    if (!statement_key || !visitor_id) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const { data: newCount, error } = await supabase.rpc("vote_declaration", {
      p_statement_key: statement_key,
      p_visitor_id: visitor_id,
    });

    if (error) throw error;
    return NextResponse.json({ success: true, vote_count: newCount });
  } catch (err) {
    console.error("Declarations POST error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

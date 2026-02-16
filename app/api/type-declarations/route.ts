-- ═══════════════════════════════════════════════════════════
-- 📌 Supabase SQL Editor에서 실행
-- 📌 역할: vote_declaration RPC 함수 + 중복투표 방지
-- ═══════════════════════════════════════════════════════════

-- 1) 중복 투표 방지용 테이블 (없으면 생성)
CREATE TABLE IF NOT EXISTS piilk_declaration_votes (
  id BIGSERIAL PRIMARY KEY,
  statement_key TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(statement_key, visitor_id)
);

-- 2) vote_declaration RPC 함수
CREATE OR REPLACE FUNCTION vote_declaration(
  p_statement_key TEXT,
  p_visitor_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 중복 투표 체크: 이미 투표했으면 현재 카운트만 반환
  IF EXISTS (
    SELECT 1 FROM piilk_declaration_votes
    WHERE statement_key = p_statement_key
      AND visitor_id = p_visitor_id
  ) THEN
    SELECT vote_count INTO v_count
    FROM piilk_declarations
    WHERE statement_key = p_statement_key;
    RETURN COALESCE(v_count, 0);
  END IF;

  -- 투표 기록 삽입
  INSERT INTO piilk_declaration_votes (statement_key, visitor_id)
  VALUES (p_statement_key, p_visitor_id);

  -- vote_count +1 업데이트 후 반환
  UPDATE piilk_declarations
  SET vote_count = vote_count + 1
  WHERE statement_key = p_statement_key
  RETURNING vote_count INTO v_count;

  RETURN COALESCE(v_count, 0);
END;
$$;

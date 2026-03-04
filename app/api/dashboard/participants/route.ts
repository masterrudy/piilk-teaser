// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/dashboard/participants/route.ts
// 📌 역할: 대시보드 참여자 목록 API
// 📌 변경: Supabase only (Klaviyo 목록 제거 → 통계만 사용)
// 📌 사용법: /api/dashboard/participants?variant=main&page=1&limit=50
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ✅ 서버용 NYC 날짜 헬퍼 (YYYY-MM-DD)
function getNYCDateServer(offset = 0): string {
  const n = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  n.setDate(n.getDate() + offset);
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

export async function GET(request: NextRequest) {
  const variant  = request.nextUrl.searchParams.get('variant') || 'main';
  const page     = Math.max(1, parseInt(request.nextUrl.searchParams.get('page')  || '1'));
  const limit    = Math.min(200, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '50')));
  const search   = request.nextUrl.searchParams.get('search')   || '';
  const segment  = request.nextUrl.searchParams.get('segment')  || '';
  const dateFrom = request.nextUrl.searchParams.get('dateFrom') || '';
  const dateTo   = request.nextUrl.searchParams.get('dateTo')   || '';

  try {
    return await getSupabaseParticipants({ variant, page, limit, search, segment, dateFrom, dateTo });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Caught exception',
      message: error?.message || String(error),
      data: [],
      total: 0,
      totalAll: 0,
    }, { status: 500 });
  }
}

async function getSupabaseParticipants({
  variant, page, limit, search, segment, dateFrom, dateTo
}: {
  variant: string;
  page: number;
  limit: number;
  search: string;
  segment: string;
  dateFrom: string;
  dateTo: string;
}) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ success: false, error: 'Missing env vars', data: [], total: 0, totalAll: 0 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── 1. 전체 카운트 (필터 없이) ──────────────────────────────────
  let countQuery = supabase
    .from('piilk_subscribers')
    .select('id', { count: 'exact', head: true });

  if (variant === 'type') {
    countQuery = countQuery.eq('variant', 'type');
  } else if (variant === 'main') {
    countQuery = countQuery.neq('variant', 'type');
  }

  const { count: totalAll } = await countQuery;

  // ── 2. 필터 적용 카운트 ─────────────────────────────────────────
  let filteredCountQuery = supabase
    .from('piilk_subscribers')
    .select('id', { count: 'exact', head: true });

  if (variant === 'type') {
    filteredCountQuery = filteredCountQuery.eq('variant', 'type');
  } else if (variant === 'main') {
    filteredCountQuery = filteredCountQuery.neq('variant', 'type');
  }
  if (search) {
    filteredCountQuery = filteredCountQuery.ilike('email', `%${search}%`);
  }
  if (segment && segment !== 'all') {
    if (variant === 'type') {
      filteredCountQuery = filteredCountQuery.eq('afterfeel_type', segment);
    } else {
      filteredCountQuery = filteredCountQuery.eq('segment', segment);
    }
  }
  if (dateFrom) {
    // NYC 자정 → UTC 변환 (EST=UTC-5, EDT=UTC-4, 보수적으로 UTC-5 사용)
    filteredCountQuery = filteredCountQuery.gte('created_at', `${dateFrom}T05:00:00Z`);
  }
  if (dateTo) {
    filteredCountQuery = filteredCountQuery.lte('created_at', `${dateTo}T04:59:59Z`);
  }

  const { count: filteredTotal } = await filteredCountQuery;

  // ── 3. 실제 데이터 페이지 단위 조회 ────────────────────────────
  const offset = (page - 1) * limit;

  let query = supabase
    .from('piilk_subscribers')
    .select(
      'id, email, segment, sub_reason, source, variant, afterfeel_type, ' +
      'created_at, ip_address, device_type, language, timezone, referrer, ' +
      'country, region, city, utm_source, utm_medium, utm_campaign'
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (variant === 'type') {
    query = query.eq('variant', 'type');
  } else if (variant === 'main') {
    query = query.neq('variant', 'type');
  }
  if (search) {
    query = query.ilike('email', `%${search}%`);
  }
  if (segment && segment !== 'all') {
    if (variant === 'type') {
      query = query.eq('afterfeel_type', segment);
    } else {
      query = query.eq('segment', segment);
    }
  }
  if (dateFrom) {
    query = query.gte('created_at', `${dateFrom}T05:00:00Z`);
  }
  if (dateTo) {
    query = query.lte('created_at', `${dateTo}T04:59:59Z`);
  }

  // ── 4. 쿼리 실행 ───────────────────────────────────────────────
  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({
      success: false,
      error: 'Supabase query error',
      message: error.message,
      data: [],
      total: 0,
      totalAll: totalAll ?? 0,
    });
  }

  // ── 5. 어제 Segment A 카운트 (NYC 기준) ────────────────────────
  // EST=UTC-5 기준: 어제 NYC 자정~오늘 NYC 자정
  const yesterdayStart = `${getNYCDateServer(-1)}T05:00:00Z`;
  const yesterdayEnd   = `${getNYCDateServer(0)}T04:59:59Z`;

  // ── 6. 오늘 카운트 (NYC 기준) ────────────────────────────────
  const todayStart = `${getNYCDateServer(0)}T05:00:00Z`;  // 오늘 NYC 자정 = UTC 05:00
  const todayEnd   = `${getNYCDateServer(1)}T04:59:59Z`;  // 내일 NYC 자정 직전

  let yesterdayAQuery = supabase
    .from('piilk_subscribers')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', yesterdayStart)
    .lte('created_at', yesterdayEnd);

  if (variant === 'type') {
    yesterdayAQuery = yesterdayAQuery.eq('variant', 'type');
  } else {
    yesterdayAQuery = yesterdayAQuery.neq('variant', 'type').eq('segment', 'A');
  }

  let todayQuery = supabase
    .from('piilk_subscribers')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart)
    .lte('created_at', todayEnd);

  if (variant === 'type') {
    todayQuery = todayQuery.eq('variant', 'type');
  } else {
    todayQuery = todayQuery.neq('variant', 'type');
  }

  const [{ count: yesterdayCount }, { count: todayCount }] = await Promise.all([
    yesterdayAQuery,
    todayQuery,
  ]);

  const data = (rows || []).map((row: any) => ({
    id:           row.id?.toString() || '',
    email:        row.email         || '',
    name:         '',
    segment:      row.segment       || '',
    sub_reason:   row.afterfeel_type || row.sub_reason || '',
    signed_up_at: row.created_at    || '',
    source:       row.source        || 'supabase',
    variant:      row.variant       || '',
    afterfeel_type: row.afterfeel_type || '',
    ip_address:   row.ip_address    || '',
    device_type:  row.device_type   || '',
    language:     row.language      || '',
    timezone:     row.timezone      || '',
    referrer:     row.referrer      || '',
    country:      row.country       || '',
    region:       row.region        || '',
    city:         row.city          || '',
    utm_source:   row.utm_source    || '',
    utm_medium:   row.utm_medium    || '',
    utm_campaign: row.utm_campaign  || '',
  }));

  return NextResponse.json({
    success:        true,
    data,
    total:          filteredTotal ?? data.length,
    totalAll:       totalAll      ?? 0,
    yesterdayCount: yesterdayCount ?? 0,
    todayCount:     todayCount     ?? 0,  // ✅ 서버 집계 오늘 수
    page,
    limit,
    totalPages:     Math.ceil((filteredTotal ?? data.length) / limit),
  });
}

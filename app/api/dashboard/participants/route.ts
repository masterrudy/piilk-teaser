// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/dashboard/participants/route.ts
// 📌 역할: 대시보드 참여자 목록 API (Supabase only)
// 📌 수정: DST-safe UTC 변환 + limit=1000 + todayCount DB직접
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ✅ DST-safe: NYC offset(ms) 계산
function getNYCOffsetMs(): number {
  const now    = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
  const nycStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  return new Date(utcStr).getTime() - new Date(nycStr).getTime();
}

// ✅ NYC 기준 날짜 경계를 UTC ISO string으로 반환
function getNYCDayBoundsUTC(offsetDays = 0): { start: string; end: string } {
  const offsetMs = getNYCOffsetMs();

  // UTC 기준 지금 → NYC 기준 자정 계산
  const nowUTC  = Date.now();
  const nowNYC  = nowUTC - offsetMs; // NYC local timestamp (ms)

  // NYC 자정 (00:00:00)
  const nycMidnightMs = Math.floor(nowNYC / 86400000) * 86400000 + offsetDays * 86400000;

  // NYC 자정 → UTC
  const startUTC = new Date(nycMidnightMs + offsetMs).toISOString();
  const endUTC   = new Date(nycMidnightMs + offsetMs + 86400000).toISOString();

  return { start: startUTC, end: endUTC };
}

export async function GET(request: NextRequest) {
  const variant  = request.nextUrl.searchParams.get('variant') || 'main';
  // ✅ limit 기본값 1000, max 2000
  const page     = Math.max(1, parseInt(request.nextUrl.searchParams.get('page')  || '1'));
  const limit    = Math.min(2000, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '1000')));
  const search   = request.nextUrl.searchParams.get('search')   || '';
  const segment  = request.nextUrl.searchParams.get('segment')  || '';
  const dateFrom = request.nextUrl.searchParams.get('dateFrom') || '';
  const dateTo   = request.nextUrl.searchParams.get('dateTo')   || '';

  try {
    return await getSupabaseParticipants({ variant, page, limit, search, segment, dateFrom, dateTo });
  } catch (error: any) {
    return NextResponse.json({
      success: false, error: 'Caught exception',
      message: error?.message || String(error),
      data: [], total: 0, totalAll: 0,
    }, { status: 500 });
  }
}

async function getSupabaseParticipants({
  variant, page, limit, search, segment, dateFrom, dateTo
}: {
  variant: string; page: number; limit: number;
  search: string; segment: string; dateFrom: string; dateTo: string;
}) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ success: false, error: 'Missing env vars', data: [], total: 0, totalAll: 0 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const offset   = (page - 1) * limit;

  // ✅ DST-safe 경계
  const today     = getNYCDayBoundsUTC(0);
  const yesterday = getNYCDayBoundsUTC(-1);

  // dateFrom / dateTo → UTC 변환
  const offsetMs = getNYCOffsetMs();
  const dateFromUTC = dateFrom
    ? new Date(new Date(`${dateFrom}T00:00:00Z`).getTime() + offsetMs).toISOString()
    : null;
  const dateToUTC = dateTo
    ? new Date(new Date(`${dateTo}T00:00:00Z`).getTime() + offsetMs + 86400000).toISOString()
    : null;

  // ── 쿼리 빌더 헬퍼 ──────────────────────────────────────────
  const applyVariant = (q: any) => {
    if (variant === 'type') return q.eq('variant', 'type');
    if (variant === 'main') return q.neq('variant', 'type');
    return q;
  };
  const applyFilters = (q: any) => {
    if (search) q = q.ilike('email', `%${search}%`);
    if (segment && segment !== 'all') {
      q = variant === 'type'
        ? q.eq('afterfeel_type', segment)
        : q.eq('segment', segment);
    }
    if (dateFromUTC) q = q.gte('created_at', dateFromUTC);
    if (dateToUTC)   q = q.lt('created_at', dateToUTC);
    return q;
  };

  // ── 5개 쿼리 병렬 실행 ──────────────────────────────────────
  const [
    { count: totalAll },
    { count: filteredTotal },
    { data: rows, error },
    { count: todayCount },
    { count: yesterdayCount },
  ] = await Promise.all([
    // 1. 전체 카운트 (필터 없음)
    applyVariant(
      supabase.from('piilk_subscribers').select('id', { count: 'exact', head: true })
    ),
    // 2. 필터 적용 카운트
    applyFilters(applyVariant(
      supabase.from('piilk_subscribers').select('id', { count: 'exact', head: true })
    )),
    // 3. 실제 데이터
    applyFilters(applyVariant(
      supabase.from('piilk_subscribers')
        .select('id,email,segment,sub_reason,source,variant,afterfeel_type,created_at,ip_address,device_type,language,timezone,referrer,country,region,city,utm_source,utm_medium,utm_campaign')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
    )),
    // 4. ✅ 오늘 카운트 — DB 직접, DST-safe
    applyVariant(
      supabase.from('piilk_subscribers').select('id', { count: 'exact', head: true })
        .gte('created_at', today.start)
        .lt('created_at',  today.end)
    ),
    // 5. 어제 카운트
    (() => {
      let q = applyVariant(
        supabase.from('piilk_subscribers').select('id', { count: 'exact', head: true })
          .gte('created_at', yesterday.start)
          .lt('created_at',  yesterday.end)
      );
      if (variant === 'main') q = q.eq('segment', 'A');
      return q;
    })(),
  ]);

  if (error) {
    return NextResponse.json({
      success: false, error: 'Supabase query error',
      message: error.message, data: [], total: 0, totalAll: totalAll ?? 0,
    });
  }

  const data = (rows || []).map((row: any) => ({
    id:             row.id?.toString()               || '',
    email:          row.email                        || '',
    name:           '',
    segment:        row.segment                      || '',
    sub_reason:     row.afterfeel_type || row.sub_reason || '',
    signed_up_at:   row.created_at                  || '',
    source:         row.source                       || 'supabase',
    variant:        row.variant                      || '',
    afterfeel_type: row.afterfeel_type               || '',
    ip_address:     row.ip_address                   || '',
    device_type:    row.device_type                  || '',
    language:       row.language                     || '',
    timezone:       row.timezone                     || '',
    referrer:       row.referrer                     || '',
    country:        row.country                      || '',
    region:         row.region                       || '',
    city:           row.city                         || '',
    utm_source:     row.utm_source                   || '',
    utm_medium:     row.utm_medium                   || '',
    utm_campaign:   row.utm_campaign                 || '',
  }));

  return NextResponse.json({
    success:        true,
    data,
    total:          filteredTotal  ?? data.length,
    totalAll:       totalAll       ?? 0,
    todayCount:     todayCount     ?? 0,   // ✅ DB 직접값 — 프론트에서 그대로 사용할 것
    yesterdayCount: yesterdayCount ?? 0,
    page,
    limit,
    totalPages:     Math.ceil((filteredTotal ?? data.length) / limit),
  });
} 

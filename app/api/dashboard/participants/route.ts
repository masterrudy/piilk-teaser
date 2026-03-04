// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/dashboard/participants/route.ts
// 📌 역할: 대시보드 참여자 목록 API (Supabase only, 페이지네이션)
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

  // NYC 시간 기준
  const todayStr     = getNYCDateServer(0);
  const tomorrowStr  = getNYCDateServer(1);
  const yesterdayStr = getNYCDateServer(-1);

  // UTC 변환 (EST=UTC-5)
  const todayStartUTC     = `${todayStr}T05:00:00Z`;
  const todayEndUTC       = `${tomorrowStr}T04:59:59Z`;
  const yesterdayStartUTC = `${yesterdayStr}T05:00:00Z`;
  const yesterdayEndUTC   = `${todayStr}T04:59:59Z`;
  const dateFromUTC       = dateFrom ? `${dateFrom}T05:00:00Z` : null;
  const dateToUTC         = dateTo   ? `${dateTo}T04:59:59Z`   : null;

  // ── 쿼리 빌더 헬퍼 ──────────────────────────────────────────
  const applyVariant = (q: any) => {
    if (variant === 'type') return q.eq('variant', 'type');
    if (variant === 'main') return q.neq('variant', 'type');
    return q;
  };
  const applyFilters = (q: any) => {
    if (search)                 q = q.ilike('email', `%${search}%`);
    if (segment && segment !== 'all') {
      q = variant === 'type'
        ? q.eq('afterfeel_type', segment)
        : q.eq('segment', segment);
    }
    if (dateFromUTC) q = q.gte('created_at', dateFromUTC);
    if (dateToUTC)   q = q.lte('created_at', dateToUTC);
    return q;
  };

  // ── 5개 쿼리 병렬 실행 ✅ ────────────────────────────────────
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
    // 3. 실제 데이터 (페이지)
    applyFilters(applyVariant(
      supabase.from('piilk_subscribers')
        .select('id,email,segment,sub_reason,source,variant,afterfeel_type,created_at,ip_address,device_type,language,timezone,referrer,country,region,city,utm_source,utm_medium,utm_campaign')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
    )),
    // 4. 오늘 카운트 (NYC 기준, segment 무관 전체)
    applyVariant(
      supabase.from('piilk_subscribers').select('id', { count: 'exact', head: true })
        .gte('created_at', todayStartUTC)
        .lte('created_at', todayEndUTC)
    ),
    // 5. 어제 카운트 (NYC 기준, main=segmentA, type=전체)
    (() => {
      let q = applyVariant(
        supabase.from('piilk_subscribers').select('id', { count: 'exact', head: true })
          .gte('created_at', yesterdayStartUTC)
          .lte('created_at', yesterdayEndUTC)
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
    id:             row.id?.toString()          || '',
    email:          row.email                   || '',
    name:           '',
    segment:        row.segment                 || '',
    sub_reason:     row.afterfeel_type || row.sub_reason || '',
    signed_up_at:   row.created_at              || '',
    source:         row.source                  || 'supabase',
    variant:        row.variant                 || '',
    afterfeel_type: row.afterfeel_type          || '',
    ip_address:     row.ip_address              || '',
    device_type:    row.device_type             || '',
    language:       row.language                || '',
    timezone:       row.timezone                || '',
    referrer:       row.referrer                || '',
    country:        row.country                 || '',
    region:         row.region                  || '',
    city:           row.city                    || '',
    utm_source:     row.utm_source              || '',
    utm_medium:     row.utm_medium              || '',
    utm_campaign:   row.utm_campaign            || '',
  }));

  return NextResponse.json({
    success:        true,
    data,
    total:          filteredTotal  ?? data.length,   // 필터 적용 총 수
    totalAll:       totalAll       ?? 0,             // 필터 없는 전체 수
    todayCount:     todayCount     ?? 0,             // 오늘 NYC 기준
    yesterdayCount: yesterdayCount ?? 0,             // 어제 NYC 기준
    page,
    limit,
    totalPages:     Math.ceil((filteredTotal ?? data.length) / limit),
  });
}

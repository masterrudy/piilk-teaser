// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/dashboard/stats/route.ts
// 📌 역할: 대시보드 통계 API (variant 필터 지원 + All 합산)
// 📌 사용법: /api/dashboard/stats?variant=all (전체 합산, 이메일 unique)
//           /api/dashboard/stats?variant=type (퀴즈만)
//           /api/dashboard/stats?variant=main (메인 티저만)
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;

// ✅ Main Teaser 세그먼트 ID
const KLAVIYO_SEGMENTS = {
  A_TOTAL: 'UZgK56',
  A_RESIDUE: 'Ypdfd9',
  A_AFTERTASTE: 'XeKqr5',
  A_HEAVINESS: 'UqKsBm',
  A_HABIT: 'VXSP82',
  A_LAPSED: 'SW26qD',
  B_TOTAL: 'RUyw9p',
  C_TOTAL: 'XbMadh',
};

// ✅ Quiz Type 세그먼트 ID
const KLAVIYO_SEGMENTS_TYPE: Record<string, string> = {
  BRICK: 'Sh2BDs',
  CHALK: 'YumzBn',
  ZOMBIE: 'SPLpVA',
  GAMBLER: 'Rr543U',
};

// ✅ List IDs
const KLAVIYO_LIST_ID_MAIN = 'Xzi3yL'; // PIILK Waitlist - Teaser V1
const KLAVIYO_LIST_ID_TYPE = process.env.KLAVIYO_LIST_ID_TYPE;

// ✅ Pagination guard (대규모에서도 오차/중단 최소화)
const PAGE_SIZE = 100;
const MAX_PAGES = 500; // 100 * 500 = 50,000 profiles까지 카운트/수집 가능 (필요 시 증설)

/* ─────────────────────────── Klaviyo Helpers ─────────────────────────── */

function klaviyoHeaders() {
  return {
    Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
    Accept: 'application/json',
    revision: '2024-02-15',
  } as const;
}

async function getKlaviyoSegmentCount(segmentId: string): Promise<number> {
  if (!KLAVIYO_API_KEY) return 0;

  let count = 0;
  let url: string | null = `https://a.klaviyo.com/api/segments/${segmentId}/profiles/?page[size]=${PAGE_SIZE}`;
  let pageCount = 0;

  while (url && pageCount < MAX_PAGES) {
    try {
      const res = await fetch(url, {
        headers: klaviyoHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) break;

      const json: any = await res.json();
      count += (json.data || []).length;

      url = json.links?.next || null;
      pageCount++;
    } catch {
      break;
    }
  }

  return count;
}

async function getKlaviyoListCount(listId: string): Promise<number> {
  if (!KLAVIYO_API_KEY || !listId) return 0;

  let count = 0;
  let url: string | null = `https://a.klaviyo.com/api/lists/${listId}/profiles/?page[size]=${PAGE_SIZE}`;
  let pageCount = 0;

  while (url && pageCount < MAX_PAGES) {
    try {
      const res = await fetch(url, {
        headers: klaviyoHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) break;

      const json: any = await res.json();
      count += (json.data || []).length;

      url = json.links?.next || null;
      pageCount++;
    } catch {
      break;
    }
  }

  return count;
}

/**
 * ✅ All(합산)에서 “이메일 unique” total을 얻기 위해,
 * 리스트 프로필들을 이메일로 수집(Set)합니다.
 */
async function getKlaviyoListEmailSet(listId: string): Promise<Set<string>> {
  const emails = new Set<string>();
  if (!KLAVIYO_API_KEY || !listId) return emails;

  let url: string | null = `https://a.klaviyo.com/api/lists/${listId}/profiles/?page[size]=${PAGE_SIZE}`;
  let pageCount = 0;

  while (url && pageCount < MAX_PAGES) {
    try {
      const res = await fetch(url, {
        headers: klaviyoHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) break;

      const json: any = await res.json();
      const data: any[] = json.data || [];

      for (const item of data) {
        // Klaviyo profile payload: data[].attributes.email 형태가 일반적
        const email =
          (item?.attributes?.email as string | undefined) ||
          (item?.email as string | undefined);

        if (email) emails.add(email.toLowerCase().trim());
      }

      url = json.links?.next || null;
      pageCount++;
    } catch {
      break;
    }
  }

  return emails;
}

/* ─────────────────────────── Supabase Stats ─────────────────────────── */

// ✅ Supabase 데이터 조회 - variant 필터 지원 (all 추가)
async function getSupabaseStats(variant?: string) {
  const { data: subscribers, error } = await supabase
    .from('piilk_subscribers')
    .select('email, segment, sub_reason, variant, afterfeel_type');

  if (error) {
    console.error('Supabase error:', error);
    return null;
  }

  let filtered = subscribers || [];

  if (variant === 'type') {
    filtered = filtered.filter(s => s.variant === 'type');
  } else if (variant === 'main') {
    filtered = filtered.filter(s => !s.variant || s.variant !== 'type');
  }
  // variant === 'all' or undefined → no filter, use all

  // ✅ 이메일 기준 중복 제거 (all 모드에서 중요)
  if (variant === 'all') {
    const seen = new Set<string>();
    filtered = filtered.filter(s => {
      const email = (s.email || '').toLowerCase();
      if (!email) return false;
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });
  }

  const total = filtered.length;

  // Quiz Type breakdown (type or all)
  const brick = filtered.filter(s => s.afterfeel_type === 'brick').length;
  const chalk = filtered.filter(s => s.afterfeel_type === 'chalk').length;
  const zombie = filtered.filter(s => s.afterfeel_type === 'zombie').length;
  const gambler = filtered.filter(s => s.afterfeel_type === 'gambler').length;

  if (variant === 'type') {
    return {
      total,
      segments: {
        A: {
          total: brick,
          percentage: total > 0 ? ((brick / total) * 100).toFixed(1) : '0',
          breakdown: { residue: brick, aftertaste: chalk, heaviness: zombie, habit: gambler, lapsed: 0 },
        },
        B: { total: chalk, percentage: total > 0 ? ((chalk / total) * 100).toFixed(1) : '0' },
        C: { total: zombie + gambler, percentage: total > 0 ? (((zombie + gambler) / total) * 100).toFixed(1) : '0' },
      },
      quizBreakdown: { brick, chalk, zombie, gambler },
    };
  }

  // Main Teaser segments
  const segmentA = filtered.filter(s => s.segment === 'A');
  const segmentB = filtered.filter(s => s.segment === 'B');
  const segmentC = filtered.filter(s => s.segment === 'C');

  const result: any = {
    total,
    segments: {
      A: {
        total: segmentA.length,
        percentage: total > 0 ? ((segmentA.length / total) * 100).toFixed(1) : '0',
        breakdown: {
          residue: segmentA.filter(s => s.sub_reason === 'residue').length,
          aftertaste: segmentA.filter(s => s.sub_reason === 'aftertaste').length,
          heaviness: segmentA.filter(s => s.sub_reason === 'heaviness').length,
          habit: segmentA.filter(s => s.sub_reason === 'habit').length,
          lapsed: segmentA.filter(s => s.sub_reason === 'lapsed').length,
        },
      },
      B: { total: segmentB.length, percentage: total > 0 ? ((segmentB.length / total) * 100).toFixed(1) : '0' },
      C: { total: segmentC.length, percentage: total > 0 ? ((segmentC.length / total) * 100).toFixed(1) : '0' },
    },
  };

  // ✅ All 모드: quizBreakdown도 포함
  if (variant === 'all') {
    result.quizBreakdown = { brick, chalk, zombie, gambler };
  }

  return result;
}

/* ─────────────────────────── Klaviyo Stats ─────────────────────────── */

/**
 * ✅ Main Teaser Klaviyo
 * - total은 "항상" listTotal (세그먼트 합산/중복으로 total 왜곡 방지)
 * - 세그먼트/브레이크다운은 참고지표 (중복 가능)
 */
async function getKlaviyoStatsMain() {
  const [listTotal, aTotal, aResidue, aAftertaste, aHeaviness, aHabit, aLapsed, bTotal, cTotal] =
    await Promise.all([
      getKlaviyoListCount(KLAVIYO_LIST_ID_MAIN),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.A_TOTAL),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.A_RESIDUE),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.A_AFTERTASTE),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.A_HEAVINESS),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.A_HABIT),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.A_LAPSED),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.B_TOTAL),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.C_TOTAL),
    ]);

  const total = listTotal; // ✅ source of truth

  return {
    total,
    segments: {
      A: {
        total: aTotal,
        percentage: total > 0 ? ((aTotal / total) * 100).toFixed(1) : '0',
        breakdown: { residue: aResidue, aftertaste: aAftertaste, heaviness: aHeaviness, habit: aHabit, lapsed: aLapsed },
      },
      B: { total: bTotal, percentage: total > 0 ? ((bTotal / total) * 100).toFixed(1) : '0' },
      C: { total: cTotal, percentage: total > 0 ? ((cTotal / total) * 100).toFixed(1) : '0' },
    },
  };
}

/**
 * ✅ Quiz Type Klaviyo
 * - total은 "항상" type listTotal (list가 없으면 segmentSum을 fallback)
 */
async function getKlaviyoStatsType() {
  const [brick, chalk, zombie, gambler, listTotal] =
    await Promise.all([
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS_TYPE.BRICK),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS_TYPE.CHALK),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS_TYPE.ZOMBIE),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS_TYPE.GAMBLER),
      KLAVIYO_LIST_ID_TYPE ? getKlaviyoListCount(KLAVIYO_LIST_ID_TYPE) : Promise.resolve(0),
    ]);

  const segmentSum = brick + chalk + zombie + gambler;
  const total = listTotal > 0 ? listTotal : segmentSum; // ✅ list 우선, 없을 때만 fallback

  return {
    total,
    segments: {
      A: {
        total: brick,
        percentage: total > 0 ? ((brick / total) * 100).toFixed(1) : '0',
        breakdown: { residue: brick, aftertaste: chalk, heaviness: zombie, habit: gambler, lapsed: 0 },
      },
      B: { total: chalk, percentage: total > 0 ? ((chalk / total) * 100).toFixed(1) : '0' },
      C: { total: zombie + gambler, percentage: total > 0 ? (((zombie + gambler) / total) * 100).toFixed(1) : '0' },
    },
    quizBreakdown: { brick, chalk, zombie, gambler },
  };
}

/**
 * ✅ All Klaviyo
 * - total은 main/type 리스트 프로필을 이메일로 수집하여 unique(Set)로 계산
 * - segments는 main 기준(기존 정책 유지)
 * - quizBreakdown은 type 기준
 * - mainTotal/typeTotal은 "각 listTotal"을 별도 제공
 */
async function getKlaviyoStatsAll() {
  const [mainStats, typeStats, mainEmailSet, typeEmailSet] = await Promise.all([
    getKlaviyoStatsMain(),
    getKlaviyoStatsType(),
    getKlaviyoListEmailSet(KLAVIYO_LIST_ID_MAIN),
    KLAVIYO_LIST_ID_TYPE ? getKlaviyoListEmailSet(KLAVIYO_LIST_ID_TYPE) : Promise.resolve(new Set<string>()),
  ]);

const allEmails = new Set<string>();
mainEmailSet.forEach((e) => allEmails.add(e));
typeEmailSet.forEach((e) => allEmails.add(e));
const totalUnique = allEmails.size;

  return {
    total: totalUnique,            // ✅ unique total
    segments: mainStats.segments,  // ✅ main 세그먼트를 primary로
    quizBreakdown: typeStats.quizBreakdown,
    mainTotal: mainStats.total,    // ✅ 각 listTotal
    typeTotal: typeStats.total,
  };
}

/* ─────────────────────────── Route ─────────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const variant = request.nextUrl.searchParams.get('variant') || 'all';

    let supabaseData: any, klaviyoData: any;

    if (variant === 'all') {
      [supabaseData, klaviyoData] = await Promise.all([
        getSupabaseStats('all'),
        getKlaviyoStatsAll(),
      ]);
    } else if (variant === 'type') {
      [supabaseData, klaviyoData] = await Promise.all([
        getSupabaseStats('type'),
        getKlaviyoStatsType(),
      ]);
    } else {
      // default main
      [supabaseData, klaviyoData] = await Promise.all([
        getSupabaseStats('main'),
        getKlaviyoStatsMain(),
      ]);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      variant,
      supabase: supabaseData,
      klaviyo: klaviyoData,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

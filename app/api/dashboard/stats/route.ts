// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/dashboard/stats/route.ts
// 📌 역할: 대시보드 통계 API (variant 필터 지원)
// 📌 사용법: /api/dashboard/stats?variant=type (퀴즈만)
//           /api/dashboard/stats?variant=main (메인 티저만)
//           /api/dashboard/stats (전체)
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

// ✅ Quiz Type 세그먼트 ID (afterfeel_type 값: brick, chalk, zombie, gambler)
const KLAVIYO_SEGMENTS_TYPE = {
  BRICK: 'Sh2BDs',    // Brick Stomach
  CHALK: 'YumzBn',    // Chalk Mouth
  ZOMBIE: 'SPLpVA',   // Post-Shake Zombie
  GAMBLER: 'Rr543U',  // 30-Min Gambler
};

// ✅ Quiz Type List ID
const KLAVIYO_LIST_ID_TYPE = process.env.KLAVIYO_LIST_ID_TYPE;

async function getKlaviyoSegmentCount(segmentId: string): Promise<number> {
  if (!KLAVIYO_API_KEY) return 0;

  let count = 0;
  let url: string | null =
    `https://a.klaviyo.com/api/segments/${segmentId}/profiles/?page[size]=100`;
  let pageCount = 0;

  while (url && pageCount < 20) {
    try {
      const res: Response = await fetch(url, {
        headers: {
          Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
          Accept: 'application/json',
          revision: '2024-02-15',
        },
        cache: 'no-store',
      });
      if (!res.ok) break;
      const json = await res.json();
      count += (json.data || []).length;
      url = json.links?.next || null;
      pageCount++;
    } catch {
      break;
    }
  }

  return count;
}

// ✅ Klaviyo List 전체 프로필 수
async function getKlaviyoListCount(listId: string): Promise<number> {
  if (!KLAVIYO_API_KEY || !listId) return 0;

  let count = 0;
  let url: string | null =
    `https://a.klaviyo.com/api/lists/${listId}/profiles/?page[size]=100`;
  let pageCount = 0;

  while (url && pageCount < 20) {
    try {
      const res: Response = await fetch(url, {
        headers: {
          Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
          Accept: 'application/json',
          revision: '2024-02-15',
        },
        cache: 'no-store',
      });
      if (!res.ok) break;
      const json = await res.json();
      count += (json.data || []).length;
      url = json.links?.next || null;
      pageCount++;
    } catch {
      break;
    }
  }

  return count;
}

// ✅ Supabase 데이터 조회 - variant 필터 지원
async function getSupabaseStats(variant?: string) {
  const { data: subscribers, error } = await supabase
    .from('piilk_subscribers')
    .select('segment, sub_reason, variant, afterfeel_type');

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

  const total = filtered.length;

  // ✅ Quiz Type: afterfeel_type 기준 (값: brick, chalk, zombie, gambler)
  if (variant === 'type') {
    const brick = filtered.filter(s => s.afterfeel_type === 'brick').length;
    const chalk = filtered.filter(s => s.afterfeel_type === 'chalk').length;
    const zombie = filtered.filter(s => s.afterfeel_type === 'zombie').length;
    const gambler = filtered.filter(s => s.afterfeel_type === 'gambler').length;

    return {
      total,
      segments: {
        A: {
          total: brick,
          percentage: total > 0 ? ((brick / total) * 100).toFixed(1) : '0',
          breakdown: {
            residue: brick,
            aftertaste: chalk,
            heaviness: zombie,
            habit: gambler,
            lapsed: 0,
          },
        },
        B: {
          total: chalk,
          percentage: total > 0 ? ((chalk / total) * 100).toFixed(1) : '0',
        },
        C: {
          total: zombie + gambler,
          percentage: total > 0 ? (((zombie + gambler) / total) * 100).toFixed(1) : '0',
        },
      },
      quizBreakdown: { brick, chalk, zombie, gambler },
    };
  }

  // Main Teaser: 기존 A/B/C 구조
  const segmentA = filtered.filter(s => s.segment === 'A');
  const segmentB = filtered.filter(s => s.segment === 'B');
  const segmentC = filtered.filter(s => s.segment === 'C');

  return {
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
      B: {
        total: segmentB.length,
        percentage: total > 0 ? ((segmentB.length / total) * 100).toFixed(1) : '0',
      },
      C: {
        total: segmentC.length,
        percentage: total > 0 ? ((segmentC.length / total) * 100).toFixed(1) : '0',
      },
    },
  };
}

// ✅ Main Teaser Klaviyo
async function getKlaviyoStats() {
  const [aTotal, aResidue, aAftertaste, aHeaviness, aHabit, aLapsed, bTotal, cTotal] =
    await Promise.all([
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.A_TOTAL),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.A_RESIDUE),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.A_AFTERTASTE),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.A_HEAVINESS),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.A_HABIT),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.A_LAPSED),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.B_TOTAL),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS.C_TOTAL),
    ]);

  const total = aTotal + bTotal + cTotal;

  return {
    total,
    segments: {
      A: {
        total: aTotal,
        percentage: total > 0 ? ((aTotal / total) * 100).toFixed(1) : '0',
        breakdown: {
          residue: aResidue,
          aftertaste: aAftertaste,
          heaviness: aHeaviness,
          habit: aHabit,
          lapsed: aLapsed,
        },
      },
      B: {
        total: bTotal,
        percentage: total > 0 ? ((bTotal / total) * 100).toFixed(1) : '0',
      },
      C: {
        total: cTotal,
        percentage: total > 0 ? ((cTotal / total) * 100).toFixed(1) : '0',
      },
    },
  };
}

// ✅ Quiz Type Klaviyo
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
  const total = Math.max(listTotal, segmentSum);

  return {
    total,
    segments: {
      A: {
        total: brick,
        percentage: total > 0 ? ((brick / total) * 100).toFixed(1) : '0',
        breakdown: {
          residue: brick,
          aftertaste: chalk,
          heaviness: zombie,
          habit: gambler,
          lapsed: 0,
        },
      },
      B: {
        total: chalk,
        percentage: total > 0 ? ((chalk / total) * 100).toFixed(1) : '0',
      },
      C: {
        total: zombie + gambler,
        percentage: total > 0 ? (((zombie + gambler) / total) * 100).toFixed(1) : '0',
      },
    },
    quizBreakdown: { brick, chalk, zombie, gambler },
  };
}

export async function GET(request: NextRequest) {
  try {
    const variant = request.nextUrl.searchParams.get('variant') || undefined;

    const [supabaseData, klaviyoData] = await Promise.all([
      getSupabaseStats(variant),
      variant === 'type' ? getKlaviyoStatsType() : getKlaviyoStats(),
    ]);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      variant: variant || 'all',
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

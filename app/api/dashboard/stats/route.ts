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

// ✅ Quiz Type 세그먼트 ID
const KLAVIYO_SEGMENTS_TYPE = {
  BRICK_STOMACH: 'Sh2BDs',
  CHALK_MOUTH: 'YumzBn',
  POST_SHAKE_ZOMBIE: 'SPLpVA',
  THIRTY_MIN_GAMBLER: 'Rr543U',
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

// ✅ Klaviyo List의 전체 프로필 수 가져오기
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

  // ✅ Quiz Type: afterfeel_type 기준으로 breakdown
  if (variant === 'type') {
    const brickStomach = filtered.filter(s => s.afterfeel_type === 'brick_stomach').length;
    const chalkMouth = filtered.filter(s => s.afterfeel_type === 'chalk_mouth').length;
    const postShakeZombie = filtered.filter(s => s.afterfeel_type === 'post_shake_zombie').length;
    const thirtyMinGambler = filtered.filter(s => s.afterfeel_type === '30_min_gambler').length;

    return {
      total,
      segments: {
        A: {
          total: brickStomach,
          percentage: total > 0 ? ((brickStomach / total) * 100).toFixed(1) : '0',
          breakdown: {
            residue: brickStomach,
            aftertaste: chalkMouth,
            heaviness: postShakeZombie,
            habit: thirtyMinGambler,
            lapsed: 0,
          },
        },
        B: {
          total: chalkMouth + postShakeZombie,
          percentage: total > 0 ? (((chalkMouth + postShakeZombie) / total) * 100).toFixed(1) : '0',
        },
        C: {
          total: thirtyMinGambler,
          percentage: total > 0 ? ((thirtyMinGambler / total) * 100).toFixed(1) : '0',
        },
      },
      // ✅ Quiz Type 전용 데이터
      quizBreakdown: {
        brick_stomach: brickStomach,
        chalk_mouth: chalkMouth,
        post_shake_zombie: postShakeZombie,
        '30_min_gambler': thirtyMinGambler,
      },
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

// ✅ Main Teaser Klaviyo 데이터
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

// ✅ NEW: Quiz Type Klaviyo 데이터
async function getKlaviyoStatsType() {
  const [brickStomach, chalkMouth, postShakeZombie, thirtyMinGambler, listTotal] =
    await Promise.all([
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS_TYPE.BRICK_STOMACH),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS_TYPE.CHALK_MOUTH),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS_TYPE.POST_SHAKE_ZOMBIE),
      getKlaviyoSegmentCount(KLAVIYO_SEGMENTS_TYPE.THIRTY_MIN_GAMBLER),
      KLAVIYO_LIST_ID_TYPE ? getKlaviyoListCount(KLAVIYO_LIST_ID_TYPE) : Promise.resolve(0),
    ]);

  // List total 또는 세그먼트 합계 중 큰 값 사용
  const segmentSum = brickStomach + chalkMouth + postShakeZombie + thirtyMinGambler;
  const total = Math.max(listTotal, segmentSum);

  return {
    total,
    segments: {
      A: {
        total: brickStomach,
        percentage: total > 0 ? ((brickStomach / total) * 100).toFixed(1) : '0',
        breakdown: {
          residue: brickStomach,
          aftertaste: chalkMouth,
          heaviness: postShakeZombie,
          habit: thirtyMinGambler,
          lapsed: 0,
        },
      },
      B: {
        total: chalkMouth + postShakeZombie,
        percentage: total > 0 ? (((chalkMouth + postShakeZombie) / total) * 100).toFixed(1) : '0',
      },
      C: {
        total: thirtyMinGambler,
        percentage: total > 0 ? ((thirtyMinGambler / total) * 100).toFixed(1) : '0',
      },
    },
    // ✅ Quiz Type 전용 데이터
    quizBreakdown: {
      brick_stomach: brickStomach,
      chalk_mouth: chalkMouth,
      post_shake_zombie: postShakeZombie,
      '30_min_gambler': thirtyMinGambler,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const variant = request.nextUrl.searchParams.get('variant') || undefined;

    const [supabaseData, klaviyoData] = await Promise.all([
      getSupabaseStats(variant),
      // ✅ variant에 따라 다른 Klaviyo 데이터 조회
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

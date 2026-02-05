import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;

// Klaviyo 세그먼트 ID들
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

// Klaviyo 세그먼트 프로필 수 조회 (프로필 목록을 가져와서 직접 카운트)
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

// Supabase 데이터 조회
async function getSupabaseStats() {
  const { data: subscribers, error } = await supabase
    .from('piilk_subscribers')
    .select('segment, sub_reason');

  if (error) {
    console.error('Supabase error:', error);
    return null;
  }

  const total = subscribers?.length || 0;
  const segmentA = subscribers?.filter(s => s.segment === 'A') || [];
  const segmentB = subscribers?.filter(s => s.segment === 'B') || [];
  const segmentC = subscribers?.filter(s => s.segment === 'C') || [];

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

// Klaviyo 데이터 조회
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

export async function GET() {
  try {
    const [supabaseData, klaviyoData] = await Promise.all([
      getSupabaseStats(),
      getKlaviyoStats(),
    ]);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
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

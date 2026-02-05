import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;

// Klaviyo 세그먼트 ID들 (stats route와 동일)
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

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source') || 'supabase';

  try {
    if (source === 'supabase') return await getSupabaseParticipants();
    if (source === 'klaviyo') return await getKlaviyoParticipants();
    return NextResponse.json({ success: false, error: 'Invalid source' }, { status: 400 });
  } catch (error) {
    console.error(`[participants] Error fetching ${source}:`, error);
    return NextResponse.json({ success: false, error: 'Internal server error', data: [], total: 0 }, { status: 500 });
  }
}

/* ── Supabase: piilk_subscribers 테이블에서 전체 목록 조회 ── */
async function getSupabaseParticipants() {
  const { data: subscribers, error } = await supabase
    .from('piilk_subscribers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('[participants] Supabase error:', error);
    return NextResponse.json({ success: false, error: error.message, data: [], total: 0 });
  }

  const data = (subscribers || []).map((row: any) => ({
    id: row.id?.toString() || '',
    email: row.email || '',
    name: row.name || row.first_name || '',
    segment: row.segment || '',
    sub_reason: row.sub_reason || '',
    signed_up_at: row.created_at || '',
    source: 'supabase',
  }));

  return NextResponse.json({ success: true, data, total: data.length });
}

/* ── Klaviyo: 각 세그먼트별 프로필 목록 조회 ── */
async function getKlaviyoParticipants() {
  if (!KLAVIYO_API_KEY) {
    return NextResponse.json({ success: false, error: 'Klaviyo not configured', data: [], total: 0 });
  }

  // 모든 세그먼트에서 프로필 가져오기
  const segmentEntries = [
    { id: KLAVIYO_SEGMENTS.A_TOTAL, segment: 'A', sub_reason: '' },
    { id: KLAVIYO_SEGMENTS.A_RESIDUE, segment: 'A', sub_reason: 'residue' },
    { id: KLAVIYO_SEGMENTS.A_AFTERTASTE, segment: 'A', sub_reason: 'aftertaste' },
    { id: KLAVIYO_SEGMENTS.A_HEAVINESS, segment: 'A', sub_reason: 'heaviness' },
    { id: KLAVIYO_SEGMENTS.A_HABIT, segment: 'A', sub_reason: 'habit' },
    { id: KLAVIYO_SEGMENTS.A_LAPSED, segment: 'A', sub_reason: 'lapsed' },
    { id: KLAVIYO_SEGMENTS.B_TOTAL, segment: 'B', sub_reason: '' },
    { id: KLAVIYO_SEGMENTS.C_TOTAL, segment: 'C', sub_reason: '' },
  ];

  const allProfiles = new Map<string, any>();

  // A_TOTAL, B_TOTAL, C_TOTAL 세그먼트에서 프로필 목록 가져오기
  const mainSegments = [
    { id: KLAVIYO_SEGMENTS.A_TOTAL, segment: 'A' },
    { id: KLAVIYO_SEGMENTS.B_TOTAL, segment: 'B' },
    { id: KLAVIYO_SEGMENTS.C_TOTAL, segment: 'C' },
  ];

  for (const seg of mainSegments) {
    const profiles = await fetchKlaviyoSegmentProfiles(seg.id);
    for (const profile of profiles) {
      const attrs = profile.attributes || {};
      allProfiles.set(profile.id, {
        id: profile.id || '',
        email: attrs.email || '',
        name: [attrs.first_name, attrs.last_name].filter(Boolean).join(' ') || '',
        segment: seg.segment,
        sub_reason: attrs.properties?.sub_reason || '',
        signed_up_at: attrs.created || '',
        source: 'klaviyo',
      });
    }
  }

  const data = Array.from(allProfiles.values());
  // 최신순 정렬
  data.sort((a, b) => (b.signed_up_at || '').localeCompare(a.signed_up_at || ''));

  return NextResponse.json({ success: true, data, total: data.length });
}

/* ── Klaviyo 세그먼트의 프로필 목록 가져오기 ── */
async function fetchKlaviyoSegmentProfiles(segmentId: string): Promise<any[]> {
  const allProfiles: any[] = [];
  let url: string | null = `https://a.klaviyo.com/api/segments/${segmentId}/profiles/?page[size]=100`;
  let pageCount = 0;

  while (url && pageCount < 10) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
          Accept: 'application/json',
          revision: '2024-02-15',
        },
        cache: 'no-store',
      });

      if (!res.ok) break;
      const json = await res.json();
      allProfiles.push(...(json.data || []));
      url = json.links?.next || null;
      pageCount++;
    } catch {
      break;
    }
  }

  return allProfiles;
}

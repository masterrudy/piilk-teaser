// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/dashboard/participants/route.ts
// 📌 역할: 대시보드 참여자 목록 API (variant 필터 지원)
// 📌 사용법: /api/dashboard/participants?source=supabase&variant=type
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;

// ✅ Main Teaser 세그먼트
const KLAVIYO_SEGMENTS = {
  A_TOTAL: 'UZgK56',
  B_TOTAL: 'RUyw9p',
  C_TOTAL: 'XbMadh',
};

const KLAVIYO_A_SUB_SEGMENTS: Record<string, string> = {
  'Ypdfd9': 'residue',
  'XeKqr5': 'aftertaste',
  'UqKsBm': 'heaviness',
  'VXSP82': 'habit',
  'SW26qD': 'lapsed',
};

// ✅ Quiz Type 세그먼트
const KLAVIYO_SEGMENTS_TYPE: Record<string, string> = {
  'Sh2BDs': 'brick_stomach',
  'YumzBn': 'chalk_mouth',
  'SPLpVA': 'post_shake_zombie',
  'Rr543U': '30_min_gambler',
};

// ✅ Quiz Type List ID
const KLAVIYO_LIST_ID_TYPE = process.env.KLAVIYO_LIST_ID_TYPE;

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source') || 'supabase';
  const variant = request.nextUrl.searchParams.get('variant') || undefined;

  try {
    if (source === 'supabase') return await getSupabaseParticipants(variant);
    if (source === 'klaviyo') {
      // ✅ variant에 따라 다른 Klaviyo 데이터 조회
      if (variant === 'type') return await getKlaviyoParticipantsType();
      return await getKlaviyoParticipants(variant);
    }
    return NextResponse.json({ success: false, error: 'Invalid source' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Caught exception',
      message: error?.message || String(error),
      stack: error?.stack?.split('\n').slice(0, 5),
      data: [],
      total: 0,
    }, { status: 500 });
  }
}

// ✅ Supabase - variant 필터 (기존과 동일)
async function getSupabaseParticipants(variant?: string) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({
      success: false, error: 'Missing env vars',
      hasUrl: !!supabaseUrl, hasKey: !!supabaseKey, data: [], total: 0,
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: subscribers, error } = await supabase
    .from('piilk_subscribers')
    .select('id, email, segment, sub_reason, source, variant, afterfeel_type, created_at, ip_address, device_type, language, timezone, referrer, country, region, city, utm_source, utm_medium, utm_campaign');

  if (error) {
    return NextResponse.json({
      success: false, error: 'Supabase query error',
      message: error.message, code: error.code, hint: error.hint, details: error.details,
      data: [], total: 0,
    });
  }

  if (!subscribers) {
    return NextResponse.json({ success: false, error: 'No data returned', data: [], total: 0 });
  }

  let filtered = subscribers;
  if (variant === 'type') {
    filtered = subscribers.filter((row: any) => row.variant === 'type');
  } else if (variant === 'main') {
    filtered = subscribers.filter((row: any) => !row.variant || row.variant !== 'type');
  }

  const data = filtered.map((row: any) => ({
    id: row.id?.toString() || '',
    email: row.email || '',
    name: '',
    segment: row.segment || '',
    sub_reason: row.afterfeel_type || row.sub_reason || '',
    signed_up_at: row.created_at || '',
    source: row.source || 'supabase',
    variant: row.variant || '',
    afterfeel_type: row.afterfeel_type || '',
    ip_address: row.ip_address || '',
    device_type: row.device_type || '',
    language: row.language || '',
    timezone: row.timezone || '',
    referrer: row.referrer || '',
    country: row.country || '',
    region: row.region || '',
    city: row.city || '',
    utm_source: row.utm_source || '',
    utm_medium: row.utm_medium || '',
    utm_campaign: row.utm_campaign || '',
  }));

  data.sort((a: any, b: any) => (b.signed_up_at || '').localeCompare(a.signed_up_at || ''));

  return NextResponse.json({ success: true, data, total: data.length });
}

// ✅ Main Teaser Klaviyo (기존과 동일)
async function getKlaviyoParticipants(variant?: string) {
  if (!KLAVIYO_API_KEY) {
    return NextResponse.json({ success: false, error: 'Klaviyo not configured', data: [], total: 0 });
  }

  const mainSegments = [
    { id: KLAVIYO_SEGMENTS.A_TOTAL, segment: 'A' },
    { id: KLAVIYO_SEGMENTS.B_TOTAL, segment: 'B' },
    { id: KLAVIYO_SEGMENTS.C_TOTAL, segment: 'C' },
  ];

  const subSegmentProfiles = new Map<string, string>();

  for (const [segId, reason] of Object.entries(KLAVIYO_A_SUB_SEGMENTS)) {
    const profiles = await fetchSegmentProfiles(segId);
    for (const profile of profiles) {
      const email = profile.attributes?.email?.toLowerCase();
      if (email) {
        subSegmentProfiles.set(email, reason);
      }
    }
  }

  const allProfiles = new Map<string, any>();

  for (const seg of mainSegments) {
    const profiles = await fetchSegmentProfiles(seg.id);
    for (const profile of profiles) {
      const attrs = profile.attributes || {};
      const props = attrs.properties || {};
      const email = (attrs.email || '').toLowerCase();

      if (!allProfiles.has(profile.id)) {
        let subReason = props.sub_reason || '';
        if (!subReason && seg.segment === 'A' && email) {
          subReason = subSegmentProfiles.get(email) || '';
        }
        if (!subReason && seg.segment === 'B') subReason = 'not_interested';
        if (!subReason && seg.segment === 'C') subReason = 'curious';

        allProfiles.set(profile.id, {
          id: profile.id || '',
          email: attrs.email || '',
          name: [attrs.first_name, attrs.last_name].filter(Boolean).join(' ') || '',
          segment: seg.segment,
          sub_reason: subReason,
          signed_up_at: attrs.created || '',
          source: 'klaviyo',
          variant: props.variant || '',
          afterfeel_type: props.afterfeel_type || '',
          ip_address: '',
          device_type: props.device_type || '',
          language: props.language || '',
          timezone: props.timezone || '',
          referrer: '',
          country: props.country || '',
          region: props.region || '',
          city: props.city || '',
          utm_source: props.utm_source || '',
          utm_medium: props.utm_medium || '',
          utm_campaign: props.utm_campaign || '',
        });
      }
    }
  }

  let data = Array.from(allProfiles.values());

  if (variant === 'main') {
    data = data.filter(p => !p.variant || p.variant !== 'type');
  }

  data.sort((a, b) => (b.signed_up_at || '').localeCompare(a.signed_up_at || ''));

  return NextResponse.json({ success: true, data, total: data.length });
}

// ✅ NEW: Quiz Type Klaviyo — List에서 전체 프로필 + 세그먼트로 타입 매핑
async function getKlaviyoParticipantsType() {
  if (!KLAVIYO_API_KEY) {
    return NextResponse.json({ success: false, error: 'Klaviyo not configured', data: [], total: 0 });
  }

  // Step 1: 세그먼트별 프로필 → afterfeel_type 매핑
  const typeByEmail = new Map<string, string>();

  for (const [segId, typeName] of Object.entries(KLAVIYO_SEGMENTS_TYPE)) {
    const profiles = await fetchSegmentProfiles(segId);
    for (const profile of profiles) {
      const email = profile.attributes?.email?.toLowerCase();
      if (email) {
        typeByEmail.set(email, typeName);
      }
    }
  }

  // Step 2: List에서 전체 프로필 가져오기
  let allProfiles: any[] = [];

  if (KLAVIYO_LIST_ID_TYPE) {
    allProfiles = await fetchListProfiles(KLAVIYO_LIST_ID_TYPE);
  } else {
    // List ID 없으면 세그먼트에서 가져오기
    for (const segId of Object.keys(KLAVIYO_SEGMENTS_TYPE)) {
      const profiles = await fetchSegmentProfiles(segId);
      allProfiles.push(...profiles);
    }
  }

  // Step 3: 중복 제거 + 데이터 매핑
  const seen = new Map<string, any>();

  for (const profile of allProfiles) {
    if (seen.has(profile.id)) continue;

    const attrs = profile.attributes || {};
    const props = attrs.properties || {};
    const email = (attrs.email || '').toLowerCase();

    // afterfeel_type: 세그먼트 매핑 > property > 없음
    const afterfeelType = typeByEmail.get(email) || props.afterfeel_type || '';

    seen.set(profile.id, {
      id: profile.id || '',
      email: attrs.email || '',
      name: [attrs.first_name, attrs.last_name].filter(Boolean).join(' ') || '',
      segment: 'afterfeel_quiz',
      sub_reason: afterfeelType,
      signed_up_at: attrs.created || '',
      source: 'klaviyo',
      variant: 'type',
      afterfeel_type: afterfeelType,
      ip_address: '',
      device_type: props.device_type || '',
      language: props.language || '',
      timezone: props.timezone || '',
      referrer: '',
      country: props.country || '',
      region: props.region || '',
      city: props.city || '',
      utm_source: props.utm_source || '',
      utm_medium: props.utm_medium || '',
      utm_campaign: props.utm_campaign || '',
    });
  }

  const data = Array.from(seen.values());
  data.sort((a, b) => (b.signed_up_at || '').localeCompare(a.signed_up_at || ''));

  return NextResponse.json({ success: true, data, total: data.length });
}

// ✅ 세그먼트에서 프로필 가져오기
async function fetchSegmentProfiles(segmentId: string): Promise<any[]> {
  const allProfiles: any[] = [];
  let url: string | null =
    `https://a.klaviyo.com/api/segments/${segmentId}/profiles/?page[size]=100`;
  let pageCount = 0;

  while (url && pageCount < 10) {
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
      allProfiles.push(...(json.data || []));
      url = json.links?.next || null;
      pageCount++;
    } catch {
      break;
    }
  }

  return allProfiles;
}

// ✅ NEW: List에서 프로필 가져오기
async function fetchListProfiles(listId: string): Promise<any[]> {
  const allProfiles: any[] = [];
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
      allProfiles.push(...(json.data || []));
      url = json.links?.next || null;
      pageCount++;
    } catch {
      break;
    }
  }

  return allProfiles;
}

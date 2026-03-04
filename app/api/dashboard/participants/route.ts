// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/dashboard/participants/route.ts
// 📌 역할: 대시보드 참여자 목록 API (variant=all 지원)
// 📌 사용법: /api/dashboard/participants?source=supabase&variant=all
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
  'Sh2BDs': 'brick',
  'YumzBn': 'chalk',
  'SPLpVA': 'zombie',
  'Rr543U': 'gambler',
};

// ✅ List IDs
const KLAVIYO_LIST_ID_MAIN = 'Xzi3yL';
const KLAVIYO_LIST_ID_TYPE = process.env.KLAVIYO_LIST_ID_TYPE;

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source') || 'supabase';
  const variant = request.nextUrl.searchParams.get('variant') || 'all';

  try {
    if (source === 'supabase') return await getSupabaseParticipants(variant);
    if (source === 'klaviyo') {
      if (variant === 'type') return await getKlaviyoParticipantsType();
      if (variant === 'main') return await getKlaviyoParticipantsMain();
      // ✅ variant === 'all': Main + Quiz 합산
      return await getKlaviyoParticipantsAll();
    }
    return NextResponse.json({ success: false, error: 'Invalid source' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({
      success: false, error: 'Caught exception',
      message: error?.message || String(error),
      stack: error?.stack?.split('\n').slice(0, 5),
      data: [], total: 0,
    }, { status: 500 });
  }
}

// ✅ Supabase - variant 필터 (all = 이메일 중복 제거)
async function getSupabaseParticipants(variant: string) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ success: false, error: 'Missing env vars', data: [], total: 0 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: subscribers, error } = await supabase
    .from('piilk_subscribers')
    .select('id, email, segment, sub_reason, source, variant, afterfeel_type, created_at, ip_address, device_type, language, timezone, referrer, country, region, city, utm_source, utm_medium, utm_campaign');

  if (error) {
    return NextResponse.json({ success: false, error: 'Supabase query error', message: error.message, data: [], total: 0 });
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
  // variant === 'all' → no filter

  // ✅ All: 이메일 기준 중복 제거 (최신 데이터 우선)
  if (variant === 'all') {
    filtered.sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
    const seen = new Set<string>();
    filtered = filtered.filter((row: any) => {
      const email = (row.email || '').toLowerCase();
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });
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

// ✅ Main Teaser Klaviyo — 리스트 기반 + 세그먼트 매핑
async function getKlaviyoParticipantsMain() {
  if (!KLAVIYO_API_KEY) {
    return NextResponse.json({ success: false, error: 'Klaviyo not configured', data: [], total: 0 });
  }

  // Step 1: 세그먼트별 프로필로 segment/sub_reason 매핑 구축
  const segmentByEmail = new Map<string, string>(); // email → A/B/C
  const subReasonByEmail = new Map<string, string>(); // email → reason

  const mainSegments = [
    { id: KLAVIYO_SEGMENTS.A_TOTAL, segment: 'A' },
    { id: KLAVIYO_SEGMENTS.B_TOTAL, segment: 'B' },
    { id: KLAVIYO_SEGMENTS.C_TOTAL, segment: 'C' },
  ];

  for (const seg of mainSegments) {
    const profiles = await fetchSegmentProfiles(seg.id);
    for (const profile of profiles) {
      const email = (profile.attributes?.email || '').toLowerCase();
      if (email) segmentByEmail.set(email, seg.segment);
    }
  }

  for (const [segId, reason] of Object.entries(KLAVIYO_A_SUB_SEGMENTS)) {
    const profiles = await fetchSegmentProfiles(segId);
    for (const profile of profiles) {
      const email = (profile.attributes?.email || '').toLowerCase();
      if (email) subReasonByEmail.set(email, reason);
    }
  }

  // Step 2: 리스트에서 전체 프로필 가져오기
  const allProfiles = await fetchListProfiles(KLAVIYO_LIST_ID_MAIN);

  // Step 3: 데이터 매핑
  const seen = new Map<string, any>();

  for (const profile of allProfiles) {
    if (seen.has(profile.id)) continue;

    const attrs = profile.attributes || {};
    const props = attrs.properties || {};
    const email = (attrs.email || '').toLowerCase();

    const segment = props.segment || segmentByEmail.get(email) || 'A';
    let subReason = props.sub_reason || subReasonByEmail.get(email) || '';
    if (!subReason && segment === 'B') subReason = 'not_interested';
    if (!subReason && segment === 'C') subReason = 'curious';
    if (!subReason && segment === 'A') subReason = 'direct';

    seen.set(profile.id, {
      id: profile.id || '',
      email: attrs.email || '',
      name: [attrs.first_name, attrs.last_name].filter(Boolean).join(' ') || '',
      segment,
      sub_reason: subReason,
      signed_up_at: attrs.created || '',
      source: 'klaviyo',
      variant: props.variant || 'main',
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

  const data = Array.from(seen.values());
  data.sort((a, b) => (b.signed_up_at || '').localeCompare(a.signed_up_at || ''));

  return NextResponse.json({ success: true, data, total: data.length });
}

// ✅ Quiz Type Klaviyo
async function getKlaviyoParticipantsType() {
  if (!KLAVIYO_API_KEY) {
    return NextResponse.json({ success: false, error: 'Klaviyo not configured', data: [], total: 0 });
  }

  const typeByEmail = new Map<string, string>();
  for (const [segId, typeName] of Object.entries(KLAVIYO_SEGMENTS_TYPE)) {
    const profiles = await fetchSegmentProfiles(segId);
    for (const profile of profiles) {
      const email = profile.attributes?.email?.toLowerCase();
      if (email) typeByEmail.set(email, typeName);
    }
  }

  let allProfiles: any[] = [];
  if (KLAVIYO_LIST_ID_TYPE) {
    allProfiles = await fetchListProfiles(KLAVIYO_LIST_ID_TYPE);
  } else {
    for (const segId of Object.keys(KLAVIYO_SEGMENTS_TYPE)) {
      const profiles = await fetchSegmentProfiles(segId);
      allProfiles.push(...profiles);
    }
  }

  const seen = new Map<string, any>();
  for (const profile of allProfiles) {
    if (seen.has(profile.id)) continue;
    const attrs = profile.attributes || {};
    const props = attrs.properties || {};
    const email = (attrs.email || '').toLowerCase();
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

// ✅ All Klaviyo — Main + Quiz 합산, 이메일 기준 중복 제거
async function getKlaviyoParticipantsAll() {
  if (!KLAVIYO_API_KEY) {
    return NextResponse.json({ success: false, error: 'Klaviyo not configured', data: [], total: 0 });
  }

  // Main과 Quiz 프로필을 각각 가져옴
  const [mainRes, typeRes] = await Promise.all([
    getKlaviyoParticipantsMain(),
    getKlaviyoParticipantsType(),
  ]);

  const mainJson = await mainRes.json();
  const typeJson = await typeRes.json();

  const mainData: any[] = mainJson.data || [];
  const typeData: any[] = typeJson.data || [];

  // 이메일 기준 중복 제거 (Main 우선, 최신 날짜 우선)
  const allData = [...mainData, ...typeData];
  allData.sort((a, b) => (b.signed_up_at || '').localeCompare(a.signed_up_at || ''));

  const seen = new Set<string>();
  const deduped = allData.filter(p => {
    const email = (p.email || '').toLowerCase();
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });

  return NextResponse.json({ success: true, data: deduped, total: deduped.length });
}

// ✅ 세그먼트에서 프로필 가져오기
async function fetchSegmentProfiles(segmentId: string): Promise<any[]> {
  const allProfiles: any[] = [];
  let url: string | null = `https://a.klaviyo.com/api/segments/${segmentId}/profiles/?page[size]=100`;
  let pageCount = 0;
  while (url && pageCount < 10) {
    try {
      const res: Response = await fetch(url, {
        headers: { Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`, Accept: 'application/json', revision: '2024-02-15' },
        cache: 'no-store',
      });
      if (!res.ok) break;
      const json = await res.json();
      allProfiles.push(...(json.data || []));
      url = json.links?.next || null;
      pageCount++;
    } catch { break; }
  }
  return allProfiles;
}

// ✅ List에서 프로필 가져오기
async function fetchListProfiles(listId: string): Promise<any[]> {
  const allProfiles: any[] = [];
  let url: string | null = `https://a.klaviyo.com/api/lists/${listId}/profiles/?page[size]=100`;
  let pageCount = 0;
  while (url && pageCount < 20) {
    try {
      const res: Response = await fetch(url, {
        headers: { Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`, Accept: 'application/json', revision: '2024-02-15' },
        cache: 'no-store',
      });
      if (!res.ok) break;
      const json = await res.json();
      allProfiles.push(...(json.data || []));
      url = json.links?.next || null;
      pageCount++;
    } catch { break; }
  }
  return allProfiles;
}

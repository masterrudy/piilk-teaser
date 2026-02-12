import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;

const KLAVIYO_SEGMENTS = {
  A_TOTAL: 'UZgK56',
  B_TOTAL: 'RUyw9p',
  C_TOTAL: 'XbMadh',
};

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source') || 'supabase';

  try {
    if (source === 'supabase') return await getSupabaseParticipants();
    if (source === 'klaviyo') return await getKlaviyoParticipants();
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

async function getSupabaseParticipants() {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({
      success: false,
      error: 'Missing env vars',
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
      data: [],
      total: 0,
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ✅ 새 트래킹 컬럼 전부 포함
  const { data: subscribers, error } = await supabase
    .from('piilk_subscribers')
    .select('id, email, segment, sub_reason, source, created_at, ip_address, device_type, language, timezone, referrer, country, region, city, utm_source, utm_medium, utm_campaign');

  if (error) {
    return NextResponse.json({
      success: false,
      error: 'Supabase query error',
      message: error.message,
      code: error.code,
      hint: error.hint,
      details: error.details,
      data: [],
      total: 0,
    });
  }

  if (!subscribers) {
    return NextResponse.json({
      success: false,
      error: 'No data returned',
      data: [],
      total: 0,
    });
  }

  const data = subscribers.map((row: any) => ({
    id: row.id?.toString() || '',
    email: row.email || '',
    name: '',
    segment: row.segment || '',
    sub_reason: row.sub_reason || '',
    signed_up_at: row.created_at || '',
    source: row.source || 'supabase',
    // ✅ 새 트래킹 필드
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

  // ✅ 최신순 정렬
  data.sort((a: any, b: any) => (b.signed_up_at || '').localeCompare(a.signed_up_at || ''));

  return NextResponse.json({ success: true, data, total: data.length });
}

async function getKlaviyoParticipants() {
  if (!KLAVIYO_API_KEY) {
    return NextResponse.json({ success: false, error: 'Klaviyo not configured', data: [], total: 0 });
  }

  const mainSegments = [
    { id: KLAVIYO_SEGMENTS.A_TOTAL, segment: 'A' },
    { id: KLAVIYO_SEGMENTS.B_TOTAL, segment: 'B' },
    { id: KLAVIYO_SEGMENTS.C_TOTAL, segment: 'C' },
  ];

  const allProfiles = new Map<string, any>();

  for (const seg of mainSegments) {
    const profiles = await fetchSegmentProfiles(seg.id);
    for (const profile of profiles) {
      const attrs = profile.attributes || {};
      const props = attrs.properties || {};
      if (!allProfiles.has(profile.id)) {
        allProfiles.set(profile.id, {
          id: profile.id || '',
          email: attrs.email || '',
          name: [attrs.first_name, attrs.last_name].filter(Boolean).join(' ') || '',
          segment: seg.segment,
          sub_reason: props.sub_reason || '',
          signed_up_at: attrs.created || '',
          source: 'klaviyo',
          // ✅ Klaviyo 프로필에서도 트래킹 데이터 가져오기
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

  const data = Array.from(allProfiles.values());
  data.sort((a, b) => (b.signed_up_at || '').localeCompare(a.signed_up_at || ''));

  return NextResponse.json({ success: true, data, total: data.length });
}

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

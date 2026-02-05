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
  // 환경변수 확인
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

  const { data: subscribers, error } = await supabase
    .from('piilk_subscribers')
    .select('id, email, segment, sub_reason');

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
    signed_up_at: '',
    source: 'supabase',
  }));

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
      if (!allProfiles.has(profile.id)) {
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

import { NextRequest, NextResponse } from 'next/server';

// API route: /api/dashboard/participants?source=klaviyo|supabase
// Returns the detailed list of individual participants

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source') || 'supabase';

  try {
    if (source === 'supabase') {
      return await getSupabaseParticipants();
    } else if (source === 'klaviyo') {
      return await getKlaviyoParticipants();
    } else {
      return NextResponse.json({ success: false, error: 'Invalid source' }, { status: 400 });
    }
  } catch (error) {
    console.error(`[participants] Error fetching ${source}:`, error);
    return NextResponse.json({ success: false, error: 'Internal server error', data: [], total: 0 }, { status: 500 });
  }
}

/* ──────────────────────────────────────────────
   Supabase: fetch all signup records
   ────────────────────────────────────────────── */
async function getSupabaseParticipants() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ success: false, error: 'Supabase not configured', data: [], total: 0 });
  }

  // Fetch from your signups table — adjust table/column names to match your schema
  const res = await fetch(
    `${supabaseUrl}/rest/v1/signups?select=id,email,name,segment,sub_reason,created_at&order=created_at.desc&limit=1000`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error('[participants] Supabase error:', errText);
    return NextResponse.json({ success: false, error: 'Supabase query failed', data: [], total: 0 });
  }

  const rows = await res.json();

  const data = rows.map((row: any) => ({
    id: row.id?.toString() || '',
    email: row.email || '',
    name: row.name || '',
    segment: row.segment || '',
    sub_reason: row.sub_reason || '',
    signed_up_at: row.created_at || '',
    source: 'supabase',
  }));

  return NextResponse.json({ success: true, data, total: data.length });
}

/* ──────────────────────────────────────────────
   Klaviyo: fetch profiles from a list
   ────────────────────────────────────────────── */
async function getKlaviyoParticipants() {
  const apiKey = process.env.KLAVIYO_API_KEY;
  const listId = process.env.KLAVIYO_LIST_ID;

  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'Klaviyo not configured', data: [], total: 0 });
  }

  // If a specific list ID is provided, fetch profiles from that list
  // Otherwise fetch all profiles (recent)
  let url = listId
    ? `https://a.klaviyo.com/api/lists/${listId}/profiles/?page[size]=100`
    : `https://a.klaviyo.com/api/profiles/?page[size]=100&sort=-created`;

  const allProfiles: any[] = [];
  let pageCount = 0;
  const maxPages = 10; // Safety limit

  while (url && pageCount < maxPages) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        accept: 'application/json',
        revision: '2024-10-15',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[participants] Klaviyo error:', errText);
      break;
    }

    const json = await res.json();
    const profiles = json.data || [];
    allProfiles.push(...profiles);

    // Pagination
    url = json.links?.next || '';
    pageCount++;
  }

  const data = allProfiles.map((profile: any) => {
    const attrs = profile.attributes || {};
    return {
      id: profile.id || '',
      email: attrs.email || '',
      name: [attrs.first_name, attrs.last_name].filter(Boolean).join(' ') || '',
      segment: attrs.properties?.segment || '',
      sub_reason: attrs.properties?.sub_reason || '',
      signed_up_at: attrs.created || attrs.datetime || '',
      source: 'klaviyo',
    };
  });

  return NextResponse.json({ success: true, data, total: data.length });
}

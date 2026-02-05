import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════════
// API route: /api/dashboard
// Query params:
//   ?type=stats              → aggregated dashboard numbers
//   ?type=participants&source=klaviyo|supabase → individual list
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') || 'stats';
  const source = request.nextUrl.searchParams.get('source') || 'supabase';

  try {
    if (type === 'participants') {
      if (source === 'supabase') return await getSupabaseParticipants();
      if (source === 'klaviyo') return await getKlaviyoParticipants();
      return NextResponse.json({ success: false, error: 'Invalid source' }, { status: 400 });
    }

    // Default: stats
    return await getStats();
  } catch (error) {
    console.error(`[dashboard] Error (type=${type}, source=${source}):`, error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/* ══════════════════════════════════════════════════════════════
   STATS — aggregated dashboard numbers
   ══════════════════════════════════════════════════════════════ */

async function getStats() {
  const [supabase, klaviyo] = await Promise.all([
    getSupabaseStats(),
    getKlaviyoStats(),
  ]);
  return NextResponse.json({ success: true, supabase, klaviyo });
}

/* ── Supabase stats ── */
async function getSupabaseStats() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/signups?select=id,segment,sub_reason`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 0 },
      }
    );

    if (!res.ok) return null;
    const rows: { id: number; segment: string; sub_reason: string }[] = await res.json();
    const total = rows.length;

    const segA = rows.filter((r) => r.segment === 'A');
    const segB = rows.filter((r) => r.segment === 'B');
    const segC = rows.filter((r) => r.segment === 'C');

    return {
      total,
      segments: {
        A: {
          total: segA.length,
          percentage: total ? ((segA.length / total) * 100).toFixed(1) : '0',
          breakdown: {
            residue: segA.filter((r) => r.sub_reason === 'residue').length,
            aftertaste: segA.filter((r) => r.sub_reason === 'aftertaste').length,
            heaviness: segA.filter((r) => r.sub_reason === 'heaviness').length,
            habit: segA.filter((r) => r.sub_reason === 'habit').length,
            lapsed: segA.filter((r) => r.sub_reason === 'lapsed').length,
          },
        },
        B: {
          total: segB.length,
          percentage: total ? ((segB.length / total) * 100).toFixed(1) : '0',
        },
        C: {
          total: segC.length,
          percentage: total ? ((segC.length / total) * 100).toFixed(1) : '0',
        },
      },
    };
  } catch (err) {
    console.error('[stats] Supabase error:', err);
    return null;
  }
}

/* ── Klaviyo stats ── */
async function getKlaviyoStats() {
  const apiKey = process.env.KLAVIYO_API_KEY;
  const listId = process.env.KLAVIYO_LIST_ID;

  if (!apiKey) return null;

  try {
    // Get total profiles count from list or all profiles
    let url = listId
      ? `https://a.klaviyo.com/api/lists/${listId}/profiles/?page[size]=100`
      : `https://a.klaviyo.com/api/profiles/?page[size]=100&sort=-created`;

    const allProfiles: any[] = [];
    let pageCount = 0;
    const maxPages = 10;

    while (url && pageCount < maxPages) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Klaviyo-API-Key ${apiKey}`,
          accept: 'application/json',
          revision: '2024-10-15',
        },
      });
      if (!res.ok) break;
      const json = await res.json();
      allProfiles.push(...(json.data || []));
      url = json.links?.next || '';
      pageCount++;
    }

    const total = allProfiles.length;
    const getSegment = (p: any) => p.attributes?.properties?.segment || '';
    const getSubReason = (p: any) => p.attributes?.properties?.sub_reason || '';

    const segA = allProfiles.filter((p) => getSegment(p) === 'A');
    const segB = allProfiles.filter((p) => getSegment(p) === 'B');
    const segC = allProfiles.filter((p) => getSegment(p) === 'C');

    return {
      total,
      segments: {
        A: {
          total: segA.length,
          percentage: total ? ((segA.length / total) * 100).toFixed(1) : '0',
          breakdown: {
            residue: segA.filter((p) => getSubReason(p) === 'residue').length,
            aftertaste: segA.filter((p) => getSubReason(p) === 'aftertaste').length,
            heaviness: segA.filter((p) => getSubReason(p) === 'heaviness').length,
            habit: segA.filter((p) => getSubReason(p) === 'habit').length,
            lapsed: segA.filter((p) => getSubReason(p) === 'lapsed').length,
          },
        },
        B: {
          total: segB.length,
          percentage: total ? ((segB.length / total) * 100).toFixed(1) : '0',
        },
        C: {
          total: segC.length,
          percentage: total ? ((segC.length / total) * 100).toFixed(1) : '0',
        },
      },
    };
  } catch (err) {
    console.error('[stats] Klaviyo error:', err);
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
   PARTICIPANTS — individual signup list
   ══════════════════════════════════════════════════════════════ */

async function getSupabaseParticipants() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ success: false, error: 'Supabase not configured', data: [], total: 0 });
  }

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

async function getKlaviyoParticipants() {
  const apiKey = process.env.KLAVIYO_API_KEY;
  const listId = process.env.KLAVIYO_LIST_ID;

  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'Klaviyo not configured', data: [], total: 0 });
  }

  let url = listId
    ? `https://a.klaviyo.com/api/lists/${listId}/profiles/?page[size]=100`
    : `https://a.klaviyo.com/api/profiles/?page[size]=100&sort=-created`;

  const allProfiles: any[] = [];
  let pageCount = 0;
  const maxPages = 10;

  while (url && pageCount < maxPages) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        accept: 'application/json',
        revision: '2024-10-15',
      },
    });
    if (!res.ok) break;
    const json = await res.json();
    allProfiles.push(...(json.data || []));
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

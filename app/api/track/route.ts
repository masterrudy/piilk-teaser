import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/* ─── IP 추출 ─── */
function getClientIP(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP;
  const xReal = request.headers.get('x-real-ip');
  if (xReal) return xReal;
  return '0.0.0.0';
}

/* ─── IP → Geo (ip-api.com free) ─── */
async function getGeoFromIP(ip: string): Promise<{ country: string | null; city: string | null }> {
  if (!ip || ip === '0.0.0.0' || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country: null, city: null };
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city`, {
      signal: AbortSignal.timeout(2000),
    });
    const data = await res.json();
    if (data.status === 'success') {
      return { country: data.country || null, city: data.city || null };
    }
  } catch {}
  return { country: null, city: null };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      event_name,
      event_data,
      session_id,
      visitor_id,
      device_type,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
    } = body;

    if (!event_name) {
      return NextResponse.json({ success: false, error: 'Missing event_name' }, { status: 400 });
    }

    // Server-side: IP + Geo
    const ip = getClientIP(request);
    const geo = await getGeoFromIP(ip);

const { error } = await supabase.from('piilk_events').insert({
  event_name,
  event_data: event_data || null,
  session_id: session_id || null,
  visitor_id: visitor_id || null,
  variant: body.variant || 'a',
  ip_address: ip,
  country: geo.country,
  city: geo.city,
  device_type: device_type || null,
  referrer: referrer || null,
  utm_source: utm_source || null,
  utm_medium: utm_medium || null,
  utm_campaign: utm_campaign || null,
});

    if (error) {
      console.error('Track insert error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Track API error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

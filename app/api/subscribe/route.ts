import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendNotifications } from '@/lib/notify';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KLAVIYO_API_KEY = process.env.KLAVIYO_PRIVATE_KEY || process.env.KLAVIYO_API_KEY;
const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID;

/* ─── IP → 위치 변환 (ip-api.com 무료, 서버사이드 전용) ─── */
async function getGeoFromIP(ip: string): Promise<{
  country: string | null;
  region: string | null;
  city: string | null;
}> {
  const defaultGeo = { country: null, region: null, city: null };

  // 로컬/프라이빗 IP는 스킵
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return defaultGeo;
  }

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city`, {
      signal: AbortSignal.timeout(3000), // 3초 타임아웃
    });
    const data = await res.json();

    if (data.status === 'success') {
      return {
        country: data.country || null,
        region: data.regionName || null,
        city: data.city || null,
      };
    }
  } catch (err) {
    console.error('Geo lookup failed:', err);
  }

  return defaultGeo;
}

/* ─── IP 추출 (Vercel/Cloudflare 등 프록시 대응) ─── */
function getClientIP(request: NextRequest): string {
  // Vercel
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  // Cloudflare
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP;

  // Vercel specific
  const xRealIP = request.headers.get('x-real-ip');
  if (xRealIP) return xRealIP;

  return '0.0.0.0';
}

export async function POST(request: NextRequest) {
  try {
    const { email, segment, answers, tracking } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Invalid email' },
        { status: 400 }
      );
    }

    const subReason = answers?.sub_reason || null;

    // ✅ IP 추출 + 위치 변환
    const ip = getClientIP(request);
    const geo = await getGeoFromIP(ip);

    // ✅ 프론트엔드에서 전송된 트래킹 데이터
    const deviceType = tracking?.device_type || null;
    const language = tracking?.language || null;
    const timezone = tracking?.timezone || null;
    const referrer = tracking?.referrer || null;
    const utmSource = tracking?.utm_source || null;
    const utmMedium = tracking?.utm_medium || null;
    const utmCampaign = tracking?.utm_campaign || null;

    // 1. Supabase에 저장
    const { error: dbError } = await supabase
      .from('piilk_subscribers')
      .upsert(
        {
          email: email.toLowerCase().trim(),
          segment,
          sub_reason: subReason,
          source: 'teaser',
          // ✅ 새 트래킹 컬럼들
          ip_address: ip,
          device_type: deviceType,
          language,
          timezone,
          referrer,
          country: geo.country,
          region: geo.region,
          city: geo.city,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      );

    if (dbError) {
      console.error('Supabase error:', dbError);
      throw dbError;
    }

    // 2. Klaviyo에 추가
    if (KLAVIYO_API_KEY && KLAVIYO_LIST_ID) {
      try {
        const emailLower = email.toLowerCase().trim();
        console.log('Klaviyo: Starting...', { email: emailLower, listId: KLAVIYO_LIST_ID });

        // Step 1: 프로필 생성/업데이트
        const profileResponse = await fetch('https://a.klaviyo.com/api/profiles/', {
          method: 'POST',
          headers: {
            'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
            'Content-Type': 'application/json',
            'revision': '2023-12-15',
          },
          body: JSON.stringify({
            data: {
              type: 'profile',
              attributes: {
                email: emailLower,
                properties: {
                  segment: segment,
                  sub_reason: subReason,
                  source: 'piilk_teaser',
                  // ✅ Klaviyo에도 트래킹 데이터 저장
                  device_type: deviceType,
                  language,
                  timezone,
                  country: geo.country,
                  region: geo.region,
                  city: geo.city,
                  utm_source: utmSource,
                  utm_medium: utmMedium,
                  utm_campaign: utmCampaign,
                },
              },
            },
          }),
        });

        let profileId: string | null = null;
        const profileResult = await profileResponse.text();
        console.log('Klaviyo profile response:', profileResponse.status, profileResult);

        if (profileResponse.status === 201) {
          const profileData = JSON.parse(profileResult);
          profileId = profileData.data?.id;
        } else if (profileResponse.status === 409) {
          const conflictData = JSON.parse(profileResult);
          profileId = conflictData.errors?.[0]?.meta?.duplicate_profile_id;
        }

        // Step 2: 리스트에 구독
        if (profileId) {
          const subscribeResponse = await fetch(
            `https://a.klaviyo.com/api/lists/${KLAVIYO_LIST_ID}/relationships/profiles/`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
                'Content-Type': 'application/json',
                'revision': '2023-12-15',
              },
              body: JSON.stringify({
                data: [
                  {
                    type: 'profile',
                    id: profileId,
                  },
                ],
              }),
            }
          );
          const subscribeResult = await subscribeResponse.text();
          console.log('Klaviyo subscribe response:', subscribeResponse.status, subscribeResult);
        } else {
          console.error('Klaviyo: Could not get profile ID');
        }
      } catch (klaviyoError) {
        console.error('Klaviyo error:', klaviyoError);
      }
    } else {
      console.log('Klaviyo skipped - missing credentials');
    }
// ── 알림 발송 ──
    const today = new Date().toISOString().slice(0, 10);
    const [{ count: todayCount }, { count: totalCount }] = await Promise.all([
      supabase.from('piilk_subscribers').select('*', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('piilk_subscribers').select('*', { count: 'exact', head: true }),
    ]);
    sendNotifications({
      email: email.toLowerCase().trim(),
      variant: 'main',
      utmSource,
      utmMedium,
      utmCampaign,
      city: geo.city,
      country: geo.country,
      device: deviceType,
      segment,
      todayCount: todayCount || 0,
      totalCount: totalCount || 0,
    }).catch(() => {});
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Subscribe error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to subscribe' },
      { status: 500 }
    );
  }
}

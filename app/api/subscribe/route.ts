import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KLAVIYO_API_KEY = process.env.KLAVIYO_PRIVATE_KEY || process.env.KLAVIYO_API_KEY;
const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID;

export async function POST(request: NextRequest) {
  try {
    const { email, segment, answers } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Invalid email' },
        { status: 400 }
      );
    }

    const subReason = answers?.sub_reason || null;

    // 1. Supabase에 저장
    const { error: dbError } = await supabase
      .from('piilk_subscribers')
      .upsert(
        {
          email: email.toLowerCase().trim(),
          segment,
          sub_reason: subReason,
          source: 'teaser',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      );

    if (dbError) {
      console.error('Supabase error:', dbError);
      throw dbError;
    }

    // 2. Klaviyo에 추가 (2단계: 프로필 생성 → 리스트 구독)
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
                },
              },
            },
          }),
        });

        let profileId: string | null = null;
        const profileResult = await profileResponse.text();
        console.log('Klaviyo profile response:', profileResponse.status, profileResult);

        if (profileResponse.status === 201) {
          // 새 프로필 생성됨
          const profileData = JSON.parse(profileResult);
          profileId = profileData.data?.id;
        } else if (profileResponse.status === 409) {
          // 이미 존재 - ID 추출
          const conflictData = JSON.parse(profileResult);
          profileId = conflictData.errors?.[0]?.meta?.duplicate_profile_id;
        }

        // Step 2: 리스트에 구독
        if (profileId) {
          const subscribeResponse = await fetch(`https://a.klaviyo.com/api/lists/${KLAVIYO_LIST_ID}/relationships/profiles/`, {
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
          });

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Subscribe error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to subscribe' },
      { status: 500 }
    );
  }
}

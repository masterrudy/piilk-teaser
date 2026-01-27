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

    // 2. Klaviyo에 추가
    if (KLAVIYO_API_KEY && KLAVIYO_LIST_ID) {
      try {
        await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
          method: 'POST',
          headers: {
            'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
            'Content-Type': 'application/json',
            'revision': '2024-02-15',
          },
          body: JSON.stringify({
            data: {
              type: 'profile-subscription-bulk-create-job',
              attributes: {
                profiles: {
                  data: [
                    {
                      type: 'profile',
                      attributes: {
                        email: email.toLowerCase().trim(),
                        properties: {
                          segment,
                          sub_reason: subReason,
                          source: 'piilk_teaser',
                        },
                      },
                    },
                  ],
                },
              },
              relationships: {
                list: {
                  data: {
                    type: 'list',
                    id: KLAVIYO_LIST_ID,
                  },
                },
              },
            },
          }),
        });
      } catch (klaviyoError) {
        console.error('Klaviyo error:', klaviyoError);
        // Klaviyo 실패해도 Supabase 성공했으면 OK
      }
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

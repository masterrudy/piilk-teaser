// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/dashboard/analytics/route.ts
// 📌 역할: 대시보드 퍼널 분석 API (variant 필터 지원)
// 📌 사용법: /api/dashboard/analytics?variant=type (퀴즈만)
//           /api/dashboard/analytics?variant=main (메인 티저만)
//           /api/dashboard/analytics (전체)
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/* ─── NYC timezone helper ─── */
function toNYC(dateStr: string): Date {
  return new Date(new Date(dateStr).toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function toNYCDateStr(dateStr: string): string {
  const d = toNYC(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ─── Quiz Type → Main Teaser 이벤트명 매핑 ─── */
const TYPE_EVENT_MAP: Record<string, string> = {
  quiz_start: 'step1_cta_click',
  quiz_complete: 'step2_answer',
  type_result: 'step2_answer',       // result 표시도 step2 완료로 간주
  email_submit: 'step4_submit',
  share_click: 'step3_email_focus',   // share를 funnel 중간 단계로 매핑
  declaration_tap: 'declaration_tap', // 그대로 유지
  referral_share: 'referral_share',   // 그대로 유지
};

function normalizeEventName(eventName: string, isTypeVariant: boolean): string {
  if (!isTypeVariant) return eventName;
  return TYPE_EVENT_MAP[eventName] || eventName;
}

export async function GET(request: NextRequest) {
  try {
    const variant = request.nextUrl.searchParams.get('variant') || undefined;
    const isTypeVariant = variant === 'type';

    // ✅ variant 필터를 Supabase 쿼리에 적용
    let query = supabase
      .from('piilk_events')
      .select('event_name, event_data, session_id, visitor_id, variant, country, city, device_type, utm_source, utm_medium, utm_campaign, created_at')
      .order('created_at', { ascending: true });

    if (variant === 'type') {
      query = query.eq('variant', 'type');
    } else if (variant === 'main') {
      query = query.or('variant.is.null,variant.neq.type');
    }

    const { data: events, error } = await query;

    if (error) {
      console.error('Analytics query error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!events || events.length === 0) {
      return NextResponse.json({
        success: true,
        variant: variant || 'all',
        funnel: { page_view: 0, step1_cta_click: 0, step2_answer: 0, step3_email_focus: 0, step3_reason_select: 0, step4_submit: 0 },
        daily: [],
        hourly: [],
        utmPerformance: [],
        segmentDistribution: {},
        reasonDistribution: {},
        totalVisitors: 0,
        totalSessions: 0,
        weekly: [],
        weekday: [],
        monthly: [],
        rawEvents: [],
      });
    }

    // ✅ 이벤트 이름 정규화 (Quiz Type일 때 매핑 적용)
    const normalizedEvents = events.map(ev => ({
      ...ev,
      event_name: normalizeEventName(ev.event_name, isTypeVariant),
    }));

    // ─── Funnel (unique sessions) ───
    const sessionsByEvent: Record<string, Set<string>> = {};
    const funnelEvents = ['page_view', 'step1_cta_click', 'step2_answer', 'step3_email_focus', 'step3_reason_select', 'step4_submit'];

    for (const e of funnelEvents) {
      sessionsByEvent[e] = new Set();
    }

    normalizedEvents.forEach(ev => {
      const sid = ev.session_id || ev.visitor_id || 'unknown';
      if (funnelEvents.includes(ev.event_name)) {
        sessionsByEvent[ev.event_name].add(sid);
      }
    });

    const funnel: Record<string, number> = {};
    for (const e of funnelEvents) {
      funnel[e] = sessionsByEvent[e].size;
    }

    // ✅ Quiz Type: quiz_start를 page_view로도 카운트 (퀴즈 시작 = 페이지 방문)
    if (isTypeVariant) {
      const quizStartSessions = new Set<string>();
      events.forEach(ev => {
        if (ev.event_name === 'quiz_start') {
          quizStartSessions.add(ev.session_id || ev.visitor_id || 'unknown');
        }
      });
      // page_view가 없으면 quiz_start를 page_view로 사용
      if (funnel['page_view'] === 0 && quizStartSessions.size > 0) {
        funnel['page_view'] = quizStartSessions.size;
      }
    }

    // ─── Daily event counts (NYC timezone) ───
    const dailyMap: Record<string, Record<string, number>> = {};
    normalizedEvents.forEach(ev => {
      const day = toNYCDateStr(ev.created_at);
      if (!day) return;
      if (!dailyMap[day]) dailyMap[day] = {};
      dailyMap[day][ev.event_name] = (dailyMap[day][ev.event_name] || 0) + 1;
    });

    // ✅ Quiz Type: daily에도 page_view 보정
    if (isTypeVariant) {
      const dailyQuizStart: Record<string, number> = {};
      events.forEach(ev => {
        if (ev.event_name === 'quiz_start') {
          const day = toNYCDateStr(ev.created_at);
          dailyQuizStart[day] = (dailyQuizStart[day] || 0) + 1;
        }
      });
      Object.entries(dailyQuizStart).forEach(([day, count]) => {
        if (!dailyMap[day]) dailyMap[day] = {};
        if (!dailyMap[day]['page_view']) {
          dailyMap[day]['page_view'] = count;
        }
      });
    }

    const daily = Object.entries(dailyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, counts]) => ({ date, ...counts }));

    // ─── Hourly distribution ───
    const hourMap: Record<number, number> = {};
    normalizedEvents.filter(ev => ev.event_name === 'step4_submit').forEach(ev => {
      const hour = toNYC(ev.created_at).getHours();
      hourMap[hour] = (hourMap[hour] || 0) + 1;
    });

    const hourly = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i.toString().padStart(2, '0')}:00`,
      count: hourMap[i] || 0,
    }));

    // ─── UTM Performance ───
    const utmMap: Record<string, { views: Set<string>; submits: Set<string> }> = {};
    normalizedEvents.forEach(ev => {
      const source = ev.utm_source || 'Direct';
      if (!utmMap[source]) utmMap[source] = { views: new Set(), submits: new Set() };
      const sid = ev.session_id || ev.visitor_id || 'unknown';
      if (ev.event_name === 'page_view' || ev.event_name === 'step1_cta_click') utmMap[source].views.add(sid);
      if (ev.event_name === 'step4_submit') utmMap[source].submits.add(sid);
    });

    const utmPerformance = Object.entries(utmMap)
      .map(([source, data]) => ({
        source,
        views: data.views.size,
        submits: data.submits.size,
        cvr: data.views.size > 0 ? ((data.submits.size / data.views.size) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.views - a.views);

    // ─── Segment distribution (Quiz Type: afterfeel_type 사용) ───
    const segmentDistribution: Record<string, number> = {};
    if (isTypeVariant) {
      // Quiz Type: quiz_complete/type_result의 afterfeel_type으로 분류
      events.filter(ev => ev.event_name === 'quiz_complete' || ev.event_name === 'type_result').forEach(ev => {
        const seg = ev.event_data?.afterfeel_type || 'Unknown';
        segmentDistribution[seg] = (segmentDistribution[seg] || 0) + 1;
      });
    } else {
      normalizedEvents.filter(ev => ev.event_name === 'step2_answer').forEach(ev => {
        const seg = ev.event_data?.segment || 'Unknown';
        segmentDistribution[seg] = (segmentDistribution[seg] || 0) + 1;
      });
    }

    // ─── Reason distribution (Quiz Type: afterfeel_type 사용) ───
    const reasonDistribution: Record<string, number> = {};
    if (isTypeVariant) {
      events.filter(ev => ev.event_name === 'email_submit').forEach(ev => {
        const reason = ev.event_data?.afterfeel_type || 'Unknown';
        reasonDistribution[reason] = (reasonDistribution[reason] || 0) + 1;
      });
    } else {
      normalizedEvents.filter(ev => ev.event_name === 'step3_reason_select').forEach(ev => {
        const reason = ev.event_data?.reason || 'Unknown';
        reasonDistribution[reason] = (reasonDistribution[reason] || 0) + 1;
      });
    }

    // ─── Unique visitors & sessions ───
    const uniqueVisitors = new Set(events.map(ev => ev.visitor_id).filter(Boolean));
    const uniqueSessions = new Set(events.map(ev => ev.session_id).filter(Boolean));

    // ─── Weekly ───
    const weeklyMap: Record<string, { views: number; submits: number }> = {};
    normalizedEvents.forEach(ev => {
      const d = toNYC(ev.created_at);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      const key = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      if (!weeklyMap[key]) weeklyMap[key] = { views: 0, submits: 0 };
      if (ev.event_name === 'page_view' || ev.event_name === 'step1_cta_click') weeklyMap[key].views++;
      if (ev.event_name === 'step4_submit') weeklyMap[key].submits++;
    });
    const weekly = Object.entries(weeklyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, data]) => ({ week, ...data }));

    // ─── Weekday ───
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayMap: Record<number, { views: number; submits: number }> = {};
    for (let i = 0; i < 7; i++) weekdayMap[i] = { views: 0, submits: 0 };
    normalizedEvents.forEach(ev => {
      const dow = toNYC(ev.created_at).getDay();
      if (ev.event_name === 'page_view' || ev.event_name === 'step1_cta_click') weekdayMap[dow].views++;
      if (ev.event_name === 'step4_submit') weekdayMap[dow].submits++;
    });
    const weekday = Array.from({ length: 7 }, (_, i) => ({
      day: weekdayNames[i],
      views: weekdayMap[i].views,
      submits: weekdayMap[i].submits,
    }));

    // ─── Monthly ───
    const monthlyMap: Record<string, { views: number; submits: number }> = {};
    normalizedEvents.forEach(ev => {
      const d = toNYC(ev.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap[key]) monthlyMap[key] = { views: 0, submits: 0 };
      if (ev.event_name === 'page_view' || ev.event_name === 'step1_cta_click') monthlyMap[key].views++;
      if (ev.event_name === 'step4_submit') monthlyMap[key].submits++;
    });
    const monthly = Object.entries(monthlyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({ month, ...data }));

    return NextResponse.json({
      success: true,
      variant: variant || 'all',
      funnel,
      daily,
      hourly,
      utmPerformance,
      segmentDistribution,
      reasonDistribution,
      totalVisitors: uniqueVisitors.size,
      totalSessions: uniqueSessions.size,
      weekly,
      weekday,
      monthly,
      rawEvents: normalizedEvents.map(ev => ({
        n: ev.event_name,
        d: toNYCDateStr(ev.created_at),
        h: toNYC(ev.created_at).getHours(),
        s: ev.session_id || ev.visitor_id || '',
        u: ev.utm_source || '',
        ed: ev.event_data || null,
      })),
    });
  } catch (err: any) {
    console.error('Analytics API error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

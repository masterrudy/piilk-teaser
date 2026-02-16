// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/api/dashboard/analytics/route.ts
// 📌 역할: 대시보드 퍼널 분석 API (variant 필터 지원)
// 📌 추가: UTM 소스별 방문자/이벤트 상세 + Today/Total 분리
// 📌 페이지네이션: 1,000행씩 반복 fetch → 전체 데이터 수집
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PAGE_SIZE = 1000;

/* ─── NYC timezone helpers (Intl-based, server-safe) ─── */
const nycDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
});

const nycHourFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric', hour12: false,
});

const nycWeekdayFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
});

const nycYearFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
});

const nycMonthFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'numeric',
});

function toNYCDateStr(dateStr: string): string {
  return nycDateFmt.format(new Date(dateStr));
}

function toNYCHour(dateStr: string): number {
  const h = nycHourFmt.format(new Date(dateStr));
  return parseInt(h, 10) % 24;
}

function toNYCDay(dateStr: string): number {
  const dayStr = nycWeekdayFmt.format(new Date(dateStr));
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return dayMap[dayStr] ?? 0;
}

function toNYCYear(dateStr: string): number {
  return parseInt(nycYearFmt.format(new Date(dateStr)), 10);
}

function toNYCMonth(dateStr: string): number {
  return parseInt(nycMonthFmt.format(new Date(dateStr)), 10);
}

function toNYCWeekKey(dateStr: string): string {
  const nycDate = toNYCDateStr(dateStr);
  const [y, m, day] = nycDate.split('-').map(Number);
  const jan1 = new Date(y, 0, 1);
  const nycD = new Date(y, m - 1, day);
  const weekNum = Math.ceil(((nycD.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${y}-W${String(weekNum).padStart(2, '0')}`;
}

function toNYCMonthKey(dateStr: string): string {
  const year = toNYCYear(dateStr);
  const month = toNYCMonth(dateStr);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getTodayNYC(): string {
  return nycDateFmt.format(new Date());
}

/* ─── Quiz Type → Main Teaser 이벤트명 매핑 ─── */
const TYPE_EVENT_MAP: Record<string, string> = {
  quiz_start: 'step1_cta_click',
  quiz_complete: 'step2_answer',
  type_result: 'step2_answer',
  email_submit: 'step4_submit',
  share_click: 'step3_email_focus',
  declaration_tap: 'declaration_tap',
  referral_share: 'referral_share',
};

function normalizeEventName(eventName: string, isTypeVariant: boolean): string {
  if (!isTypeVariant) return eventName;
  return TYPE_EVENT_MAP[eventName] || eventName;
}

/* ─── 페이지네이션 헬퍼: 1,000행씩 전체 fetch ─── */
async function fetchAllEvents(variant?: string) {
  const allEvents: any[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('piilk_events')
      .select('event_name, event_data, session_id, visitor_id, variant, country, city, device_type, utm_source, utm_medium, utm_campaign, created_at');

    // 필터 적용
    if (variant === 'type') {
      query = query.eq('variant', 'type');
    } else if (variant === 'main') {
      query = query.or('variant.is.null,variant.neq.type');
    }

    // 정렬 + 범위
    query = query.order('created_at', { ascending: true }).range(from, from + PAGE_SIZE - 1);

    const { data, error } = await query;

    if (error) throw error;
    if (!data || data.length === 0) break;

    allEvents.push(...data);

    // 이번 페이지가 PAGE_SIZE보다 적으면 마지막 페이지
    if (data.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  return allEvents;
}

/* ─── UTM 소스별 상세 통계 생성 ─── */
function buildUtmSourceStats(events: any[], normalizedEvents: any[], todayStr: string) {
  // 전체(Total) UTM 통계
  const utmTotal: Record<string, {
    visitors: Set<string>;
    sessions: Set<string>;
    events: number;
    page_views: number;
    submits: Set<string>;
  }> = {};

  // 오늘(Today) UTM 통계
  const utmToday: Record<string, {
    visitors: Set<string>;
    sessions: Set<string>;
    events: number;
    page_views: number;
    submits: Set<string>;
  }> = {};

  const initUtm = () => ({
    visitors: new Set<string>(),
    sessions: new Set<string>(),
    events: 0,
    page_views: 0,
    submits: new Set<string>(),
  });

  normalizedEvents.forEach((ev, idx) => {
    const source = events[idx].utm_source || 'Direct';
    const vid = ev.visitor_id || 'unknown';
    const sid = ev.session_id || ev.visitor_id || 'unknown';
    const day = toNYCDateStr(ev.created_at);

    // Total
    if (!utmTotal[source]) utmTotal[source] = initUtm();
    utmTotal[source].visitors.add(vid);
    utmTotal[source].sessions.add(sid);
    utmTotal[source].events++;
    if (ev.event_name === 'page_view') utmTotal[source].page_views++;
    if (ev.event_name === 'step4_submit') utmTotal[source].submits.add(sid);

    // Today
    if (day === todayStr) {
      if (!utmToday[source]) utmToday[source] = initUtm();
      utmToday[source].visitors.add(vid);
      utmToday[source].sessions.add(sid);
      utmToday[source].events++;
      if (ev.event_name === 'page_view') utmToday[source].page_views++;
      if (ev.event_name === 'step4_submit') utmToday[source].submits.add(sid);
    }
  });

  const formatUtmMap = (map: typeof utmTotal) =>
    Object.entries(map)
      .map(([source, data]) => ({
        source,
        visitors: data.visitors.size,
        sessions: data.sessions.size,
        events: data.events,
        page_views: data.page_views,
        submits: data.submits.size,
        cvr: data.visitors.size > 0 ? ((data.submits.size / data.visitors.size) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.visitors - a.visitors);

  return {
    total: formatUtmMap(utmTotal),
    today: formatUtmMap(utmToday),
  };
}

/* ─── 방문자 통계 (Today / Total) ─── */
function buildVisitorStats(events: any[], normalizedEvents: any[], todayStr: string) {
  const totalVisitors = new Set<string>();
  const totalSessions = new Set<string>();
  const todayVisitors = new Set<string>();
  const todaySessions = new Set<string>();
  let totalEvents = 0;
  let todayEvents = 0;

  events.forEach(ev => {
    const vid = ev.visitor_id || 'unknown';
    const sid = ev.session_id || ev.visitor_id || 'unknown';
    const day = toNYCDateStr(ev.created_at);

    totalVisitors.add(vid);
    totalSessions.add(sid);
    totalEvents++;

    if (day === todayStr) {
      todayVisitors.add(vid);
      todaySessions.add(sid);
      todayEvents++;
    }
  });

  return {
    total: {
      visitors: totalVisitors.size,
      sessions: totalSessions.size,
      events: totalEvents,
    },
    today: {
      visitors: todayVisitors.size,
      sessions: todaySessions.size,
      events: todayEvents,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const variant = request.nextUrl.searchParams.get('variant') || undefined;
    const isTypeVariant = variant === 'type';
    const todayStr = getTodayNYC();

    // ✅ 페이지네이션으로 전체 이벤트 가져오기
    const events = await fetchAllEvents(variant);

    if (!events || events.length === 0) {
      return NextResponse.json({
        success: true,
        variant: variant || 'all',
        funnel: { page_view: 0, step1_cta_click: 0, step2_answer: 0, step3_email_focus: 0, step3_reason_select: 0, step4_submit: 0 },
        daily: [],
        hourly: [],
        utmPerformance: [],
        utmSourceStats: { total: [], today: [] },
        visitorStats: { total: { visitors: 0, sessions: 0, events: 0 }, today: { visitors: 0, sessions: 0, events: 0 } },
        segmentDistribution: {},
        reasonDistribution: {},
        totalVisitors: 0,
        totalSessions: 0,
        weekly: [],
        weekday: [],
        monthly: [],
        rawEvents: [],
        _totalFetched: 0,
        _todayNYC: todayStr,
      });
    }

    // ✅ 이벤트 이름 정규화
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

    // ✅ Quiz Type: quiz_start를 page_view로도 카운트
    if (isTypeVariant) {
      const quizStartSessions = new Set<string>();
      events.forEach(ev => {
        if (ev.event_name === 'quiz_start') {
          quizStartSessions.add(ev.session_id || ev.visitor_id || 'unknown');
        }
      });
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
      const hour = toNYCHour(ev.created_at);
      hourMap[hour] = (hourMap[hour] || 0) + 1;
    });

    const hourly = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i.toString().padStart(2, '0')}:00`,
      count: hourMap[i] || 0,
    }));

    // ─── UTM Performance (기존 호환) ───
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

    // ✅ NEW: UTM 소스별 상세 통계 (Today + Total)
    const utmSourceStats = buildUtmSourceStats(events, normalizedEvents, todayStr);

    // ✅ NEW: 방문자 통계 (Today + Total)
    const visitorStats = buildVisitorStats(events, normalizedEvents, todayStr);

    // ─── Segment distribution ───
    const segmentDistribution: Record<string, number> = {};
    if (isTypeVariant) {
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

    // ─── Reason distribution ───
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
      const key = toNYCWeekKey(ev.created_at);
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
      const dow = toNYCDay(ev.created_at);
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
      const key = toNYCMonthKey(ev.created_at);
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
      utmSourceStats,
      visitorStats,
      segmentDistribution,
      reasonDistribution,
      totalVisitors: uniqueVisitors.size,
      totalSessions: uniqueSessions.size,
      weekly,
      weekday,
      monthly,
      _totalFetched: events.length,
      _todayNYC: todayStr,
      rawEvents: normalizedEvents.map(ev => ({
        n: ev.event_name,
        d: toNYCDateStr(ev.created_at),
        h: toNYCHour(ev.created_at),
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

import { NextResponse } from 'next/server';
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

export async function GET() {
  try {
    const { data: events, error } = await supabase
      .from('piilk_events')
      .select('event_name, event_data, session_id, visitor_id, country, city, device_type, utm_source, utm_medium, utm_campaign, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Analytics query error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!events || events.length === 0) {
      return NextResponse.json({
        success: true,
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
      });
    }

    // ─── Funnel (unique sessions) ───
    const sessionsByEvent: Record<string, Set<string>> = {};
    const funnelEvents = ['page_view', 'step1_cta_click', 'step2_answer', 'step3_email_focus', 'step3_reason_select', 'step4_submit'];

    for (const e of funnelEvents) {
      sessionsByEvent[e] = new Set();
    }

    events.forEach(ev => {
      const sid = ev.session_id || ev.visitor_id || 'unknown';
      if (funnelEvents.includes(ev.event_name)) {
        sessionsByEvent[ev.event_name].add(sid);
      }
    });

    const funnel: Record<string, number> = {};
    for (const e of funnelEvents) {
      funnel[e] = sessionsByEvent[e].size;
    }

    // ─── Daily event counts (NYC timezone) ───
    const dailyMap: Record<string, Record<string, number>> = {};
    events.forEach(ev => {
      const day = toNYCDateStr(ev.created_at);
      if (!day) return;
      if (!dailyMap[day]) dailyMap[day] = {};
      dailyMap[day][ev.event_name] = (dailyMap[day][ev.event_name] || 0) + 1;
    });

    const daily = Object.entries(dailyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, counts]) => ({ date, ...counts }));

    // ─── Hourly distribution (NYC timezone, for step4_submit) ───
    const hourMap: Record<number, number> = {};
    events.filter(ev => ev.event_name === 'step4_submit').forEach(ev => {
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
    events.forEach(ev => {
      const source = ev.utm_source || 'Direct';
      if (!utmMap[source]) utmMap[source] = { views: new Set(), submits: new Set() };
      const sid = ev.session_id || ev.visitor_id || 'unknown';
      if (ev.event_name === 'page_view') utmMap[source].views.add(sid);
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

    // ─── Segment distribution from step2_answer ───
    const segmentDistribution: Record<string, number> = {};
    events.filter(ev => ev.event_name === 'step2_answer').forEach(ev => {
      const seg = ev.event_data?.segment || 'Unknown';
      segmentDistribution[seg] = (segmentDistribution[seg] || 0) + 1;
    });

    // ─── Reason distribution from step3_reason_select ───
    const reasonDistribution: Record<string, number> = {};
    events.filter(ev => ev.event_name === 'step3_reason_select').forEach(ev => {
      const reason = ev.event_data?.reason || 'Unknown';
      reasonDistribution[reason] = (reasonDistribution[reason] || 0) + 1;
    });

    // ─── Unique visitors & sessions ───
    const uniqueVisitors = new Set(events.map(ev => ev.visitor_id).filter(Boolean));
    const uniqueSessions = new Set(events.map(ev => ev.session_id).filter(Boolean));

    // ─── Weekly breakdown (NYC timezone) ───
    const weeklyMap: Record<string, { views: number; submits: number }> = {};
    events.forEach(ev => {
      const d = toNYC(ev.created_at);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      const key = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      if (!weeklyMap[key]) weeklyMap[key] = { views: 0, submits: 0 };
      if (ev.event_name === 'page_view') weeklyMap[key].views++;
      if (ev.event_name === 'step4_submit') weeklyMap[key].submits++;
    });
    const weekly = Object.entries(weeklyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, data]) => ({ week, ...data }));

    // ─── Weekday breakdown (NYC timezone) ───
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayMap: Record<number, { views: number; submits: number }> = {};
    for (let i = 0; i < 7; i++) weekdayMap[i] = { views: 0, submits: 0 };
    events.forEach(ev => {
      const dow = toNYC(ev.created_at).getDay();
      if (ev.event_name === 'page_view') weekdayMap[dow].views++;
      if (ev.event_name === 'step4_submit') weekdayMap[dow].submits++;
    });
    const weekday = Array.from({ length: 7 }, (_, i) => ({
      day: weekdayNames[i],
      views: weekdayMap[i].views,
      submits: weekdayMap[i].submits,
    }));

    // ─── Monthly breakdown (NYC timezone) ───
    const monthlyMap: Record<string, { views: number; submits: number }> = {};
    events.forEach(ev => {
      const d = toNYC(ev.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap[key]) monthlyMap[key] = { views: 0, submits: 0 };
      if (ev.event_name === 'page_view') monthlyMap[key].views++;
      if (ev.event_name === 'step4_submit') monthlyMap[key].submits++;
    });
    const monthly = Object.entries(monthlyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({ month, ...data }));

    return NextResponse.json({
      success: true,
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
    });
  } catch (err: any) {
    console.error('Analytics API error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

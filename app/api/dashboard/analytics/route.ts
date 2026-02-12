import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Fetch all events
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
        funnel: { page_view: 0, step1_cta_click: 0, step2_answer: 0, step3_email_focus: 0, step4_submit: 0 },
        daily: [],
        hourly: [],
        utmPerformance: [],
        segmentDistribution: {},
        reasonDistribution: {},
        totalVisitors: 0,
        totalSessions: 0,
      });
    }

    // ─── Funnel (unique sessions) ───
    const sessionsByEvent: Record<string, Set<string>> = {};
    const funnelEvents = ['page_view', 'step1_cta_click', 'step2_answer', 'step3_email_focus', 'step4_submit'];

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

    // ─── Daily event counts ───
    const dailyMap: Record<string, Record<string, number>> = {};
    events.forEach(ev => {
      const day = ev.created_at?.slice(0, 10);
      if (!day) return;
      if (!dailyMap[day]) dailyMap[day] = {};
      dailyMap[day][ev.event_name] = (dailyMap[day][ev.event_name] || 0) + 1;
    });

    const daily = Object.entries(dailyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, counts]) => ({ date, ...counts }));

    // ─── Hourly distribution (for step4_submit) ───
    const hourMap: Record<number, number> = {};
    events.filter(ev => ev.event_name === 'step4_submit').forEach(ev => {
      const hour = new Date(ev.created_at).getHours();
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
    });
  } catch (err: any) {
    console.error('Analytics API error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

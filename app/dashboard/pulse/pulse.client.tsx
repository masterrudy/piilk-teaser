'use client';

import { useEffect, useMemo, useState } from 'react';

type DayStat = { signups: number; visitors: number; submits: number; cvr: string };
type Insights = { peakHourLabel: string; topCityLabel: string; topAdLabel: string };

const TZ = 'America/New_York';

const getNYCDateStr = (offset = 0) => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  now.setDate(now.getDate() + offset);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const getNYCHour = (iso: string) => {
  if (!iso) return 0;
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).formatToParts(d);
  const hourPart = parts.find(p => p.type === 'hour')?.value;
  return hourPart ? parseInt(hourPart, 10) : 0;
};

function computeDayStat(rawEvents: any[], dayStr: string): DayStat {
  const visitorSet = new Set<string>();
  const submitSessionSet = new Set<string>();

  for (const ev of rawEvents || []) {
    const d = String(ev.d || ev.date || '').slice(0, 10);
    if (d !== dayStr) continue;

    if (ev.n === 'page_view') {
      const vid = String(ev.v || ev.visitor_id || ev.s || ev.session_id || '');
      if (vid) visitorSet.add(vid);
    }
    if (ev.n === 'step4_submit' || ev.n === 'submit') {
      const sid = String(ev.s || ev.session_id || ev.v || ev.visitor_id || '');
      if (sid) submitSessionSet.add(sid);
    }
  }

  const visitors = visitorSet.size;
  const submits = submitSessionSet.size;
  const cvr = visitors > 0 ? ((submits / visitors) * 100).toFixed(2) : '0.00';

  return { signups: submits, visitors, submits, cvr };
}

function computeInsights(rawEvents: any[], dayStr: string): Insights {
  const hourCount = new Map<number, number>();
  const cityCount = new Map<string, number>();
  const adCount = new Map<string, number>();

  for (const ev of rawEvents || []) {
    const d = String(ev.d || ev.date || '').slice(0, 10);
    if (d !== dayStr) continue;

    const isSubmit = ev.n === 'step4_submit' || ev.n === 'submit';
    if (!isSubmit) continue;

    const h = getNYCHour(ev.t || ev.ts || ev.timestamp || ev.created_at || '');
    hourCount.set(h, (hourCount.get(h) || 0) + 1);

    const city = String(ev.city || ev.geo?.city || ev.properties?.city || '').trim();
    if (city) cityCount.set(city, (cityCount.get(city) || 0) + 1);

    const src = String(ev.utm_source || ev.utm?.source || '').trim();
    const camp = String(ev.utm_campaign || ev.utm?.campaign || '').trim();
    const cont = String(ev.utm_content || ev.utm?.content || '').trim();
    const adText = [src, camp, cont].filter(Boolean).join(' | ');
    if (adText) adCount.set(adText, (adCount.get(adText) || 0) + 1);
  }

  const pickTop = <T,>(m: Map<T, number>) => {
    let topKey: T | null = null;
    let topVal = -1;
    for (const [k, v] of m.entries()) {
      if (v > topVal) { topVal = v; topKey = k; }
    }
    return topKey;
  };

  const peakHour = pickTop(hourCount);
  const topCity = pickTop(cityCount);
  const topAd = pickTop(adCount);

  return {
    peakHourLabel: peakHour === null ? '—' : `${peakHour}시`,
    topCityLabel: topCity ? String(topCity) : '—',
    topAdLabel: topAd ? String(topAd) : '—',
  };
}

export default function PulseClient() {
  const goal = 3000;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  // ✅ 여기 API는 Master Rudy님 프로젝트에 맞춰 조정
  // - participants(총합)은 /api/dashboard/stats?variant=all 의 supabase.total을 쓰는 구조가 가장 안전합니다.
  // - 방문자/이벤트는 별도 analytics endpoint(있다면)로 rawEvents를 받는 것을 권장합니다.
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/dashboard/stats?variant=all', { cache: 'no-store' });
        const json = await res.json();
        setStats(json);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const totalParticipants = Number(stats?.supabase?.total || 0);

  // ⚠️ rawEvents는 현재 API 응답에 없을 수 있습니다.
  // 없으면 오늘/어제 visitors/cvr/insights는 “—”로 떨어집니다.
  const rawEvents = (stats?.analytics?.rawEvents || []) as any[];

  const todayStr = useMemo(() => getNYCDateStr(0), []);
  const yesterdayStr = useMemo(() => getNYCDateStr(-1), []);

  const today = useMemo(() => computeDayStat(rawEvents, todayStr), [rawEvents, todayStr]);
  const yday = useMemo(() => computeDayStat(rawEvents, yesterdayStr), [rawEvents, yesterdayStr]);
  const todayInsights = useMemo(() => computeInsights(rawEvents, todayStr), [rawEvents, todayStr]);

  const progressPct = goal > 0 ? Math.min((totalParticipants / goal) * 100, 100) : 0;

  return (
    <main className="min-h-dvh bg-black text-white px-4 py-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.7)]" />
          <p className="text-xs tracking-[0.28em] text-zinc-300 font-semibold">PIILK • PULSE</p>
        </div>
        <div className="text-[11px] text-zinc-500 font-mono">
          {loading ? 'updating…' : `updated ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`}
        </div>
      </div>

      <section className="mt-5 rounded-[28px] border border-zinc-800 bg-gradient-to-br from-zinc-950 via-black to-zinc-950 p-5 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.35em] text-zinc-500 font-semibold">PARTICIPANTS</p>
            <p className="mt-2 text-[72px] leading-[0.9] font-black tracking-tight">
              {totalParticipants.toLocaleString()}
            </p>

            <div className="mt-4 space-y-2 text-[12px] text-zinc-300">
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500 tracking-[0.18em]">YESTERDAY</span>
                <span className="font-semibold text-purple-300">
                  +{yday.signups.toLocaleString()}
                  <span className="text-zinc-500 font-normal"> ({yday.visitors.toLocaleString()} / {yday.cvr}%)</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500 tracking-[0.18em]">TODAY</span>
                <span className="font-semibold text-emerald-300">
                  +{today.signups.toLocaleString()}
                  <span className="text-zinc-500 font-normal"> ({today.visitors.toLocaleString()} / {today.cvr}%)</span>
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500 tracking-[0.18em]">PEAK / CITY</span>
                <span className="font-semibold truncate">
                  {todayInsights.peakHourLabel}
                  <span className="text-zinc-500 font-normal"> • </span>
                  {todayInsights.topCityLabel}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500 tracking-[0.18em]">TOP AD</span>
                <span className="font-semibold text-zinc-200 text-right line-clamp-1 max-w-[66%]">
                  {todayInsights.topAdLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-[11px] tracking-[0.35em] text-zinc-500 font-semibold">PROGRESS</p>
            <p className="mt-2 text-[56px] leading-[0.95] font-black text-emerald-300 drop-shadow-[0_0_28px_rgba(52,211,153,0.15)]">
              {progressPct.toFixed(1)}%
            </p>
            <p className="mt-1 text-xs text-zinc-500 font-mono">
              {totalParticipants.toLocaleString()} / {goal.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="h-2 w-full rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.4)]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
            <span className="tracking-[0.24em]">TENSION MODE</span>
            <span className="font-mono">today {today.cvr}% • yday {yday.cvr}%</span>
          </div>
        </div>
      </section>
    </main>
  );
}

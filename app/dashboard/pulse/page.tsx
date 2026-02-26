const TZ = 'America/New_York';

const getNYCDateStr = (offset = 0) => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  now.setDate(now.getDate() + offset);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const getNYCHour = (iso: string) => {
  // iso가 없으면 0
  if (!iso) return 0;
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).formatToParts(d);
  const hourPart = parts.find(p => p.type === 'hour')?.value;
  return hourPart ? parseInt(hourPart, 10) : 0;
};

type DayStat = { signups: number; visitors: number; submits: number; cvr: string };

function computeDayStat(rawEvents: any[], dayStr: string): DayStat {
  const visitorSet = new Set<string>();
  const submitSessionSet = new Set<string>();

  for (const ev of rawEvents || []) {
    const d = String(ev.d || ev.date || '').slice(0, 10);
    if (d !== dayStr) continue;

    if (ev.n === 'page_view') {
      const vid = String(ev.v || ev.s || '');
      if (vid) visitorSet.add(vid);
    }
    if (ev.n === 'step4_submit') {
      const sid = String(ev.s || '');
      if (sid) submitSessionSet.add(sid);
    }
  }

  const visitors = visitorSet.size;
  const submits = submitSessionSet.size;
  const cvr = visitors > 0 ? ((submits / visitors) * 100).toFixed(2) : '0.00';

  // signups는 “submits”로 일단 동일하게 잡는 것이 가장 안전합니다(중복 방지됨).
  return { signups: submits, visitors, submits, cvr };
}

type Insights = {
  peakHourLabel: string;        // "21시"
  topCityLabel: string;         // "Los Angeles"
  topAdLabel: string;           // "Meta | prospecting | Feb"
};

function computeInsights(rawEvents: any[], dayStr: string): Insights {
  const hourCount = new Map<number, number>();
  const cityCount = new Map<string, number>();
  const adCount = new Map<string, number>();

  for (const ev of rawEvents || []) {
    const d = String(ev.d || ev.date || '').slice(0, 10);
    if (d !== dayStr) continue;

    // “참여(체크)” 기준: submit 이벤트를 우선 기준으로 집계
    if (ev.n === 'step4_submit') {
      const h = getNYCHour(ev.t || ev.ts || ev.timestamp || ev.created_at || '');
      hourCount.set(h, (hourCount.get(h) || 0) + 1);

      // city: ev.city / ev.geo.city / ev.properties?.city 등 프로젝트 구조에 맞춰 조정
      const city = String(ev.city || ev.geo?.city || ev.properties?.city || '').trim();
      if (city) cityCount.set(city, (cityCount.get(city) || 0) + 1);

      // ad 텍스트: utm_campaign / utm_source / utm_content 조합 추천
      const src = String(ev.utm_source || ev.utm?.source || '').trim();
      const camp = String(ev.utm_campaign || ev.utm?.campaign || '').trim();
      const cont = String(ev.utm_content || ev.utm?.content || '').trim();
      const adText = [src, camp, cont].filter(Boolean).join(' | ');
      if (adText) adCount.set(adText, (adCount.get(adText) || 0) + 1);
    }
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
    peakHourLabel: (peakHour === null ? '—' : `${peakHour}시`),
    topCityLabel: (topCity ? String(topCity) : '—'),
    topAdLabel: (topAd ? String(topAd) : '—'),
  };
}

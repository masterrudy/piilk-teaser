// app/api/dashboard/meta-insights/route.ts
// ─────────────────────────────────────────────────────────────
// Meta Marketing API — Insights 조회
// .env 필요:
//   META_ACCESS_TOKEN=EAAxxxxxxxx
//   META_AD_ACCOUNT_ID=act_xxxxxxxxxx
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';

const BASE = 'https://graph.facebook.com/v19.0';
const TOKEN = process.env.META_ACCESS_TOKEN || '';
const ACCOUNT = process.env.META_AD_ACCOUNT_ID || ''; // act_xxxxxxxxxx

// ─── 공통 fetch helper ───
async function metaFetch(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, access_token: TOKEN });
  const url = `${BASE}${path}?${qs}`;
  const res = await fetch(url, { next: { revalidate: 300 } }); // 5분 캐시
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Meta API error ${res.status}`);
  }
  return res.json();
}

// ─── 날짜 범위 계산 (NYC 기준) ───
function getDateRange(preset: string, from?: string, to?: string): { since: string; until: string } {
  const nowNYC = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = fmt(nowNYC);

  if (preset === 'custom' && from && to) return { since: from, until: to };

  switch (preset) {
    case 'today':     return { since: today, until: today };
    case 'yesterday': {
      const y = new Date(nowNYC); y.setDate(y.getDate() - 1);
      return { since: fmt(y), until: fmt(y) };
    }
    case 'last_7d': {
      const s = new Date(nowNYC); s.setDate(s.getDate() - 6);
      return { since: fmt(s), until: today };
    }
    case 'last_14d': {
      const s = new Date(nowNYC); s.setDate(s.getDate() - 13);
      return { since: fmt(s), until: today };
    }
    case 'this_month': {
      return { since: `${nowNYC.getFullYear()}-${pad(nowNYC.getMonth() + 1)}-01`, until: today };
    }
    case 'last_30d':
    default: {
      const s = new Date(nowNYC); s.setDate(s.getDate() - 29);
      return { since: fmt(s), until: today };
    }
  }
}

export async function GET(req: NextRequest) {
  if (!TOKEN || !ACCOUNT) {
    return NextResponse.json(
      { success: false, error: 'META_ACCESS_TOKEN 또는 META_AD_ACCOUNT_ID 환경변수가 없습니다.' },
      { status: 500 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const preset  = sp.get('preset')  || 'last_7d';
  const dateFrom = sp.get('from')   || '';
  const dateTo   = sp.get('to')     || '';
  const level    = (sp.get('level') || 'ad') as 'campaign' | 'adset' | 'ad';

  const { since, until } = getDateRange(preset, dateFrom, dateTo);

  try {
    // ─── 1. Summary (계정 전체) ───
    const summaryFields = [
      'spend', 'impressions', 'reach', 'clicks',
      'ctr', 'cpc', 'cpm',
      'actions',           // 결과 (Lead, PageView 등)
      'cost_per_action',   // CPL
      'unique_clicks',
      'frequency',
    ].join(',');

    const summaryRaw = await metaFetch(`/${ACCOUNT}/insights`, {
      fields: summaryFields,
      time_range: JSON.stringify({ since, until }),
      level: 'account',
    });

    const summary = summaryRaw?.data?.[0] || {};

    // Lead 액션 추출 helper
    const extractAction = (data: any, actionType: string): number => {
      const actions: any[] = data?.actions || [];
      const found = actions.find((a: any) => a.action_type === actionType);
      return found ? Number(found.value) : 0;
    };

    const extractCPA = (data: any, actionType: string): number => {
      const cpa: any[] = data?.cost_per_action || [];
      const found = cpa.find((a: any) => a.action_type === actionType);
      return found ? Number(found.value) : 0;
    };

    const summaryOut = {
      spend:       Number(summary.spend       || 0),
      impressions: Number(summary.impressions || 0),
      reach:       Number(summary.reach       || 0),
      clicks:      Number(summary.clicks      || 0),
      uniqueClicks:Number(summary.unique_clicks || 0),
      ctr:         Number(summary.ctr         || 0),
      cpc:         Number(summary.cpc         || 0),
      cpm:         Number(summary.cpm         || 0),
      frequency:   Number(summary.frequency   || 0),
      leads:       extractAction(summary, 'lead'),
      pageViews:   extractAction(summary, 'landing_page_view'),
      cpl:         extractCPA(summary, 'lead'),
      cpPageView:  extractCPA(summary, 'landing_page_view'),
    };

    // ─── 2. 캠페인별 breakdown ───
    const campaignFields = [
      'campaign_name', 'campaign_id', 'status',
      'spend', 'impressions', 'reach', 'clicks',
      'ctr', 'cpc', 'cpm',
      'actions', 'cost_per_action',
    ].join(',');

    const campaignRaw = await metaFetch(`/${ACCOUNT}/insights`, {
      fields: campaignFields,
      time_range: JSON.stringify({ since, until }),
      level: 'campaign',
      limit: '50',
    });

    const campaigns = (campaignRaw?.data || []).map((c: any) => ({
      campaignId:   c.campaign_id,
      campaignName: c.campaign_name,
      spend:        Number(c.spend        || 0),
      impressions:  Number(c.impressions  || 0),
      reach:        Number(c.reach        || 0),
      clicks:       Number(c.clicks       || 0),
      ctr:          Number(c.ctr          || 0),
      cpc:          Number(c.cpc          || 0),
      cpm:          Number(c.cpm          || 0),
      leads:        extractAction(c, 'lead'),
      pageViews:    extractAction(c, 'landing_page_view'),
      cpl:          extractCPA(c, 'lead'),
      // PIILK variant 자동 감지 (캠페인 이름에 _main / _type 포함 여부)
      variant: (() => {
        const nl = (c.campaign_name || '').toLowerCase();
        if (nl.includes('_main') || nl.includes('main')) return 'main';
        if (nl.includes('_type') || nl.includes('type') || nl.includes('quiz')) return 'type';
        return 'unknown';
      })(),
    })).sort((a: any, b: any) => b.spend - a.spend);

    // ─── 3. 일별 spend 추이 ───
    const dailyRaw = await metaFetch(`/${ACCOUNT}/insights`, {
      fields: 'spend,impressions,clicks,actions',
      time_range: JSON.stringify({ since, until }),
      time_increment: '1',  // 1일 단위
      level: 'account',
      limit: '90',
    });

    const dailySpend = (dailyRaw?.data || []).map((d: any) => ({
      date:        d.date_start,
      spend:       Number(d.spend       || 0),
      impressions: Number(d.impressions || 0),
      clicks:      Number(d.clicks      || 0),
      leads:       extractAction(d, 'lead'),
      pageViews:   extractAction(d, 'landing_page_view'),
    })).sort((a: any, b: any) => a.date.localeCompare(b.date));

    // ─── 4. Ad 레벨 (광고별 — level=ad 요청 시) ───
    let ads: any[] = [];
    if (level === 'ad') {
      const adFields = [
        'ad_name', 'ad_id', 'campaign_name', 'adset_name', 'status',
        'spend', 'impressions', 'reach', 'clicks',
        'ctr', 'cpc', 'actions', 'cost_per_action',
      ].join(',');

      const adRaw = await metaFetch(`/${ACCOUNT}/insights`, {
        fields: adFields,
        time_range: JSON.stringify({ since, until }),
        level: 'ad',
        limit: '100',
      });

      ads = (adRaw?.data || []).map((a: any) => ({
        adId:         a.ad_id,
        adName:       a.ad_name,
        campaignName: a.campaign_name,
        adsetName:    a.adset_name,
        spend:        Number(a.spend        || 0),
        impressions:  Number(a.impressions  || 0),
        reach:        Number(a.reach        || 0),
        clicks:       Number(a.clicks       || 0),
        ctr:          Number(a.ctr          || 0),
        cpc:          Number(a.cpc          || 0),
        leads:        extractAction(a, 'lead'),
        pageViews:    extractAction(a, 'landing_page_view'),
        cpl:          extractCPA(a, 'lead'),
        variant: (() => {
          const nl = (a.ad_name || '').toLowerCase();
          if (nl.includes('_main') || nl.includes('main')) return 'main';
          if (nl.includes('_type') || nl.includes('type') || nl.includes('quiz')) return 'type';
          return 'unknown';
        })(),
      })).sort((a: any, b: any) => b.spend - a.spend);
    }

    return NextResponse.json({
      success: true,
      period:  { since, until, preset },
      summary: summaryOut,
      campaigns,
      dailySpend,
      ads,
    });

  } catch (err: any) {
    console.error('[meta-insights]', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Meta API 호출 실패' },
      { status: 500 }
    );
  }
}

'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Image from 'next/image';

/* ─────────────────────────── Types ─────────────────────────── */

interface SegmentData {
  total: number;
  percentage: string;
  breakdown?: {
    residue: number;
    aftertaste: number;
    heaviness: number;
    habit: number;
    lapsed: number;
  };
}

interface DashboardData {
  total: number;
  segments: {
    A: SegmentData;
    B: { total: number; percentage: string };
    C: { total: number; percentage: string };
  };
  quizBreakdown?: {
    brick: number;
    chalk: number;
    zombie: number;
    gambler: number;
  };
}

interface ApiResponse {
  success: boolean;
  supabase: DashboardData | null;
  klaviyo: DashboardData | null;
}

interface Participant {
  id: string;
  email: string;
  name?: string;
  segment?: string;
  sub_reason?: string;
  signed_up_at?: string;
  source?: string;
  ip_address?: string;
  device_type?: string;
  language?: string;
  timezone?: string;
  referrer?: string;
  country?: string;
  region?: string;
  city?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  afterfeel_type?: string;
}

interface ParticipantsResponse {
  success: boolean;
  data: Participant[];
  total: number;
}

interface UtmSourceStat {
  source: string;
  visitors: number;
  sessions: number;
  events: number;
  page_views: number;
  submits: number;
  cvr: string;
}

interface VisitorStat {
  visitors: number;
  sessions: number;
  events: number;
}

/* ─────────────────────────── UTM / Date Utils ─────────────────────────── */

const META_SOURCES = ['fb', 'ig', 'meta', 'facebook', 'instagram'];

function normalizeUtmSource(source: string | undefined | null): string {
  if (!source) return 'Direct';
  const lower = source.toLowerCase().trim();
  if (META_SOURCES.includes(lower)) return 'meta';
  return source;
}

function getRawPlatformLabel(source: string | undefined | null): string {
  if (!source) return 'Direct';
  const lower = source.toLowerCase().trim();
  if (lower === 'fb' || lower === 'facebook') return 'Facebook';
  if (lower === 'ig' || lower === 'instagram') return 'Instagram';
  if (lower === 'meta') return 'Meta (unspecified)';
  return source;
}

function getNYCDate(offset = 0): string {
  const n = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  n.setDate(n.getDate() + offset);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/* ─────────────────────────── Constants ─────────────────────────── */

const QUIZ_TYPE_LABELS: Record<string, { name: string; icon: string; color: string; bgColor: string; borderColor: string }> = {
  brick:   { name: 'Brick Stomach',     icon: '🧱', color: 'text-orange-400', bgColor: 'from-orange-950/40 to-zinc-900/60', borderColor: 'border-orange-900/40' },
  chalk:   { name: 'Chalk Mouth',       icon: '🦷', color: 'text-slate-300',  bgColor: 'from-slate-900/40 to-zinc-900/60',  borderColor: 'border-slate-700/40'  },
  zombie:  { name: 'Post-Shake Zombie', icon: '🧟', color: 'text-green-400',  bgColor: 'from-green-950/40 to-zinc-900/60',  borderColor: 'border-green-900/40'  },
  gambler: { name: '30-Min Gambler',    icon: '🎰', color: 'text-yellow-400', bgColor: 'from-yellow-950/40 to-zinc-900/60', borderColor: 'border-yellow-900/40' },
};

const UTM_SOURCE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  meta:        { bg: 'bg-blue-500/10',  text: 'text-blue-400',  border: 'border-blue-500/30',  dot: 'bg-blue-500'  },
  tonic:       { bg: 'bg-pink-500/10',  text: 'text-pink-400',  border: 'border-pink-500/30',  dot: 'bg-pink-500'  },
  '10almonds': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  Direct:      { bg: 'bg-zinc-500/10',  text: 'text-zinc-400',  border: 'border-zinc-500/30',  dot: 'bg-zinc-500'  },
};

function getUtmColor(source: string) {
  return UTM_SOURCE_COLORS[source] || { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-500' };
}

/* ─────────────────────────── Skeleton Components ─────────────────────────── */

const SkeletonCard = ({ className = '' }: { className?: string }) => (
  <div className={`bg-zinc-900/40 border border-zinc-800 rounded-xl animate-pulse ${className}`} />
);

const SkeletonRow = () => (
  <div className="flex items-center gap-3 px-3 py-3 border-b border-zinc-800/40">
    <div className="w-6 h-3 bg-zinc-800 rounded animate-pulse" />
    <div className="flex-1 h-3 bg-zinc-800 rounded animate-pulse" />
    <div className="w-16 h-4 bg-zinc-800 rounded animate-pulse" />
    <div className="w-12 h-4 bg-zinc-800 rounded animate-pulse" />
    <div className="w-20 h-3 bg-zinc-800 rounded animate-pulse" />
    <div className="w-24 h-3 bg-zinc-800 rounded animate-pulse" />
  </div>
);

/* ─────────────────────────── Sub-components (OUTSIDE main to prevent remount) ─────────────────────────── */

const BarChart = ({ data, color, total }: { data: [string, number][]; color: string; total: number }) => (
  <div className="space-y-1.5">
    {data.map(([label, count]) => (
      <div key={label} className="flex items-center gap-2">
        <span className="text-[10px] sm:text-xs text-zinc-400 w-20 sm:w-24 truncate text-right shrink-0">{label}</span>
        <div className="flex-1 h-5 sm:h-6 bg-zinc-800/50 rounded-md overflow-hidden relative">
          <div className={`h-full rounded-md ${color} transition-all duration-700`} style={{ width: `${total > 0 ? Math.max((count / total) * 100, 2) : 0}%` }} />
          <span className="absolute inset-0 flex items-center px-2 text-[10px] sm:text-xs text-white font-medium">
            {count} <span className="text-zinc-500 ml-1">({total > 0 ? ((count / total) * 100).toFixed(0) : 0}%)</span>
          </span>
        </div>
      </div>
    ))}
  </div>
);

// SignupChart — OUTSIDE DashboardPage to prevent state reset on re-render
const SignupChart = ({ daily, cumulative }: { daily: [string, number][]; cumulative: [string, number][] }) => {
  const [chartMode, setChartMode] = useState<'daily' | 'cumulative'>('daily');
  const chartData = chartMode === 'daily' ? daily : cumulative;

  const fmtShortDate = (d: string) => {
    const p = d.split('-');
    return `${p[1]}/${p[2]}`;
  };

  if (chartData.length === 0) return null;
  const maxVal = Math.max(...chartData.map(d => d[1]), 1);

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">📈</span>
          <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Signup Trend</h3>
        </div>
        <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
          <button onClick={() => setChartMode('daily')} className={`px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-all ${chartMode === 'daily' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>Daily</button>
          <button onClick={() => setChartMode('cumulative')} className={`px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-all ${chartMode === 'cumulative' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>Cumulative</button>
        </div>
      </div>
      <div className="relative h-40 sm:h-52">
        <div className="absolute left-0 top-0 bottom-5 w-8 flex flex-col justify-between text-[9px] text-zinc-600 font-mono">
          <span>{maxVal}</span><span>{Math.round(maxVal / 2)}</span><span>0</span>
        </div>
        <div className="absolute left-9 right-0 top-0 bottom-5">
          <div className="absolute top-0 left-0 right-0 border-t border-zinc-800/50" />
          <div className="absolute top-1/2 left-0 right-0 border-t border-zinc-800/30 border-dashed" />
          <div className="absolute bottom-0 left-0 right-0 border-t border-zinc-800/50" />
        </div>
        <div className="absolute left-9 right-0 top-0 bottom-5 flex items-end gap-[1px]">
          {chartData.map(([day, count], i) => {
            const height = maxVal > 0 ? (count / maxVal) * 100 : 0;
            const isToday = day === getNYCDate(0);
            return (
              <div key={day} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[9px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                  {fmtShortDate(day)}: <span className="font-bold">{count}</span>
                </div>
                <div
                  className={`w-full rounded-t-sm transition-all duration-500 ${isToday ? 'bg-emerald-400' : chartMode === 'cumulative' ? 'bg-purple-500/80 group-hover:bg-purple-400' : 'bg-emerald-500/60 group-hover:bg-emerald-400'}`}
                  style={{ height: `${Math.max(height, count > 0 ? 2 : 0)}%` }}
                />
                {(chartData.length <= 14 || i % Math.ceil(chartData.length / 10) === 0 || i === chartData.length - 1) && (
                  <span className={`text-[7px] sm:text-[8px] mt-1 font-mono ${isToday ? 'text-emerald-400 font-bold' : 'text-zinc-600'}`}>{fmtShortDate(day)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-800/50">
        <div className="text-[10px] sm:text-xs text-zinc-500">Period: <span className="text-zinc-300 font-medium">{chartData.length} days</span></div>
        {chartMode === 'daily' && <div className="text-[10px] sm:text-xs text-zinc-500">Avg: <span className="text-zinc-300 font-medium">{(daily.reduce((s, d) => s + d[1], 0) / Math.max(daily.length, 1)).toFixed(1)}</span>/day</div>}
        <div className="text-[10px] sm:text-xs text-zinc-500">Peak: <span className="text-emerald-400 font-medium">{Math.max(...daily.map(d => d[1]))}</span></div>
      </div>
    </div>
  );
};

/* ─────────────────────────── Data Cache Type ─────────────────────────── */

type VariantKey = 'main' | 'type';

interface DataCache {
  stats: Record<VariantKey, { supabase: DashboardData | null; klaviyo: DashboardData | null } | null>;
  participants: Record<VariantKey, { klaviyo: Participant[]; supabase: Participant[] } | null>;
  otherParticipants: Record<VariantKey, { klaviyo: Participant[]; supabase: Participant[] } | null>;
}

/* ─────────────────────────── localStorage safe read helper ─────────────────────────── */
function lsGet(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return localStorage.getItem(key) ?? fallback;
}
function lsGetJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}

/* ─────────────────────────── Main Component ─────────────────────────── */

export default function DashboardPage() {

  /* ══════════════════════════════════════════════════════════
     PATCH 1: lazy initializer — localStorage를 렌더 전에 읽음
     → "로그인 화면 잠깐 뜨는" 플래시 완전 제거
  ══════════════════════════════════════════════════════════ */
  const [authenticated, setAuthenticated] = useState<boolean>(() =>
    lsGet('piilk_dash', '') === 'true'
  );
  const [password, setPassword] = useState<string>(() =>
    lsGet('piilk_saved_pw', '')
  );
  const [rememberMe, setRememberMe] = useState<boolean>(() =>
    lsGet('piilk_saved_pw', '') !== ''
  );
  const [excludeIPs, setExcludeIPs] = useState<string[]>(() =>
    lsGetJSON<string[]>('piilk_exclude_ips', [])
  );

  /* ── Variant ── */
  const [variant, setVariant] = useState<VariantKey>('main');

  /* ── Dashboard data ── */
  const [supabaseData, setSupabaseData] = useState<DashboardData | null>(null);
  const [klaviyoData, setKlaviyoData] = useState<DashboardData | null>(null);
  const [activeSource, setActiveSource] = useState<'klaviyo' | 'supabase'>('supabase');
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  /* ── variant별 total 캐싱 — localStorage에서 즉시 복원해 버퍼 없이 바로 표시 ── */
  const [supabaseTotals, setSupabaseTotals] = useState<{ main: number | null; type: number | null }>(() =>
    lsGetJSON('piilk_supabase_totals', { main: null, type: null })
  );
  const [klaviyoTotals, setKlaviyoTotals] = useState<{ main: number | null; type: number | null }>(() =>
    lsGetJSON('piilk_klaviyo_totals', { main: null, type: null })
  );

  /* ── 데이터 캐시 ref ── */
  const dataCache = useRef<DataCache>({
    stats: { main: null, type: null },
    participants: { main: null, type: null },
    otherParticipants: { main: null, type: null },
  });

  /* ── View mode ── */
  const [viewMode, setViewMode] = useState<'overview' | 'participants' | 'analytics'>('participants');

  /* ── Analytics — localStorage에서 즉시 복원 (Visitors/CVR 버퍼 제거) ── */
  const [analyticsData, setAnalyticsData] = useState<any>(() => {
    const cached = lsGetJSON<any>('piilk_analytics_cache', null);
    // 날짜가 바뀌면 캐시 무효화 (오늘 rawEvents만 저장했으므로)
    if (cached?._cachedAt && cached._cachedAt !== getNYCDate(0)) return null;
    return cached;
  });
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<string>('today');
  const [analyticsDateFrom, setAnalyticsDateFrom] = useState<string>('');
  const [analyticsDateTo, setAnalyticsDateTo] = useState<string>('');
  const [trafficFilter, setTrafficFilter] = useState<'all' | 'paid' | 'organic'>('all');

  /* ── IP 제외 ── */
  const [excludeIPInput, setExcludeIPInput] = useState('');
  const [showIPFilter, setShowIPFilter] = useState(false);

  /* ── Meta Ads ── */
  const [metaAdsData, setMetaAdsData] = useState<any[]>([]);
  const [metaAdsDate, setMetaAdsDate] = useState<string>('');
  const metaFileRef = useRef<HTMLInputElement>(null);

  /* ── Participants ── */
  const [participants, setParticipants] = useState<{ klaviyo: Participant[]; supabase: Participant[] }>({ klaviyo: [], supabase: [] });
  const [otherParticipants, setOtherParticipants] = useState<{ klaviyo: Participant[]; supabase: Participant[] }>({ klaviyo: [], supabase: [] });
  const [participantsLoading, setParticipantsLoading] = useState(false);

  /* ── Filters ── */
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [domainFilter, setDomainFilter] = useState<string>('');
  const [countryFilter, setCountryFilter] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [deviceFilter, setDeviceFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  /* ── Sort ── */
  const [sortField, setSortField] = useState<'signed_up_at' | 'name' | 'email' | 'segment' | 'country' | 'city'>('signed_up_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  /* ── Pagination ── */
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(20);

  /* ── Detail modal ── */
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);

  /* ══════════════════════════════════════════════════════════
     PATCH 1 continued: localStorage useEffect 완전 제거
     (lazy initializer로 대체됐으므로 불필요)
  ══════════════════════════════════════════════════════════ */

  /* ── Auth handler ── */
  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'piilk$1b') {
      setAuthenticated(true);
      localStorage.setItem('piilk_dash', 'true');
      if (rememberMe) localStorage.setItem('piilk_saved_pw', password);
      else localStorage.removeItem('piilk_saved_pw');
    } else {
      alert('Wrong password');
    }
  };

  /* ── variant를 ref로 관리 → fetchData/fetchParticipants/fetchAnalytics deps에서 variant 제거 ── */
  const variantRef = useRef<VariantKey>(variant);
  useEffect(() => { variantRef.current = variant; }, [variant]);

  /* ── Fetch: stats — variant는 ref로 읽어 stable reference 유지 ── */
  const fetchData = useCallback(async (silent = false) => {
    const v = variantRef.current;
    if (!silent) setIsStatsLoading(true);
    try {
      const res = await fetch(`/api/dashboard/stats?variant=${v}`);
      const result: ApiResponse = await res.json();
      if (result.success) {
        setSupabaseData(result.supabase);
        setKlaviyoData(result.klaviyo);
        setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
        dataCache.current.stats[v] = { supabase: result.supabase, klaviyo: result.klaviyo };
      }
    } catch (err) { console.error('fetchData error:', err); }
    finally { setIsStatsLoading(false); }
  }, []); // deps 없음 → stable

  /* ══════════════════════════════════════════════════════════
     PATCH 4: participants를 Supabase 먼저 → Klaviyo 후속 표시
     → 화면에 데이터가 더 빨리 뜸 (Supabase가 보통 더 빠름)
     PATCH 3: otherVariant는 완전 비동기 후속 처리
     → participantsLoading 해제를 현재 variant 완료 즉시
  ══════════════════════════════════════════════════════════ */
  const fetchParticipants = useCallback(async () => {
    const v = variantRef.current;
    const otherVariant: VariantKey = v === 'main' ? 'type' : 'main';
    setParticipantsLoading(true);

    try {
      // ── STEP 1: Supabase 현재 variant만 먼저 (가장 빠른 첫 화면) ──
      const sRes = await fetch(`/api/dashboard/participants?source=supabase&variant=${v}`);
      const sResult: ParticipantsResponse = await sRes.json();

      if (sResult.success) {
        setParticipants(prev => ({ ...prev, supabase: sResult.data }));
        setSupabaseTotals(prev => {
          const next = { ...prev, [v]: sResult.total };
          localStorage.setItem('piilk_supabase_totals', JSON.stringify(next));
          return next;
        });
      }
      // Supabase 오자마자 로딩 해제 → 사용자 즉시 확인 가능
      setParticipantsLoading(false);

      // ── STEP 2: Klaviyo 현재 variant (백그라운드) ──
      const kRes = await fetch(`/api/dashboard/participants?source=klaviyo&variant=${v}`);
      const kResult: ParticipantsResponse = await kRes.json();

      if (kResult.success) {
        setParticipants(prev => ({ ...prev, klaviyo: kResult.data }));
        setKlaviyoTotals(prev => {
          const next = { ...prev, [v]: kResult.total };
          localStorage.setItem('piilk_klaviyo_totals', JSON.stringify(next));
          return next;
        });
      }

      // 캐시 저장 (Klaviyo까지 완료 후)
      const currentData = {
        klaviyo: kResult.success ? kResult.data : [],
        supabase: sResult.success ? sResult.data : [],
      };
      dataCache.current.participants[v] = currentData;

      // ── STEP 3: otherVariant 완전 백그라운드 (화면 블로킹 0) ──
      const [sOtherRes, kOtherRes] = await Promise.all([
        fetch(`/api/dashboard/participants?source=supabase&variant=${otherVariant}`),
        fetch(`/api/dashboard/participants?source=klaviyo&variant=${otherVariant}`),
      ]);
      const [sOtherResult, kOtherResult]: [ParticipantsResponse, ParticipantsResponse] = await Promise.all([
        sOtherRes.json(), kOtherRes.json(),
      ]);

      const otherData = {
        klaviyo: kOtherResult.success ? kOtherResult.data : [],
        supabase: sOtherResult.success ? sOtherResult.data : [],
      };
      setOtherParticipants(otherData);
      if (sOtherResult.success) setSupabaseTotals(prev => {
        const next = { ...prev, [otherVariant]: sOtherResult.total };
        localStorage.setItem('piilk_supabase_totals', JSON.stringify(next));
        return next;
      });
      if (kOtherResult.success) setKlaviyoTotals(prev => {
        const next = { ...prev, [otherVariant]: kOtherResult.total };
        localStorage.setItem('piilk_klaviyo_totals', JSON.stringify(next));
        return next;
      });
      dataCache.current.otherParticipants[v] = otherData;

    } catch (err) {
      console.error('fetchParticipants error:', err);
      setParticipantsLoading(false);
    }
  }, []); // deps 없음 → stable

  /* ── Fetch: analytics ── */
  const fetchAnalytics = useCallback(async () => {
    const v = variantRef.current;
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/dashboard/analytics?variant=${v}`);
      const result = await res.json();
      if (result.success) {
        setAnalyticsData(result);
        // localStorage 캐싱: rawEvents는 오늘 것만 저장 (용량 절약)
        try {
          const todayStr = getNYCDate(0);
          const cachePayload = {
            ...result,
            rawEvents: (result.rawEvents || []).filter((ev: any) => ev.d === todayStr),
            _cachedAt: todayStr,
          };
          // variant별 저장 + 공통 저장 (초기 로드 시 사용)
          localStorage.setItem(`piilk_analytics_cache_${v}`, JSON.stringify(cachePayload));
          localStorage.setItem('piilk_analytics_cache', JSON.stringify(cachePayload));
        } catch { /* localStorage 용량 초과 시 무시 */ }
      }
    } catch (err) { console.error('fetchAnalytics error:', err); }
    finally { setAnalyticsLoading(false); }
  }, []); // deps 없음 → stable

  /* ══════════════════════════════════════════════════════════
     PATCH 2: isFirstMount ref로 variant effect 최초 마운트 중복 방지
     → 로그인 직후 API 이중 호출 제거
  ══════════════════════════════════════════════════════════ */
  const isFirstMount = useRef(true);

  /* ── 최초 인증 후 로딩 ── */
  useEffect(() => {
    if (!authenticated) return;
    // variant effect도 최초에 실행되지 않도록 플래그
    isFirstMount.current = false;
    fetchData();
    fetchParticipants();
    // analytics는 participants 뜬 뒤 로드
    const timer = setTimeout(() => fetchAnalytics(), 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  /* ── Variant 전환: 캐시 즉시 표시 → 백그라운드 갱신 ── */
  useEffect(() => {
    if (!authenticated) return;

    // PATCH 2: 최초 마운트는 authenticated effect가 처리하므로 skip
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    setCurrentPage(1);
    // variant별 analytics 캐시 확인 — 있으면 유지, 없으면 초기화
    const cachedAnalytics = lsGetJSON<any>(`piilk_analytics_cache_${variant}`, null);
    if (cachedAnalytics?._cachedAt === getNYCDate(0)) {
      setAnalyticsData(cachedAnalytics);
    } else {
      setAnalyticsData(null);
    }

    // 캐시 있으면 즉시 표시 (빈 화면 없음)
    const cachedStats = dataCache.current.stats[variant];
    if (cachedStats) {
      setSupabaseData(cachedStats.supabase);
      setKlaviyoData(cachedStats.klaviyo);
    } else {
      setSupabaseData(null);
      setKlaviyoData(null);
    }
    setParticipants(dataCache.current.participants[variant] ?? { klaviyo: [], supabase: [] });
    setOtherParticipants(dataCache.current.otherParticipants[variant] ?? { klaviyo: [], supabase: [] });

    // 백그라운드 갱신
    setIsRefreshing(true);
    Promise.all([fetchData(true), fetchParticipants()])
      .finally(() => setIsRefreshing(false));
    const timer = setTimeout(() => fetchAnalytics(), 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  /* ── Auto-refresh stats (30초, stable ref) ── */
  useEffect(() => {
    if (!authenticated) return;
    const iv = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(iv);
  }, [authenticated, fetchData]);

  /* ── 파생 데이터 ── */
  const currentParticipants = activeSource === 'klaviyo' ? participants.klaviyo : participants.supabase;
  const currentOtherParticipants = activeSource === 'klaviyo' ? otherParticipants.klaviyo : otherParticipants.supabase;

  const mergedParticipants = useMemo(() => {
    const mainList = (variant === 'main' ? currentParticipants : currentOtherParticipants).map(p => ({ ...p, _variantTag: 'main' as const }));
    const typeList = (variant === 'type' ? currentParticipants : currentOtherParticipants).map(p => ({ ...p, _variantTag: 'type' as const }));
    return [...mainList, ...typeList].sort((a, b) => (b.signed_up_at || '').localeCompare(a.signed_up_at || ''));
  }, [currentParticipants, currentOtherParticipants, variant]);

  const todaySignups = useMemo(() => {
    const todayStr = getNYCDate(0);
    const base = variant === 'main' ? mergedParticipants : currentParticipants;
    return base.filter(p => {
      if (!p.signed_up_at) return false;
      return new Date(p.signed_up_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === todayStr;
    }).length;
  }, [currentParticipants, mergedParticipants, variant]);

  const dailySignups = useMemo(() => {
    const dayMap: Record<string, number> = {};
    currentParticipants.forEach(p => {
      if (!p.signed_up_at) return;
      const day = p.signed_up_at.slice(0, 10);
      if (day) dayMap[day] = (dayMap[day] || 0) + 1;
    });
    const sorted = Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0]));
    if (sorted.length <= 1) return sorted;
    const filled: [string, number][] = [];
    const start = new Date(sorted[0][0]);
    const end = new Date(sorted[sorted.length - 1][0]);
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      filled.push([key, dayMap[key] || 0]);
    }
    return filled;
  }, [currentParticipants]);

  const cumulativeSignups = useMemo(() => {
    let cum = 0;
    return dailySignups.map(([day, count]) => { cum += count; return [day, cum] as [string, number]; });
  }, [dailySignups]);

  /* ── Filter options ── */
  const uniqueReasons   = useMemo(() => Array.from(new Set(currentParticipants.map(p => p.sub_reason).filter(Boolean) as string[])).sort(), [currentParticipants]);
  const uniqueDomains   = useMemo(() => Array.from(new Set(currentParticipants.filter(p => p.email?.includes('@')).map(p => p.email!.split('@')[1].toLowerCase()))).sort(), [currentParticipants]);
  const uniqueCountries = useMemo(() => Array.from(new Set(currentParticipants.map(p => p.country).filter(Boolean) as string[])).sort(), [currentParticipants]);
  const uniqueCities    = useMemo(() => Array.from(new Set(currentParticipants.map(p => p.city).filter(Boolean) as string[])).sort(), [currentParticipants]);
  const uniqueDevices   = useMemo(() => Array.from(new Set(currentParticipants.map(p => p.device_type).filter(Boolean) as string[])).sort(), [currentParticipants]);

  const activeFilterCount = useMemo(() => {
    return [segmentFilter !== 'all', reasonFilter !== 'all', !!domainFilter, !!countryFilter, !!cityFilter, !!deviceFilter, !!dateFrom, !!dateTo].filter(Boolean).length;
  }, [segmentFilter, reasonFilter, domainFilter, countryFilter, cityFilter, deviceFilter, dateFrom, dateTo]);

  const clearAllFilters = () => {
    setSearchQuery(''); setSegmentFilter('all'); setReasonFilter('all');
    setDomainFilter(''); setCountryFilter(''); setCityFilter('');
    setDeviceFilter(''); setDateFrom(''); setDateTo('');
    setCurrentPage(1);
  };

  /* ── Filtered + Sorted participants ── */
  const filteredParticipants = useMemo(() => {
    const baseList = variant === 'main'
      ? mergedParticipants
      : currentParticipants.map(p => ({ ...p, _variantTag: 'type' as const }));

    let list = [...baseList] as (Participant & { _variantTag?: 'main' | 'type' })[];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.email?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) ||
        p.segment?.toLowerCase().includes(q) || p.sub_reason?.toLowerCase().includes(q) ||
        p.country?.toLowerCase().includes(q) || p.city?.toLowerCase().includes(q) ||
        p.ip_address?.includes(q)
      );
    }
    if (segmentFilter !== 'all') {
      if (variant === 'type') {
        list = list.filter(p => p.sub_reason === segmentFilter || p.afterfeel_type === segmentFilter);
      } else {
        list = list.filter(p => p.segment === segmentFilter);
      }
    }
    if (reasonFilter !== 'all') list = list.filter(p => p.sub_reason === reasonFilter);
    if (domainFilter) list = list.filter(p => p.email?.toLowerCase().endsWith('@' + domainFilter.toLowerCase()));
    if (countryFilter) list = list.filter(p => p.country === countryFilter);
    if (cityFilter) list = list.filter(p => p.city === cityFilter);
    if (deviceFilter) list = list.filter(p => p.device_type === deviceFilter);
    if (dateFrom) list = list.filter(p => p.signed_up_at && p.signed_up_at.slice(0, 10) >= dateFrom);
    if (dateTo) list = list.filter(p => p.signed_up_at && p.signed_up_at.slice(0, 10) <= dateTo);

    list.sort((a, b) => {
      const aVal = (String((a as any)[sortField] || '')).toLowerCase();
      const bVal = (String((b as any)[sortField] || '')).toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [mergedParticipants, currentParticipants, searchQuery, segmentFilter, reasonFilter, domainFilter, countryFilter, cityFilter, deviceFilter, dateFrom, dateTo, sortField, sortDir, variant]);

  /* ── 필터/검색/variant/source/pageSize 변경 시 1페이지 리셋 ── */
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, segmentFilter, reasonFilter, domainFilter, countryFilter, cityFilter, deviceFilter, dateFrom, dateTo, variant, activeSource, pageSize]);

  /* ── Pagination ── */
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(filteredParticipants.length / (pageSize as number));
  const pagedParticipants = pageSize === 'all'
    ? filteredParticipants
    : filteredParticipants.slice((currentPage - 1) * (pageSize as number), currentPage * (pageSize as number));

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const exportToCSV = () => {
    const headers = ['Email', 'Segment', 'Reason', 'AfterfeelType', 'Country', 'Region', 'City', 'Device', 'Language', 'Timezone', 'IP', 'Referrer', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Source', 'Signed Up'];
    const rows = filteredParticipants.map(p => [p.email || '', p.segment || '', p.sub_reason || '', p.afterfeel_type || '', p.country || '', p.region || '', p.city || '', p.device_type || '', p.language || '', p.timezone || '', p.ip_address || '', p.referrer || '', p.utm_source || '', p.utm_medium || '', p.utm_campaign || '', p.source || '', p.signed_up_at || '']);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `piilk-${variant}-participants-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /* ── Quiz type counts ── */
  const quizTypeCounts = useMemo(() => {
    if (variant !== 'type') return null;
    const counts: Record<string, number> = { brick: 0, chalk: 0, zombie: 0, gambler: 0 };
    currentParticipants.forEach(p => {
      const type = p.afterfeel_type || p.sub_reason || '';
      if (type in counts) counts[type]++;
    });
    return counts;
  }, [currentParticipants, variant]);

  /* ── Tracking analytics (overview) ── */
  const trackingAnalytics = useMemo(() => {
    if (currentParticipants.length === 0) return null;
    const sortMap = (map: Record<string, number>) => Object.entries(map).sort((a, b) => b[1] - a[1]);
    const countryCounts: Record<string, number> = {};
    const cityCounts: Record<string, number> = {};
    const deviceCounts: Record<string, number> = {};
    const utmCounts: Record<string, number> = {};
    currentParticipants.forEach(x => {
      const c = x.country || 'Unknown';  countryCounts[c] = (countryCounts[c] || 0) + 1;
      const ci = x.city || 'Unknown';    cityCounts[ci] = (cityCounts[ci] || 0) + 1;
      const d = x.device_type || 'Unknown'; deviceCounts[d] = (deviceCounts[d] || 0) + 1;
      const u = normalizeUtmSource(x.utm_source); utmCounts[u] = (utmCounts[u] || 0) + 1;
    });
    return {
      countries: sortMap(countryCounts),
      cities: sortMap(cityCounts).slice(0, 10),
      devices: sortMap(deviceCounts),
      utmSources: sortMap(utmCounts),
      hasTrackingData: currentParticipants.some(x => x.country || x.device_type || x.utm_source),
    };
  }, [currentParticipants]);

  /* ── Analytics filter ── */
  const availableMonths = useMemo(() => {
    if (!analyticsData?.daily) return [];
    const months = new Set<string>();
    analyticsData.daily.forEach((d: any) => { if (d.date) months.add(d.date.slice(0, 7)); });
    return Array.from(months).sort().reverse();
  }, [analyticsData]);

  const filteredAnalytics = useMemo(() => {
    if (!analyticsData) return null;
    let startDate = '', endDate = '';
    const hasDateFilter = analyticsPeriod !== 'all';

    if (analyticsPeriod === 'custom_range') {
      startDate = analyticsDateFrom || '2000-01-01';
      endDate = analyticsDateTo || '2099-12-31';
    } else if (hasDateFilter) {
      const nowNYC = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      if (analyticsPeriod === 'today') { startDate = endDate = getNYCDate(0); }
      else if (analyticsPeriod === 'yesterday') { startDate = endDate = getNYCDate(-1); }
      else if (analyticsPeriod === 'last_7_days') { startDate = getNYCDate(-6); endDate = getNYCDate(0); }
      else if (analyticsPeriod === 'this_week') {
        const dow = nowNYC.getDay();
        const mon = new Date(nowNYC);
        mon.setDate(nowNYC.getDate() - (dow === 0 ? 6 : dow - 1));
        startDate = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
        endDate = getNYCDate(0);
      } else if (analyticsPeriod === 'this_month') {
        startDate = `${nowNYC.getFullYear()}-${String(nowNYC.getMonth() + 1).padStart(2, '0')}-01`;
        endDate = getNYCDate(0);
      } else if (analyticsPeriod === 'last_month') {
        const lm = new Date(nowNYC.getFullYear(), nowNYC.getMonth() - 1, 1);
        const lmEnd = new Date(nowNYC.getFullYear(), nowNYC.getMonth(), 0);
        startDate = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}-01`;
        endDate = lmEnd.toISOString().slice(0, 10);
      } else {
        startDate = `${analyticsPeriod}-01`;
        const [y, m] = analyticsPeriod.split('-').map(Number);
        endDate = new Date(y, m, 0).toISOString().slice(0, 10);
      }
    }

    const filteredDaily = hasDateFilter ? (analyticsData.daily || []).filter((d: any) => d.date >= startDate && d.date <= endDate) : (analyticsData.daily || []);
    let filteredRaw = hasDateFilter ? (analyticsData.rawEvents || []).filter((ev: any) => ev.d >= startDate && ev.d <= endDate) : (analyticsData.rawEvents || []);

    if (trafficFilter !== 'all') {
      filteredRaw = filteredRaw.filter((ev: any) => trafficFilter === 'paid' ? ev.um === 'paid' : ev.um !== 'paid');
    }

    const funnelEvents = ['page_view', 'step1_cta_click', 'step2_answer', 'step3_email_focus', 'step3_reason_select', 'step4_submit'];
    const sessionsByEvt: Record<string, Set<string>> = {};
    funnelEvents.forEach(e => { sessionsByEvt[e] = new Set(); });
    filteredRaw.forEach((ev: any) => { if (funnelEvents.includes(ev.n) && ev.s) sessionsByEvt[ev.n].add(ev.s); });
    const funnel: Record<string, number> = {};
    funnelEvents.forEach(e => { funnel[e] = sessionsByEvt[e].size; });

    if (variant === 'type') {
      sessionsByEvt['step4_submit'].forEach((sid: string) => sessionsByEvt['step3_email_focus'].add(sid));
      funnel['step3_email_focus'] = sessionsByEvt['step3_email_focus'].size;
    }

    const weeklyMap: Record<string, { views: number; submits: number }> = {};
    filteredDaily.forEach((d: any) => {
      const dt = new Date(d.date);
      const jan1 = new Date(dt.getFullYear(), 0, 1);
      const wn = Math.ceil(((dt.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      const key = `${dt.getFullYear()}-W${String(wn).padStart(2, '0')}`;
      if (!weeklyMap[key]) weeklyMap[key] = { views: 0, submits: 0 };
      weeklyMap[key].views += d.page_view || 0;
      weeklyMap[key].submits += d.step4_submit || 0;
    });
    const weekly = Object.entries(weeklyMap).sort((a, b) => a[0].localeCompare(b[0])).map(([week, data]) => ({ week, ...data }));

    const utmMap: Record<string, { views: Set<string>; submits: Set<string> }> = {};
    filteredRaw.forEach((ev: any) => {
      const src = normalizeUtmSource(ev.u);
      if (!utmMap[src]) utmMap[src] = { views: new Set(), submits: new Set() };
      if (ev.n === 'page_view') utmMap[src].views.add(ev.s);
      if (ev.n === 'step4_submit') utmMap[src].submits.add(ev.s);
    });
    const utmPerformance = Object.entries(utmMap).map(([source, data]) => ({
      source, views: data.views.size, submits: data.submits.size,
      cvr: data.views.size > 0 ? ((data.submits.size / data.views.size) * 100).toFixed(1) : '0',
    })).sort((a, b) => b.views - a.views);

    const platformMap: Record<string, { views: Set<string>; submits: Set<string> }> = {};
    filteredRaw.forEach((ev: any) => {
      const src = getRawPlatformLabel(ev.u);
      if (!platformMap[src]) platformMap[src] = { views: new Set(), submits: new Set() };
      if (ev.n === 'page_view') platformMap[src].views.add(ev.s);
      if (ev.n === 'step4_submit') platformMap[src].submits.add(ev.s);
    });
    const platformPerformance = Object.entries(platformMap).map(([platform, data]) => ({
      platform, views: data.views.size, submits: data.submits.size,
      cvr: data.views.size > 0 ? ((data.submits.size / data.views.size) * 100).toFixed(1) : '0',
    })).sort((a, b) => b.views - a.views);

    const campaignMap: Record<string, { views: Set<string>; submits: Set<string>; source: string; medium: string }> = {};
    filteredRaw.forEach((ev: any) => {
      const camp = ev.uc || '(no campaign)';
      if (!campaignMap[camp]) campaignMap[camp] = { views: new Set(), submits: new Set(), source: normalizeUtmSource(ev.u), medium: ev.um || '' };
      if (ev.n === 'page_view') campaignMap[camp].views.add(ev.s);
      if (ev.n === 'step4_submit') campaignMap[camp].submits.add(ev.s);
    });
    const campaignPerformance = Object.entries(campaignMap).map(([campaign, data]) => ({
      campaign, source: data.source, medium: data.medium, views: data.views.size, submits: data.submits.size,
      cvr: data.views.size > 0 ? ((data.submits.size / data.views.size) * 100).toFixed(1) : '0',
      isPaid: data.medium === 'paid',
    })).sort((a, b) => b.views - a.views);

    const allRawP = hasDateFilter ? (analyticsData.rawEvents || []).filter((ev: any) => ev.d >= startDate && ev.d <= endDate) : (analyticsData.rawEvents || []);
    const pS = new Set<string>(); const oS = new Set<string>();
    const pSub = new Set<string>(); const oSub = new Set<string>();
    allRawP.forEach((ev: any) => {
      const ip = ev.um === 'paid';
      if (ev.n === 'page_view') { if (ip) pS.add(ev.s); else oS.add(ev.s); }
      if (ev.n === 'step4_submit') { if (ip) pSub.add(ev.s); else oSub.add(ev.s); }
    });
    const paidVsOrganic = {
      paid:    { views: pS.size,  submits: pSub.size, cvr: pS.size  > 0 ? ((pSub.size  / pS.size)  * 100).toFixed(1) : '0' },
      organic: { views: oS.size,  submits: oSub.size, cvr: oS.size  > 0 ? ((oSub.size  / oS.size)  * 100).toFixed(1) : '0' },
    };

    const hourMapF: Record<number, number> = {};
    filteredRaw.filter((ev: any) => ev.n === 'step4_submit').forEach((ev: any) => { hourMapF[ev.h] = (hourMapF[ev.h] || 0) + 1; });
    const hourly = Array.from({ length: 24 }, (_, i) => ({ hour: i, label: `${i.toString().padStart(2, '0')}:00`, count: hourMapF[i] || 0 }));

    const wdNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const wdMap: Record<number, { views: number; submits: number }> = {};
    for (let i = 0; i < 7; i++) wdMap[i] = { views: 0, submits: 0 };
    filteredRaw.forEach((ev: any) => {
      const dow = new Date(ev.d).getDay();
      if (ev.n === 'page_view') wdMap[dow].views++;
      if (ev.n === 'step4_submit') wdMap[dow].submits++;
    });
    const weekday = Array.from({ length: 7 }, (_, i) => ({ day: wdNames[i], views: wdMap[i].views, submits: wdMap[i].submits }));

    const moMap: Record<string, { views: number; submits: number }> = {};
    filteredRaw.forEach((ev: any) => {
      const k = ev.d?.slice(0, 7);
      if (!k) return;
      if (!moMap[k]) moMap[k] = { views: 0, submits: 0 };
      if (ev.n === 'page_view') moMap[k].views++;
      if (ev.n === 'step4_submit') moMap[k].submits++;
    });
    const monthly = Object.entries(moMap).sort((a, b) => a[0].localeCompare(b[0])).map(([month, data]) => ({ month, ...data }));

    const segDist: Record<string, number> = {};
    filteredRaw.filter((ev: any) => ev.n === 'step2_answer').forEach((ev: any) => {
      const s = ev.ed?.segment || 'Unknown';
      segDist[s] = (segDist[s] || 0) + 1;
    });
    const reasonDist: Record<string, number> = {};
    filteredRaw.filter((ev: any) => ev.n === 'step3_reason_select').forEach((ev: any) => {
      const r = ev.ed?.reason || 'Unknown';
      reasonDist[r] = (reasonDist[r] || 0) + 1;
    });

    const uvSessions = new Set(filteredRaw.map((ev: any) => ev.s).filter(Boolean));
    const uvVisitors = new Set(filteredRaw.map((ev: any) => ev.v || ev.s).filter(Boolean));

    return {
      ...analyticsData, funnel, daily: filteredDaily, weekly, weekday, monthly,
      utmPerformance, platformPerformance, campaignPerformance, paidVsOrganic, hourly,
      segmentDistribution: segDist, reasonDistribution: reasonDist,
      totalVisitors: uvVisitors.size, totalSessions: uvSessions.size,
    };
  }, [analyticsData, analyticsPeriod, analyticsDateFrom, analyticsDateTo, trafficFilter, variant]);

  /* ── Today analytics (CVR) ── */
  const todayAnalytics = useMemo(() => {
    const empty = { visitors: 0, sessions: 0, submits: 0, cvr: '—', paid: { visitors: 0, submits: 0, cvr: '—' }, organic: { visitors: 0, submits: 0, cvr: '—' } };
    if (!analyticsData?.rawEvents) return empty;
    const todayStr = getNYCDate(0);

    const uniqueVisitorMap = new Map<string, boolean>();
    analyticsData.rawEvents
      .filter((ev: any) => ev.d === todayStr && ev.n === 'page_view')
      .filter((ev: any) => !(ev.ip_address && excludeIPs.some((ip: string) => ev.ip_address.startsWith(ip))))
      .forEach((ev: any) => {
        const vid = ev.v || ev.s;
        if (!vid) return;
        const isPaid = ev.um === 'paid';
        if (!uniqueVisitorMap.has(vid)) uniqueVisitorMap.set(vid, isPaid);
        else if (isPaid && !uniqueVisitorMap.get(vid)) uniqueVisitorMap.set(vid, true);
      });

    const paidVids = new Set(Array.from(uniqueVisitorMap.entries()).filter(([, ip]) => ip).map(([id]) => id));
    const orgVids  = new Set(Array.from(uniqueVisitorMap.entries()).filter(([, ip]) => !ip).map(([id]) => id));
    const todayP = currentParticipants.filter(p => {
      if (!p.signed_up_at) return false;
      return new Date(p.signed_up_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === todayStr;
    });

    const submits  = todayP.length;
    const pSubmits = todayP.filter(p => p.utm_medium === 'paid').length;
    const oSubmits = todayP.filter(p => p.utm_medium !== 'paid').length;
    const visitors = uniqueVisitorMap.size;
    const pVis = paidVids.size;
    const oVis = orgVids.size;
    const sessions = new Set(analyticsData.rawEvents.filter((ev: any) => ev.d === todayStr).map((ev: any) => ev.s).filter(Boolean)).size;

    return {
      visitors, sessions, submits, cvr: visitors > 0 ? `${((submits / visitors) * 100).toFixed(1)}%` : '—',
      paid:    { visitors: pVis, submits: pSubmits, cvr: pVis > 0 ? `${((pSubmits / pVis) * 100).toFixed(1)}%` : '—' },
      organic: { visitors: oVis, submits: oSubmits, cvr: oVis > 0 ? `${((oSubmits / oVis) * 100).toFixed(1)}%` : '—' },
    };
  }, [analyticsData, excludeIPs, currentParticipants]);

  /* ── Helpers ── */
  const segColor = (s?: string) => {
    if (variant === 'type') {
      const t = QUIZ_TYPE_LABELS[s || ''];
      if (t) return `bg-zinc-800/30 ${t.color} border-zinc-700/30`;
    }
    switch (s) {
      case 'A': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'B': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'C': return 'bg-sky-500/20 text-sky-400 border-sky-500/30';
      default: return 'bg-zinc-700/30 text-zinc-400 border-zinc-600/30';
    }
  };

  const segLabel = (s?: string, p?: Participant) => {
    if (variant === 'type') {
      const type = p?.afterfeel_type || p?.sub_reason || s || '';
      return QUIZ_TYPE_LABELS[type]?.name || type || 'afterfeel_quiz';
    }
    switch (s) {
      case 'A': return 'Hot Leads';
      case 'B': return 'Skeptic';
      case 'C': return 'Newbie';
      default: return s || '—';
    }
  };

  const fmtDate = (d?: string) => {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      return dt.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + dt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
  };

  const fmtShortDate = (d: string) => { const p = d.split('-'); return `${p[1]}/${p[2]}`; };

  const trafficSourceLabel = (p: Participant): { label: string; color: string } => {
    const src = (p.utm_source || '').toLowerCase();
    const med = (p.utm_medium || '').toLowerCase();
    const ref = (p.referrer || '').toLowerCase();
    if (med === 'paid' || src === 'meta' || src === 'facebook' || src === 'fb') {
      if (src === 'instagram' || ref.includes('instagram')) return { label: 'IG', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' };
      return { label: 'Meta', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
    }
    if (src === 'instagram' || ref.includes('instagram.com')) return { label: 'IG',     color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' };
    if (src === 'facebook'  || ref.includes('facebook.com'))  return { label: 'FB',     color: 'bg-blue-600/20 text-blue-400 border-blue-600/30' };
    if (src === 'google'    || ref.includes('google.com'))    return { label: 'Google', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
    if (src === 'tiktok'    || ref.includes('tiktok.com'))    return { label: 'TikTok', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' };
    if (src === 'twitter'   || src === 'x')                   return { label: 'X',      color: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30' };
    if (src === 'email'     || med === 'email')               return { label: 'Email',  color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
    if (src) return { label: src, color: 'bg-zinc-700/30 text-zinc-400 border-zinc-600/30' };
    return { label: 'Direct', color: 'bg-zinc-800/50 text-zinc-500 border-zinc-700/30' };
  };

  const deviceIcon = (d?: string) => ({ mobile: '📱', desktop: '💻', tablet: '📟' }[d || ''] || '—');

  const oppositeVariant: VariantKey = variant === 'main' ? 'type' : 'main';
  const oppSupabaseTotal = supabaseTotals[oppositeVariant];
  const oppKlaviyoTotal  = klaviyoTotals[oppositeVariant];
  const data = activeSource === 'klaviyo' ? klaviyoData : supabaseData;
  const goal = 15000;
  const progress = data ? Math.min((data.total / goal) * 100, 100) : 0;

  /* ── UtmSourceStatsSection — useCallback으로 stable 유지 ── */
  const UtmSourceStatsSection = useCallback(() => {
    const [utmView, setUtmView] = useState<'today' | 'total'>('today');
    const rawUtmStats: UtmSourceStat[] | undefined = analyticsData?.utmSourceStats?.[utmView];

    const utmStats = useMemo(() => {
      if (!rawUtmStats) return undefined;
      const merged: Record<string, UtmSourceStat> = {};
      rawUtmStats.forEach(stat => {
        const n = normalizeUtmSource(stat.source);
        if (!merged[n]) { merged[n] = { ...stat, source: n }; }
        else {
          merged[n].visitors += stat.visitors;
          merged[n].sessions += stat.sessions;
          merged[n].events += stat.events;
          merged[n].page_views += stat.page_views;
          merged[n].submits += stat.submits;
        }
      });
      Object.values(merged).forEach(m => {
        m.cvr = m.page_views > 0 ? ((m.submits / m.page_views) * 100).toFixed(1) : '0';
      });
      return Object.values(merged).sort((a, b) => b.visitors - a.visitors);
    }, [rawUtmStats]);

    const visitorStatsData: { total: VisitorStat; today: VisitorStat } | undefined = analyticsData?.visitorStats;
    if (!utmStats && !visitorStatsData) return null;

    const currentVS = visitorStatsData?.[utmView];
    const totalVisitorsSum = utmStats?.reduce((s, u) => s + u.visitors, 0) || 0;
    const totalSubmitsSum  = utmStats?.reduce((s, u) => s + u.submits, 0) || 0;

    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-5">
          <div className="flex items-center gap-2">
            <span className="text-base">📡</span>
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Traffic Source Breakdown</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded border ${variant === 'main' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-purple-500/10 text-purple-400 border-purple-500/30'}`}>
              {variant === 'main' ? 'Main Teaser' : 'Quiz Type'}
            </span>
          </div>
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
            <button onClick={() => setUtmView('today')} className={`px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all ${utmView === 'today' ? 'bg-emerald-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Today</button>
            <button onClick={() => setUtmView('total')} className={`px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all ${utmView === 'total' ? 'bg-purple-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Total</button>
          </div>
        </div>

        {currentVS && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-5">
            <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3"><p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">Visitors</p><p className="text-xl sm:text-2xl font-black text-white">{currentVS.visitors.toLocaleString()}</p></div>
            <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3"><p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">Sessions</p><p className="text-xl sm:text-2xl font-black text-white">{currentVS.sessions.toLocaleString()}</p></div>
            <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3"><p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">Events</p><p className="text-xl sm:text-2xl font-black text-zinc-300">{currentVS.events.toLocaleString()}</p></div>
            <div className="bg-emerald-950/30 border border-emerald-900/30 rounded-lg p-3"><p className="text-[9px] text-emerald-500 uppercase tracking-widest font-semibold mb-0.5">Submits</p><p className="text-xl sm:text-2xl font-black text-emerald-400">{totalSubmitsSum}</p></div>
          </div>
        )}

        {utmStats && utmStats.length > 0 && (
          <div className="space-y-2.5">
            {utmStats.map(utm => {
              const colors = getUtmColor(utm.source);
              const visitorPct = totalVisitorsSum > 0 ? (utm.visitors / totalVisitorsSum) * 100 : 0;
              return (
                <div key={utm.source} className={`${colors.bg} border ${colors.border} rounded-xl p-3 sm:p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                      <span className={`text-sm sm:text-base font-bold ${colors.text}`}>{utm.source}</span>
                      <span className="text-[10px] text-zinc-500 font-medium">{visitorPct.toFixed(1)}% of traffic</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${Number(utm.cvr) > 3 ? 'bg-emerald-500/20 text-emerald-400' : Number(utm.cvr) > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700/30 text-zinc-500'}`}>CVR {utm.cvr}%</span>
                  </div>
                  <div className="h-2 bg-zinc-800/80 rounded-full overflow-hidden mb-3">
                    <div className={`h-full rounded-full ${colors.dot} transition-all duration-700`} style={{ width: `${Math.max(visitorPct, utm.visitors > 0 ? 2 : 0)}%` }} />
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { v: utm.visitors,   l: 'Visitors', c: 'text-white' },
                      { v: utm.sessions,   l: 'Sessions', c: 'text-zinc-300' },
                      { v: utm.events,     l: 'Events',   c: 'text-zinc-400' },
                      { v: utm.page_views, l: 'Views',    c: 'text-zinc-400' },
                      { v: utm.submits,    l: 'Submits',  c: 'text-emerald-400' },
                    ].map(item => (
                      <div key={item.l} className="text-center">
                        <p className={`text-sm sm:text-lg font-black ${item.c}`}>{item.v.toLocaleString()}</p>
                        <p className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-widest">{item.l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {(!utmStats || utmStats.length === 0) && <div className="text-center text-zinc-600 py-6 text-sm">No traffic data for this period.</div>}
      </div>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsData, variant]);

  /* ── Pagination UI ── */
  const PaginationUI = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800/50">
        <button
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          Prev
        </button>
        <div className="flex items-center gap-1">
          {currentPage > 3 && (
            <>
              <button onClick={() => setCurrentPage(1)} className="w-8 h-8 rounded-lg text-xs text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all">1</button>
              {currentPage > 4 && <span className="text-zinc-700 text-xs px-1">…</span>}
            </>
          )}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p >= currentPage - 2 && p <= currentPage + 2)
            .map(p => (
              <button key={p} onClick={() => setCurrentPage(p)} className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${p === currentPage ? 'bg-white text-black font-bold shadow' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}>{p}</button>
            ))}
          {currentPage < totalPages - 2 && (
            <>
              {currentPage < totalPages - 3 && <span className="text-zinc-700 text-xs px-1">…</span>}
              <button onClick={() => setCurrentPage(totalPages)} className="w-8 h-8 rounded-lg text-xs text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all">{totalPages}</button>
            </>
          )}
        </div>
        <button
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          Next
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    );
  };

  /* ════════════════════════════════════════
     LOGIN SCREEN
  ════════════════════════════════════════ */
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <form onSubmit={handleAuth} className="text-center max-w-sm w-full">
          <div className="flex justify-center mb-4">
            <Image src="/pillk-logo.png" alt="PIILK" width={120} height={40} className="h-10 w-auto" priority />
          </div>
          <p className="text-zinc-600 text-sm mb-6 sm:mb-8">Internal Dashboard</p>
          <div className="space-y-3">
            <div className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-800 text-zinc-400 rounded-lg text-base text-left">armoredfresh</div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 text-white rounded-lg focus:outline-none focus:border-zinc-600 text-base" autoFocus autoComplete="current-password" />
            <label className="flex items-center gap-2 text-zinc-400 text-sm cursor-pointer justify-start px-1">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer" />
              <span>Remember Password</span>
            </label>
            <button type="submit" className="w-full px-6 py-3 bg-white text-black rounded-lg font-semibold hover:bg-zinc-200 active:scale-[0.98] transition-all">Login</button>
          </div>
        </form>
      </div>
    );
  }

  /* ════════════════════════════════════════
     MAIN DASHBOARD
  ════════════════════════════════════════ */
  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-black to-zinc-900 text-white">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-xl border-b border-zinc-900">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => window.open('https://teaser.piilk.com', '_blank')} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 active:scale-95 transition-all">
              <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <Image src="/pillk-logo.png" alt="PIILK" width={80} height={28} className="h-6 sm:h-7 w-auto" />
            <span className="text-[10px] sm:text-xs text-zinc-600 uppercase tracking-wider hidden sm:inline">Dashboard</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {isRefreshing && <span className="text-[10px] text-zinc-600 animate-pulse hidden sm:inline">갱신중…</span>}
            {isStatsLoading && <div className="w-3 h-3 border border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />}
            <span className="text-zinc-500 text-[10px] sm:text-xs font-mono">{lastUpdated}</span>
            <button onClick={() => { fetchData(); fetchParticipants(); fetchAnalytics(); }} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 active:scale-95">
              <svg className="w-3 h-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <button onClick={() => { localStorage.removeItem('piilk_dash'); localStorage.removeItem('piilk_saved_pw'); localStorage.removeItem('piilk_supabase_totals'); localStorage.removeItem('piilk_klaviyo_totals'); localStorage.removeItem('piilk_analytics_cache'); localStorage.removeItem('piilk_analytics_cache_main'); localStorage.removeItem('piilk_analytics_cache_type'); setAuthenticated(false); setPassword(''); setRememberMe(false); }} className="text-[10px] sm:text-xs text-zinc-500 hover:text-white transition-colors">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* ── Variant Tabs ── */}
        <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 rounded-xl p-1">
          <button onClick={() => setVariant('main')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${variant === 'main' ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            Main Teaser
          </button>
          <button onClick={() => setVariant('type')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${variant === 'type' ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            Quiz Type
          </button>
        </div>

        {/* ── View Mode Tabs ── */}
        <div className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-800 rounded-xl p-1">
          {(['overview', 'participants', 'analytics'] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all capitalize ${viewMode === mode ? 'bg-white text-black shadow-lg shadow-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {mode === 'overview'     && <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
              {mode === 'participants' && <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
              {mode === 'analytics'   && <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
              {mode}
            </button>
          ))}
        </div>

        {/* ── Data Source Tabs ── */}
        {viewMode !== 'analytics' && (
          <div className="flex gap-2">
            {(['klaviyo', 'supabase'] as const).map(src => {
              const srcData = src === 'klaviyo' ? klaviyoData : supabaseData;
              const oppTotal = src === 'klaviyo' ? oppKlaviyoTotal : oppSupabaseTotal;
              const isActive = activeSource === src;
              return (
                <button key={src} onClick={() => setActiveSource(src)} className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${isActive ? (src === 'klaviyo' ? 'bg-purple-600 text-white' : 'bg-emerald-600 text-white') : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                  {src === 'klaviyo' ? '📧' : '🗄️'} {src === 'klaviyo' ? 'Klaviyo' : 'Supabase'}
                  {srcData && <span className="text-xs opacity-80">({srcData.total})</span>}
                  {oppTotal !== null && (
                    <>
                      <span className="text-xs opacity-40">+</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold border ${variant === 'main' ? 'bg-purple-900/50 text-purple-300 border-purple-700/40' : 'bg-emerald-900/50 text-emerald-300 border-emerald-700/40'}`}>
                        {oppositeVariant === 'main' ? 'Main' : 'Quiz'} {oppTotal}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ════════════════════════════════════════
            OVERVIEW TAB
        ════════════════════════════════════════ */}
        {viewMode === 'overview' && (
          <>
            {/* Hero total */}
            <section className="relative overflow-hidden bg-gradient-to-br from-zinc-900/80 to-zinc-950 border border-zinc-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8">
              <div className={`absolute inset-0 bg-gradient-to-r ${variant === 'type' ? 'from-purple-500/5' : 'from-emerald-500/5'} to-transparent`} />
              <div className="relative">
                {data ? (
                  <>
                    <div className="flex items-end justify-between gap-4 mb-4 sm:mb-6">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded ${activeSource === 'klaviyo' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{activeSource === 'klaviyo' ? 'Klaviyo' : 'Supabase'}</span>
                          <span className={`text-xs px-2 py-0.5 rounded border ${variant === 'main' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-purple-500/10 text-purple-400 border-purple-500/30'}`}>{variant === 'main' ? 'Main Teaser' : 'Quiz Type'}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">TODAY +{todaySignups}</span>
                        </div>
                        <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest mb-1 sm:mb-2">Total Signups</p>
                        <p className="text-5xl sm:text-6xl lg:text-8xl font-black leading-none tracking-tighter bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">{data.total.toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-zinc-500 text-xs sm:text-sm">Goal: {goal.toLocaleString()}</p>
                        <p className={`text-xl sm:text-2xl font-bold ${variant === 'type' ? 'text-purple-500' : 'text-emerald-500'}`}>{progress.toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="h-1.5 sm:h-2 bg-zinc-800/50 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-1000 ${variant === 'type' ? 'bg-gradient-to-r from-purple-600 to-purple-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`} style={{ width: `${progress}%` }} />
                    </div>
                    <div className="flex justify-between mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-zinc-700 font-mono"><span>0</span><span>5K</span><span>10K</span><span>15K</span></div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex gap-2"><SkeletonCard className="h-6 w-20" /><SkeletonCard className="h-6 w-24" /></div>
                    <SkeletonCard className="h-16 w-48" />
                    <SkeletonCard className="h-2 w-full" />
                  </div>
                )}
              </div>
            </section>

            {dailySignups.length > 0 && <SignupChart daily={dailySignups} cumulative={cumulativeSignups} />}

            {/* Segments */}
            {data ? (
              variant === 'type' ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {Object.entries(QUIZ_TYPE_LABELS).map(([key, label]) => {
                    const count = data.quizBreakdown?.[key as keyof typeof data.quizBreakdown] ?? quizTypeCounts?.[key] ?? 0;
                    const pct = data.total > 0 ? ((count / data.total) * 100).toFixed(1) : '0';
                    return (
                      <div key={key} className={`bg-gradient-to-br ${label.bgColor} border ${label.borderColor} rounded-xl sm:rounded-2xl p-4 sm:p-5 relative overflow-hidden`}>
                        <div className="absolute top-0 right-0 w-20 h-20 opacity-10 text-6xl flex items-center justify-center pointer-events-none">{label.icon}</div>
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-2"><span className="text-lg">{label.icon}</span><p className={`text-[9px] sm:text-xs uppercase tracking-widest font-bold ${label.color}`}>{label.name}</p></div>
                          <div className="flex items-end justify-between mt-3">
                            <p className={`text-3xl sm:text-4xl font-black ${label.color}`}>{count}</p>
                            <p className={`text-sm sm:text-base font-bold ${label.color} opacity-70`}>{pct}%</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
                  <div className="lg:col-span-2 bg-gradient-to-br from-emerald-950/40 to-zinc-900/60 border border-emerald-900/40 rounded-xl sm:rounded-2xl p-4 sm:p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 sm:w-48 h-32 sm:h-48 bg-emerald-500/10 rounded-full blur-3xl" />
                    <div className="relative">
                      <div className="flex items-start justify-between mb-4 sm:mb-6">
                        <div>
                          <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-emerald-500 rounded-full animate-pulse" /><p className="text-[10px] sm:text-xs text-emerald-400 uppercase tracking-widest font-bold">Segment A</p></div>
                          <h2 className="text-lg sm:text-xl font-bold text-white">Hot Leads</h2>
                          <p className="text-zinc-500 text-[10px] sm:text-xs">Yes - Core Target</p>
                        </div>
                        <div className="text-right">
                          <p className="text-4xl sm:text-5xl lg:text-6xl font-black text-emerald-400">{data.segments.A.total}</p>
                          <p className="text-emerald-600 text-base sm:text-lg font-bold">{data.segments.A.percentage}%</p>
                        </div>
                      </div>
                      {data.segments.A.breakdown && (
                        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                          {[
                            { label: 'Residue',    value: data.segments.A.breakdown.residue },
                            { label: 'Aftertaste', value: data.segments.A.breakdown.aftertaste },
                            { label: 'Heaviness',  value: data.segments.A.breakdown.heaviness },
                            { label: 'Habit',      value: data.segments.A.breakdown.habit },
                            { label: 'Lapsed',     value: data.segments.A.breakdown.lapsed },
                          ].map(item => (
                            <div key={item.label} className="bg-black/40 rounded-lg sm:rounded-xl p-2 sm:p-3 text-center border border-emerald-900/20">
                              <p className="text-lg sm:text-2xl font-black text-white">{item.value}</p>
                              <p className="text-[7px] sm:text-[9px] text-emerald-500/80 uppercase tracking-wider font-semibold mt-0.5 sm:mt-1 leading-tight">{item.label}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-4">
                    <div className="bg-gradient-to-br from-amber-950/30 to-zinc-900/50 border border-amber-900/30 rounded-xl sm:rounded-2xl p-3 sm:p-5">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-amber-500 rounded-full" /><p className="text-[9px] sm:text-xs text-amber-500 uppercase tracking-widest font-bold">Segment B</p></div>
                      <h3 className="text-base sm:text-lg font-bold text-white">Skeptics</h3>
                      <p className="text-zinc-500 text-[10px] sm:text-xs mb-2 sm:mb-3">No - Unaware</p>
                      <div className="flex items-end justify-between"><p className="text-3xl sm:text-4xl font-black text-amber-400">{data.segments.B.total}</p><p className="text-amber-600 text-sm sm:text-base font-bold">{data.segments.B.percentage}%</p></div>
                    </div>
                    <div className="bg-gradient-to-br from-sky-950/30 to-zinc-900/50 border border-sky-900/30 rounded-xl sm:rounded-2xl p-3 sm:p-5">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-sky-500 rounded-full" /><p className="text-[9px] sm:text-xs text-sky-500 uppercase tracking-widest font-bold">Segment C</p></div>
                      <h3 className="text-base sm:text-lg font-bold text-white">Newbies</h3>
                      <p className="text-zinc-500 text-[10px] sm:text-xs mb-2 sm:mb-3">New to Protein</p>
                      <div className="flex items-end justify-between"><p className="text-3xl sm:text-4xl font-black text-sky-400">{data.segments.C.total}</p><p className="text-sky-600 text-sm sm:text-base font-bold">{data.segments.C.percentage}%</p></div>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
                <SkeletonCard className="lg:col-span-2 h-48" />
                <div className="grid grid-cols-2 lg:grid-cols-1 gap-3"><SkeletonCard className="h-32" /><SkeletonCard className="h-32" /></div>
              </div>
            )}

            {trackingAnalytics?.hasTrackingData && (
              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-sm sm:text-base font-bold text-zinc-400 uppercase tracking-widest">Audience Insights</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                  {[
                    { icon: '🌍', title: 'Country',        data: trackingAnalytics.countries,  color: 'bg-emerald-500' },
                    { icon: '🏙️', title: 'Top Cities',     data: trackingAnalytics.cities,     color: 'bg-purple-500'  },
                    { icon: '📱', title: 'Device',         data: trackingAnalytics.devices,    color: 'bg-amber-500'   },
                    { icon: '🔗', title: 'Traffic Source', data: trackingAnalytics.utmSources, color: 'bg-sky-500'     },
                  ].map(section => (
                    <div key={section.title} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                      <div className="flex items-center gap-2 mb-3 sm:mb-4"><span className="text-base">{section.icon}</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">{section.title}</h3></div>
                      <BarChart data={section.data} color={section.color} total={currentParticipants.length} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════
            PARTICIPANTS TAB
        ════════════════════════════════════════ */}
        {viewMode === 'participants' && (
          <div className="space-y-4">

            {/* ── 상단 stat cards ── */}
            {(() => {
              const todayStr = getNYCDate(0);
              const isToday = (p: Participant) => {
                if (!p.signed_up_at) return false;
                return new Date(p.signed_up_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === todayStr;
              };
              const kTotal = participants.klaviyo.length;
              const sTotal = participants.supabase.length;

              if (participantsLoading && currentParticipants.length === 0) {
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} className="h-28" />)}
                  </div>
                );
              }

              if (variant === 'type') {
                const todayQuizCounts: Record<string, number> = { brick: 0, chalk: 0, zombie: 0, gambler: 0 };
                currentParticipants.filter(isToday).forEach(p => {
                  const type = p.afterfeel_type || p.sub_reason || '';
                  if (type in todayQuizCounts) todayQuizCounts[type]++;
                });
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
                    <div className="relative bg-gradient-to-br from-zinc-800/80 to-zinc-900 border-2 border-zinc-600 rounded-xl p-3 sm:p-4 overflow-hidden">
                      <p className="text-[9px] sm:text-[10px] text-zinc-400 uppercase tracking-widest mb-0.5 font-bold">Total</p>
                      <p className="text-2xl sm:text-3xl font-black text-white">{currentParticipants.length}</p>
                      <div className="flex gap-1.5 mt-1.5">
                        <span className="text-[9px] text-purple-400 font-semibold bg-purple-500/10 px-1.5 py-0.5 rounded">K {kTotal}</span>
                        <span className="text-[9px] text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">S {sTotal}</span>
                      </div>
                      <p className="text-[9px] text-emerald-400 font-bold mt-1">+{currentParticipants.filter(isToday).length} today</p>
                    </div>
                    {Object.entries(QUIZ_TYPE_LABELS).map(([key, label]) => (
                      <div key={key} className={`bg-gradient-to-br ${label.bgColor} border ${label.borderColor} rounded-xl p-3 sm:p-4`}>
                        <p className={`text-[10px] sm:text-xs ${label.color} uppercase tracking-widest mb-1`}>{label.icon} {key}</p>
                        <p className={`text-xl sm:text-2xl font-black ${label.color}`}>{quizTypeCounts?.[key] ?? 0}</p>
                        <p className="text-[9px] text-zinc-500 mt-1">+{todayQuizCounts[key]} today</p>
                      </div>
                    ))}
                  </div>
                );
              }

              const todayA = currentParticipants.filter(p => isToday(p) && p.segment === 'A').length;
              const otherTotal = activeSource === 'supabase' ? supabaseTotals[oppositeVariant] : klaviyoTotals[oppositeVariant];
              const combinedTotal = otherTotal !== null ? currentParticipants.length + otherTotal : currentParticipants.length;
              const combinedTodayAll = (variant === 'main' ? mergedParticipants : currentParticipants).filter(isToday).length;

              const yesterdayStr = getNYCDate(-1);
              const yesterdayA = currentParticipants.filter(p => {
                if (!p.signed_up_at) return false;
                return new Date(p.signed_up_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === yesterdayStr && p.segment === 'A';
              }).length;

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div className="relative bg-gradient-to-br from-zinc-800/80 to-zinc-900 border-2 border-zinc-600 rounded-xl p-4 overflow-hidden flex flex-col items-center justify-center text-center min-h-[160px]">
                    <p className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold mb-2">Total</p>
                    <p className="text-6xl sm:text-7xl font-black text-white leading-none">{combinedTotal.toLocaleString()}</p>
                    <p className="text-lg sm:text-xl font-black text-emerald-400 mt-2">+{combinedTodayAll} today</p>
                  </div>
                  <div className="bg-emerald-950/30 border border-emerald-900/30 rounded-xl p-4 flex flex-col items-center justify-center text-center min-h-[160px]">
                    <div className="flex items-center justify-between w-full mb-2">
                      <p className="text-[10px] text-emerald-500 uppercase tracking-widest font-bold">Hot Leads</p>
                      <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">TODAY</span>
                    </div>
                    <p className="text-6xl sm:text-7xl font-black text-emerald-400 leading-none">{todayA}</p>
                    {yesterdayA > 0 && (() => {
                      const diff = todayA - yesterdayA;
                      const pct = ((diff / yesterdayA) * 100).toFixed(0);
                      return (
                        <div className="mt-2 flex items-baseline gap-1.5">
                          <span className={`text-base font-black ${diff >= 0 ? 'text-sky-400' : 'text-red-400'}`}>{diff >= 0 ? '▲' : '▼'}{Math.abs(Number(pct))}%</span>
                          <span className="text-xs text-zinc-500">vs yesterday ({yesterdayA})</span>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="bg-sky-950/30 border border-sky-900/30 rounded-xl p-3 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] sm:text-xs text-sky-400 uppercase tracking-widest font-bold">Visitors</p>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => {
                          if (!analyticsData?.rawEvents) return;
                          const todayPV = analyticsData.rawEvents.filter((ev: any) => ev.d === todayStr && ev.n === 'page_view');
                          const vidMap = new Map<string, number>();
                          todayPV.forEach((ev: any) => { const vid = ev.v || ev.s || 'no-id'; vidMap.set(vid, (vidMap.get(vid) || 0) + 1); });
                          const paidVidSet = new Set(todayPV.filter((ev: any) => ev.um === 'paid').map((ev: any) => ev.v || ev.s).filter(Boolean));
                          const orgVidSet  = new Set(todayPV.filter((ev: any) => ev.um !== 'paid').map((ev: any) => ev.v || ev.s).filter(Boolean));
                          const overlap = Array.from(paidVidSet).filter(id => orgVidSet.has(id)).length;
                          alert(`📊 Visitor Debug (오늘)\n\n전체 page_view: ${todayPV.length}개\n유니크 visitor_id: ${vidMap.size}명\nPaid visitors: ${paidVidSet.size}명\nOrganic visitors: ${orgVidSet.size}명\nPaid+Organic 중복: ${overlap}명`);
                        }} className="text-[8px] bg-sky-500/10 text-sky-500 px-1.5 py-0.5 rounded border border-sky-500/20 hover:bg-sky-500/20">Debug</button>
                        <span className="text-[8px] bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded font-bold">TODAY</span>
                      </div>
                    </div>
                    {analyticsData ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs text-red-400 font-bold"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Paid</span>
                          <span className="text-2xl sm:text-3xl font-black text-white">{todayAnalytics.paid.visitors}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Organic</span>
                          <span className="text-2xl sm:text-3xl font-black text-white">{todayAnalytics.organic.visitors}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800">
                          <p className="text-[10px] text-zinc-500 font-semibold">Total</p>
                          <p className="text-base font-black text-zinc-300">{todayAnalytics.visitors}</p>
                        </div>
                      </div>
                    ) : <p className="text-3xl font-black text-zinc-700">—</p>}
                  </div>
                  <div className="bg-purple-950/30 border border-purple-900/30 rounded-xl p-3 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] sm:text-xs text-purple-400 uppercase tracking-widest font-bold">CVR</p>
                      <span className="text-[8px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold">TODAY</span>
                    </div>
                    {analyticsData ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs text-red-400 font-bold"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Paid</span>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[11px] text-zinc-500 font-mono">{todayAnalytics.paid.submits}/{todayAnalytics.paid.visitors}</span>
                            <span className="text-2xl sm:text-3xl font-black text-amber-400">{todayAnalytics.paid.cvr}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Organic</span>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[11px] text-zinc-500 font-mono">{todayAnalytics.organic.submits}/{todayAnalytics.organic.visitors}</span>
                            <span className="text-2xl sm:text-3xl font-black text-amber-400">{todayAnalytics.organic.cvr}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800">
                          <p className="text-[10px] text-zinc-500 font-semibold">Avg CVR <span className="text-zinc-600">(Submits {todayAnalytics.submits})</span></p>
                          <p className="text-base font-black text-purple-300">{todayAnalytics.cvr}</p>
                        </div>
                      </div>
                    ) : <p className="text-3xl font-black text-zinc-700">—</p>}
                  </div>
                </div>
              );
            })()}

            {/* ── Search & Filters ── */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input type="text" placeholder="Search email, country, city, IP..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-zinc-600 placeholder-zinc-600" />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>}
              </div>
              <select value={segmentFilter} onChange={e => setSegmentFilter(e.target.value)} className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-zinc-600 cursor-pointer min-w-[140px]">
                <option value="all">All Segments</option>
                {variant === 'type' ? (
                  <>
                    <option value="brick">🧱 Brick Stomach</option>
                    <option value="chalk">🦷 Chalk Mouth</option>
                    <option value="zombie">🧟 Post-Shake Zombie</option>
                    <option value="gambler">🎰 30-Min Gambler</option>
                  </>
                ) : (
                  <>
                    <option value="A">A - Hot Leads</option>
                    <option value="B">B - Skeptics</option>
                    <option value="C">C - Newbies</option>
                  </>
                )}
              </select>
              <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} className={`px-4 py-2.5 border rounded-xl text-sm flex items-center gap-2 justify-center transition-colors ${showAdvancedFilters || activeFilterCount > 0 ? 'bg-purple-600 border-purple-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                Filters {activeFilterCount > 0 && <span className="bg-white text-purple-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{activeFilterCount}</span>}
              </button>
              <button onClick={exportToCSV} className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 text-sm hover:bg-zinc-800 hover:text-white transition-colors flex items-center gap-2 justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Export
              </button>
              <button onClick={fetchParticipants} disabled={participantsLoading} className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 text-sm hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-2 justify-center">
                <svg className={`w-4 h-4 ${participantsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Refresh
              </button>
            </div>

            {showAdvancedFilters && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Advanced Filters</h3>
                  {activeFilterCount > 0 && <button onClick={clearAllFilters} className="text-xs text-purple-400 hover:text-purple-300">Clear all filters</button>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Reason',       value: reasonFilter,  onChange: setReasonFilter,  options: [{ v: 'all', l: 'All Reasons' },  ...uniqueReasons.map(r  => ({ v: r,  l: r  }))] },
                    { label: 'Country',      value: countryFilter, onChange: setCountryFilter, options: [{ v: '',    l: 'All Countries' }, ...uniqueCountries.map(c => ({ v: c,  l: c  }))] },
                    { label: 'City',         value: cityFilter,    onChange: setCityFilter,    options: [{ v: '',    l: 'All Cities' },    ...uniqueCities.map(c   => ({ v: c,  l: c  }))] },
                    { label: 'Device',       value: deviceFilter,  onChange: setDeviceFilter,  options: [{ v: '',    l: 'All Devices' },   ...uniqueDevices.map(d  => ({ v: d,  l: d  }))] },
                    { label: 'Email Domain', value: domainFilter,  onChange: setDomainFilter,  options: [{ v: '',    l: 'All Domains' },   ...uniqueDomains.map(d  => ({ v: d,  l: `@${d}` }))] },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">{f.label}</label>
                      <select value={f.value} onChange={e => f.onChange(e.target.value)} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-600 cursor-pointer">
                        {f.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </div>
                  ))}
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Date From</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-600" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Date To</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-600" />
                  </div>
                </div>
              </div>
            )}

            {/* ── 참가자 수 + PageSize ── */}
            <div className="flex items-center justify-between">
              <p className="text-zinc-500 text-xs sm:text-sm">
                {filteredParticipants.length === (variant === 'main' ? mergedParticipants.length : currentParticipants.length)
                  ? `${filteredParticipants.length} participants`
                  : `${filteredParticipants.length} of ${variant === 'main' ? mergedParticipants.length : currentParticipants.length} participants`}
                {variant === 'main' && <span className="text-zinc-600 ml-1">(Main {currentParticipants.length} + Quiz {currentOtherParticipants.length})</span>}
                {totalPages > 1 && <span className="text-zinc-600 ml-2">· Page {currentPage}/{totalPages}</span>}
              </p>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded ${variant === 'main' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-400'}`}>{variant === 'main' ? 'Main' : 'Quiz'}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${activeSource === 'klaviyo' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{activeSource === 'klaviyo' ? 'Klaviyo' : 'Supabase'}</span>
                <select value={pageSize} onChange={e => { const v = e.target.value; setPageSize(v === 'all' ? 'all' : Number(v)); setCurrentPage(1); }} className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400 focus:outline-none focus:border-zinc-600 cursor-pointer">
                  <option value={20}>20개</option>
                  <option value={50}>50개</option>
                  <option value={100}>100개</option>
                  <option value="all">전체</option>
                </select>
              </div>
            </div>

            {/* ── Participant list ── */}
            {participantsLoading && currentParticipants.length === 0 ? (
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden">
                {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
              </div>
            ) : filteredParticipants.length === 0 ? (
              <div className="text-center py-16 text-zinc-600">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <p className="text-sm">{searchQuery || activeFilterCount > 0 ? 'No matching participants found.' : 'No participants yet.'}</p>
                {activeFilterCount > 0 && <button onClick={clearAllFilters} className="mt-2 text-purple-400 hover:text-purple-300 text-sm">Clear all filters</button>}
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-zinc-800/80 bg-zinc-900/60">
                          <th className="px-3 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold w-10">#</th>
                          {variant === 'main' && <th className="px-2 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold w-16">LP</th>}
                          {[
                            { f: 'email'       as const, l: 'Email' },
                            { f: 'segment'     as const, l: variant === 'type' ? 'Type' : 'Seg' },
                            { f: null,                   l: 'Source' },
                            { f: 'country'     as const, l: 'Location' },
                            { f: null,                   l: 'Device' },
                            { f: 'signed_up_at' as const, l: 'Date' },
                          ].map(col => (
                            <th key={col.l} className={`px-3 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold ${col.f ? 'cursor-pointer hover:text-zinc-300 select-none' : ''}`} onClick={() => col.f && handleSort(col.f)}>
                              <span className="flex items-center gap-1">{col.l}{col.f && sortField === col.f && <span className="text-white">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                            </th>
                          ))}
                          <th className="px-3 py-3 w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {pagedParticipants.map((p, i) => {
                          const vTag = (p as any)._variantTag as 'main' | 'type' | undefined;
                          const rowNum = pageSize === 'all' ? i + 1 : (currentPage - 1) * (pageSize as number) + i + 1;
                          const segKey = vTag === 'type' ? (p.afterfeel_type || p.sub_reason) : p.segment;
                          return (
                            <tr key={p.id || i} className="border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors">
                              <td className="px-3 py-3 text-xs text-zinc-600 font-mono">{rowNum}</td>
                              {variant === 'main' && (
                                <td className="px-2 py-3">
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${vTag === 'main' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-400'}`}>{vTag === 'main' ? 'Main' : 'Quiz'}</span>
                                </td>
                              )}
                              <td className="px-3 py-3 text-sm text-white font-medium max-w-[180px] truncate">{p.email}</td>
                              <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md border ${segColor(segKey)}`}>{segLabel(p.segment, p)}</span></td>
                              <td className="px-3 py-3">{(() => { const s = trafficSourceLabel(p); return <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md border ${s.color}`}>{s.label}</span>; })()}</td>
                              <td className="px-3 py-3 text-xs text-zinc-300 whitespace-nowrap">{p.city && p.country ? `${p.city}, ${p.country}` : p.country || '—'}</td>
                              <td className="px-3 py-3 text-sm whitespace-nowrap">{deviceIcon(p.device_type)}</td>
                              <td className="px-3 py-3 text-xs text-zinc-500 font-mono whitespace-nowrap">{fmtDate(p.signed_up_at)}</td>
                              <td className="px-3 py-3">
                                <button onClick={() => setSelectedParticipant(p)} className="text-zinc-600 hover:text-white transition-colors">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4"><PaginationUI /></div>
                </div>

                {/* Mobile Cards */}
                <div className="sm:hidden space-y-2">
                  {pagedParticipants.map((p, i) => {
                    const vTag = (p as any)._variantTag as 'main' | 'type' | undefined;
                    const segKey = vTag === 'type' ? (p.afterfeel_type || p.sub_reason) : p.segment;
                    return (
                      <div key={p.id || i} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-3 space-y-2" onClick={() => setSelectedParticipant(p)}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 flex items-center gap-1.5">
                            {variant === 'main' && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${vTag === 'main' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-400'}`}>{vTag === 'main' ? 'Main' : 'Quiz'}</span>}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">{p.email}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {p.city && <span className="text-[10px] text-zinc-500">{p.city}, {p.country}</span>}
                                {p.device_type && <span className="text-xs">{deviceIcon(p.device_type)}</span>}
                              </div>
                            </div>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md border shrink-0 ${segColor(segKey)}`}>{segLabel(p.segment, p)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          {(() => { const s = trafficSourceLabel(p); return <span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded border ${s.color}`}>{s.label}</span>; })()}
                          <span className="text-zinc-600 font-mono whitespace-nowrap ml-auto">{fmtDate(p.signed_up_at)}</span>
                        </div>
                      </div>
                    );
                  })}
                  <PaginationUI />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Detail Modal ── */}
        {selectedParticipant && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedParticipant(null)}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-5 sm:p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-bold text-white">{selectedParticipant.email}</p>
                  {selectedParticipant.name && <p className="text-sm text-zinc-400">{selectedParticipant.name}</p>}
                </div>
                <button onClick={() => setSelectedParticipant(null)} className="text-zinc-500 hover:text-white p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-lg border ${segColor(variant === 'type' ? (selectedParticipant.afterfeel_type || selectedParticipant.sub_reason) : selectedParticipant.segment)}`}>
                  {segLabel(selectedParticipant.segment, selectedParticipant)}
                </span>
                {(() => { const s = trafficSourceLabel(selectedParticipant); return <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-lg border ${s.color}`}>{s.label}</span>; })()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { l: 'Country',        v: selectedParticipant.country },
                  { l: 'Region',         v: selectedParticipant.region },
                  { l: 'City',           v: selectedParticipant.city },
                  { l: 'Device',         v: selectedParticipant.device_type },
                  { l: 'Language',       v: selectedParticipant.language },
                  { l: 'Timezone',       v: selectedParticipant.timezone },
                  { l: 'IP Address',     v: selectedParticipant.ip_address },
                  { l: 'Referrer',       v: selectedParticipant.referrer },
                  { l: 'UTM Source',     v: selectedParticipant.utm_source },
                  { l: 'UTM Medium',     v: selectedParticipant.utm_medium },
                  { l: 'UTM Campaign',   v: selectedParticipant.utm_campaign },
                  { l: 'Source',         v: selectedParticipant.source },
                  { l: 'Afterfeel Type', v: selectedParticipant.afterfeel_type },
                  { l: 'Signed Up',      v: fmtDate(selectedParticipant.signed_up_at) },
                ].map(item => (
                  <div key={item.l} className="bg-zinc-800/50 rounded-lg p-2.5">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">{item.l}</p>
                    <p className="text-xs text-white font-medium truncate">{item.v || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
            ANALYTICS TAB
        ════════════════════════════════════════ */}
        {viewMode === 'analytics' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm sm:text-base font-bold text-zinc-400 uppercase tracking-widest">Funnel Analytics</h2>
                <span className={`text-xs px-2 py-0.5 rounded border ${variant === 'main' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-purple-500/10 text-purple-400 border-purple-500/30'}`}>{variant === 'main' ? 'Main Teaser' : 'Quiz Type'}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { key: 'all',         label: 'All'        },
                  { key: 'today',       label: 'Today'      },
                  { key: 'yesterday',   label: 'Yesterday'  },
                  { key: 'last_7_days', label: 'Last 7D'    },
                  { key: 'this_week',   label: 'This Week'  },
                  { key: 'this_month',  label: 'This Month' },
                  { key: 'last_month',  label: 'Last Month' },
                ].map(opt => (
                  <button key={opt.key} onClick={() => { setAnalyticsPeriod(opt.key); setAnalyticsDateFrom(''); setAnalyticsDateTo(''); }} className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-all ${analyticsPeriod === opt.key ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>{opt.label}</button>
                ))}
                {availableMonths.length > 1 && (
                  <select value={analyticsPeriod.match(/^\d{4}-\d{2}$/) ? analyticsPeriod : ''} onChange={e => { if (e.target.value) setAnalyticsPeriod(e.target.value); }} className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-[10px] sm:text-xs text-zinc-400 focus:outline-none cursor-pointer">
                    <option value="">Month...</option>
                    {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                <button onClick={fetchAnalytics} disabled={analyticsLoading} className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 text-xs hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-1.5">
                  <svg className={`w-3.5 h-3.5 ${analyticsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Refresh
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Range:</label>
                  <input type="date" value={analyticsDateFrom} onChange={e => { setAnalyticsDateFrom(e.target.value); if (e.target.value && analyticsDateTo) setAnalyticsPeriod('custom_range'); }} className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-zinc-600" />
                  <span className="text-zinc-600 text-xs">→</span>
                  <input type="date" value={analyticsDateTo} onChange={e => { setAnalyticsDateTo(e.target.value); if (analyticsDateFrom && e.target.value) setAnalyticsPeriod('custom_range'); }} className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-zinc-600" />
                  {analyticsPeriod === 'custom_range' && <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">Custom</span>}
                </div>
                <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
                  {([{ key: 'all' as const, label: 'All', icon: '🌐' }, { key: 'paid' as const, label: 'Paid', icon: '💰' }, { key: 'organic' as const, label: 'Organic', icon: '🌱' }]).map(opt => (
                    <button key={opt.key} onClick={() => setTrafficFilter(opt.key)} className={`px-2.5 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 ${trafficFilter === opt.key ? (opt.key === 'paid' ? 'bg-red-500 text-white' : opt.key === 'organic' ? 'bg-emerald-500 text-white' : 'bg-white text-black') : 'text-zinc-500 hover:text-zinc-300'}`}>
                      <span>{opt.icon}</span>{opt.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowIPFilter(v => !v)} className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${excludeIPs.length > 0 ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'}`}>
                  🚫 IP 제외 {excludeIPs.length > 0 && <span className="bg-red-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">{excludeIPs.length}</span>}
                </button>
              </div>

              {showIPFilter && (
                <div className="bg-zinc-900/60 border border-zinc-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-white">🚫 제외 IP 관리 <span className="text-zinc-500 font-normal">(테스트/사무실 IP)</span></p>
                    {excludeIPs.length > 0 && <button onClick={() => { setExcludeIPs([]); localStorage.setItem('piilk_exclude_ips', '[]'); }} className="text-[10px] text-red-400 hover:text-red-300">전체 삭제</button>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] text-zinc-500">빠른 추가:</span>
                    <button onClick={() => {
                      const botIPs = ['209.38', '64.23', '137.184', '146.190', '24.199', '134.199', '147.182', '165.225', '143.110', '176.3', '172.56'];
                      const newIPs = Array.from(new Set([...excludeIPs, ...botIPs]));
                      setExcludeIPs(newIPs);
                      localStorage.setItem('piilk_exclude_ips', JSON.stringify(newIPs));
                    }} className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold hover:bg-orange-500/30">
                      🤖 DigitalOcean 봇 ({['209.38', '64.23', '137.184', '146.190', '24.199', '134.199', '147.182', '165.225', '143.110', '176.3', '172.56'].filter(ip => !excludeIPs.includes(ip)).length}개 추가)
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={excludeIPInput} onChange={e => setExcludeIPInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && excludeIPInput.trim()) {
                          const newEntries = excludeIPInput.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
                          const newIPs = Array.from(new Set([...excludeIPs, ...newEntries]));
                          setExcludeIPs(newIPs);
                          localStorage.setItem('piilk_exclude_ips', JSON.stringify(newIPs));
                          setExcludeIPInput('');
                        }
                      }}
                      placeholder="예: 123.456 또는 여러 IP를 줄바꿈/쉼표로 입력"
                      className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
                    />
                    <button onClick={() => {
                      if (!excludeIPInput.trim()) return;
                      const newEntries = excludeIPInput.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
                      const newIPs = Array.from(new Set([...excludeIPs, ...newEntries]));
                      setExcludeIPs(newIPs);
                      localStorage.setItem('piilk_exclude_ips', JSON.stringify(newIPs));
                      setExcludeIPInput('');
                    }} className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-500">추가</button>
                  </div>
                  {excludeIPs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {excludeIPs.map((ip, i) => (
                        <span key={i} className="flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-mono px-2 py-0.5 rounded-full">
                          {ip}
                          <button onClick={() => {
                            const newIPs = excludeIPs.filter((_, j) => j !== i);
                            setExcludeIPs(newIPs);
                            localStorage.setItem('piilk_exclude_ips', JSON.stringify(newIPs));
                          }} className="text-red-500 hover:text-red-300 ml-0.5">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-zinc-600">부분 IP 입력 가능 (예: <span className="font-mono text-zinc-500">192.168</span>) · 여러 IP 동시 입력 가능 · 브라우저에 저장됩니다</p>
                </div>
              )}
            </div>

            {/* Meta Ads Upload */}
            <div className="flex items-center gap-3">
              <input ref={metaFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const XLSX = await import('xlsx');
                  const buf = await file.arrayBuffer();
                  const wb = XLSX.read(buf, { type: 'array' });
                  const ws = wb.Sheets[wb.SheetNames[0]];
                  const rows: any[] = XLSX.utils.sheet_to_json(ws);
                  const parsed = rows.map((r: any) => {
                    const name = r['광고 이름'] || r['Ad Name'] || '';
                    const nl = name.toLowerCase();
                    return {
                      adName: name, date: r['보고 시작'] || '', status: r['광고 게재'] || '',
                      results: Number(r['결과'] || 0) || 0, reach: Number(r['도달'] || 0) || 0,
                      spend: Number(r['지출 금액 (USD)'] || 0) || 0, impressions: Number(r['노출'] || 0) || 0,
                      linkClicks: Number(r['링크 클릭'] || 0) || 0, cpc: Number(r['CPC(링크 클릭당 비용) (USD)'] || 0) || 0,
                      ctrLink: Number(r['CTR(링크 클릭률)'] || 0) || 0, allClicks: Number(r['클릭(전체)'] || 0) || 0,
                      landingPageViews: Number(r['랜딩 페이지 조회'] || 0) || 0,
                      variant: nl.includes('_main') || nl.includes('main') ? 'main' : nl.includes('_type') || nl.includes('type') ? 'type' : 'unknown',
                    };
                  }).filter((r: any) => r.spend > 0 || r.impressions > 0);
                  setMetaAdsData(parsed);
                  if (parsed.length > 0) setMetaAdsDate(parsed[0].date);
                } catch { alert('파일 파싱 실패'); }
              }} className="hidden" />
              <button onClick={() => metaFileRef.current?.click()} className="px-3 py-1.5 bg-blue-600/20 border border-blue-600/30 rounded-lg text-xs text-blue-400 hover:bg-blue-600/30 transition-colors flex items-center gap-1.5">
                <span>📊</span>Upload Meta Ads Report
              </button>
              {metaAdsDate && <span className="text-[10px] text-blue-400">✓ {metaAdsDate} ({metaAdsData.length} ads)</span>}
            </div>

            {analyticsLoading && !analyticsData ? (
              <div className="space-y-3">
                <SkeletonCard className="h-32" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2"><SkeletonCard className="h-20" /><SkeletonCard className="h-20" /><SkeletonCard className="h-20" /><SkeletonCard className="h-20" /></div>
                <SkeletonCard className="h-64" />
              </div>
            ) : analyticsData ? (
              <>
                <UtmSourceStatsSection />

                {metaAdsData.length > 0 && (() => {
                  const metaTotal = metaAdsData.reduce((acc: any, ad: any) => ({
                    spend: acc.spend + ad.spend, impressions: acc.impressions + ad.impressions,
                    linkClicks: acc.linkClicks + ad.linkClicks, landingPageViews: acc.landingPageViews + ad.landingPageViews,
                    results: acc.results + ad.results,
                  }), { spend: 0, impressions: 0, linkClicks: 0, landingPageViews: 0, results: 0 });
                  const ourSubmits = currentParticipants.filter(p => p.signed_up_at?.slice(0, 10) === metaAdsDate && normalizeUtmSource(p.utm_source) === 'meta').length;
                  return (
                    <div className="bg-gradient-to-br from-blue-950/30 to-zinc-900/60 border border-blue-900/40 rounded-xl p-4 sm:p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-base">📊</span>
                          <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Meta Ads vs Dashboard</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">{metaAdsDate}</span>
                        </div>
                        <button onClick={() => { setMetaAdsData([]); setMetaAdsDate(''); }} className="text-[10px] text-zinc-500 hover:text-red-400">✕ Remove</button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                        <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3"><p className="text-[8px] text-zinc-500 uppercase font-semibold mb-0.5">Meta Spend</p><p className="text-xl font-black text-white">${metaTotal.spend.toFixed(2)}</p></div>
                        <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3"><p className="text-[8px] text-zinc-500 uppercase font-semibold mb-0.5">Link Clicks</p><p className="text-xl font-black text-white">{metaTotal.linkClicks}</p></div>
                        <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3"><p className="text-[8px] text-zinc-500 uppercase font-semibold mb-0.5">LP Views</p><p className="text-xl font-black text-amber-400">{metaTotal.landingPageViews}</p></div>
                        <div className="bg-emerald-950/30 border border-emerald-900/30 rounded-lg p-3"><p className="text-[8px] text-emerald-500 uppercase font-semibold mb-0.5">Our Submits</p><p className="text-xl font-black text-emerald-400">{ourSubmits}</p></div>
                      </div>
                      <div className="bg-zinc-800/30 rounded-lg p-3 mb-4">
                        <p className="text-[9px] text-zinc-500 uppercase font-semibold mb-2">Full Funnel</p>
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="text-zinc-400">Impressions <span className="text-white font-bold">{metaTotal.impressions.toLocaleString()}</span></span>
                          <span className="text-zinc-600">→</span>
                          <span className="text-zinc-400">Clicks <span className="text-white font-bold">{metaTotal.linkClicks}</span></span>
                          <span className="text-zinc-600">→</span>
                          <span className="text-zinc-400">LP Views <span className="text-amber-400 font-bold">{metaTotal.landingPageViews}</span></span>
                          <span className="text-zinc-600">→</span>
                          <span className="text-zinc-400">Submits <span className="text-emerald-400 font-bold">{ourSubmits}</span></span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-[10px]">
                          <span className="text-zinc-500">CTR: <span className="text-white font-bold">{metaTotal.impressions > 0 ? ((metaTotal.linkClicks / metaTotal.impressions) * 100).toFixed(2) : '0'}%</span></span>
                          <span className="text-zinc-500">Click→Submit: <span className="text-emerald-400 font-bold">{metaTotal.linkClicks > 0 ? ((ourSubmits / metaTotal.linkClicks) * 100).toFixed(1) : '0'}%</span></span>
                          <span className="text-zinc-500">CPA: <span className="text-amber-400 font-bold">{ourSubmits > 0 ? `$${(metaTotal.spend / ourSubmits).toFixed(2)}` : 'N/A'}</span></span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead><tr className="border-b border-zinc-800/80">
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold">Ad</th>
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold">Variant</th>
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold text-right">Spend</th>
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold text-right">Clicks</th>
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold text-right">LP Views</th>
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold text-right">CTR</th>
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold text-right">Results</th>
                          </tr></thead>
                          <tbody>
                            {metaAdsData.map((ad: any, i: number) => (
                              <tr key={i} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                                <td className="px-2 py-1.5 text-xs text-white max-w-[180px] truncate">{ad.adName}</td>
                                <td className="px-2 py-1.5"><span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${ad.variant === 'main' ? 'bg-emerald-500/20 text-emerald-400' : ad.variant === 'type' ? 'bg-purple-500/20 text-purple-400' : 'bg-zinc-700/30 text-zinc-500'}`}>{ad.variant}</span></td>
                                <td className="px-2 py-1.5 text-xs text-right font-mono">${ad.spend.toFixed(2)}</td>
                                <td className="px-2 py-1.5 text-xs text-zinc-300 text-right font-mono">{ad.linkClicks}</td>
                                <td className="px-2 py-1.5 text-xs text-amber-400 text-right font-mono">{ad.landingPageViews}</td>
                                <td className="px-2 py-1.5 text-xs text-zinc-400 text-right font-mono">{ad.ctrLink?.toFixed(2)}%</td>
                                <td className="px-2 py-1.5 text-xs text-emerald-400 text-right font-mono font-bold">{ad.results}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                {filteredAnalytics?.paidVsOrganic && (
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
                    <div className="flex items-center gap-2 mb-4"><span className="text-base">💰</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Paid vs Organic</h3></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { key: 'paid'    as const, label: 'Paid',    dot: 'bg-red-500',     border: 'border-red-900/30',     bg: 'from-red-950/20',     text: 'text-red-400'    },
                        { key: 'organic' as const, label: 'Organic', dot: 'bg-emerald-500', border: 'border-emerald-900/30', bg: 'from-emerald-950/20', text: 'text-emerald-400' },
                      ].map(side => (
                        <div key={side.key} className={`bg-gradient-to-br ${side.bg} to-zinc-900/60 border ${side.border} rounded-xl p-4`}>
                          <div className="flex items-center gap-2 mb-3"><span className={`w-2.5 h-2.5 rounded-full ${side.dot}`} /><span className={`text-sm font-bold ${side.text}`}>{side.label}</span></div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="text-center"><p className="text-2xl font-black text-white">{filteredAnalytics.paidVsOrganic[side.key].views}</p><p className="text-[8px] text-zinc-500 uppercase mt-1">Views</p></div>
                            <div className="text-center"><p className="text-2xl font-black text-emerald-400">{filteredAnalytics.paidVsOrganic[side.key].submits}</p><p className="text-[8px] text-zinc-500 uppercase mt-1">Submits</p></div>
                            <div className="text-center"><p className={`text-2xl font-black ${Number(filteredAnalytics.paidVsOrganic[side.key].cvr) > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>{filteredAnalytics.paidVsOrganic[side.key].cvr}%</p><p className="text-[8px] text-zinc-500 uppercase mt-1">CVR</p></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 sm:p-4"><p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest mb-1">Visitors</p><p className="text-xl sm:text-2xl font-black text-white">{filteredAnalytics?.totalVisitors}</p></div>
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 sm:p-4"><p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest mb-1">Sessions</p><p className="text-xl sm:text-2xl font-black text-white">{filteredAnalytics?.totalSessions}</p></div>
                  <div className="bg-emerald-950/30 border border-emerald-900/30 rounded-xl p-3 sm:p-4"><p className="text-[10px] sm:text-xs text-emerald-500 uppercase tracking-widest mb-1">Submits</p><p className="text-xl sm:text-2xl font-black text-emerald-400">{filteredAnalytics?.funnel?.step4_submit || 0}</p></div>
                  <div className="bg-purple-950/30 border border-purple-900/30 rounded-xl p-3 sm:p-4"><p className="text-[10px] sm:text-xs text-purple-500 uppercase tracking-widest mb-1">CVR</p><p className="text-xl sm:text-2xl font-black text-purple-400">{filteredAnalytics?.funnel?.page_view > 0 ? ((filteredAnalytics.funnel.step4_submit / filteredAnalytics.funnel.page_view) * 100).toFixed(1) : '0'}%</p></div>
                </div>

                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-4 sm:mb-6"><span className="text-base">🎯</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Conversion Funnel</h3></div>
                  <div className="space-y-3">
                    {[
                      { key: 'page_view',         label: 'Page View',   desc: 'Landed on site',        color: 'bg-zinc-500'    },
                      { key: 'step1_cta_click',   label: 'Get in Line', desc: 'Clicked CTA',           color: 'bg-sky-500'     },
                      { key: 'step2_answer',      label: 'Answered',    desc: 'Selected Yes/No/Never', color: 'bg-amber-500'   },
                      { key: 'step3_email_focus', label: 'Email Focus', desc: 'Started typing email',  color: 'bg-purple-500'  },
                      { key: 'step4_submit',      label: 'Submitted',   desc: 'Completed signup',      color: 'bg-emerald-500' },
                    ].map((step, idx) => {
                      const count = filteredAnalytics?.funnel?.[step.key] || 0;
                      const pv = filteredAnalytics?.funnel?.page_view || 1;
                      const prevKeys = ['page_view', 'step1_cta_click', 'step2_answer', 'step3_email_focus', 'step4_submit'];
                      const prev = idx === 0 ? count : (filteredAnalytics?.funnel?.[prevKeys[idx - 1]] || 1);
                      const pct = pv > 0 ? (count / pv) * 100 : 0;
                      const drop = idx > 0 && prev > 0 ? ((1 - count / prev) * 100).toFixed(0) : null;
                      return (
                        <div key={step.key}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${step.color}`} />
                              <span className="text-xs sm:text-sm font-semibold text-white">{step.label}</span>
                              <span className="text-[10px] text-zinc-600 hidden sm:inline">{step.desc}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm sm:text-base font-black text-white">{count}</span>
                              {drop && Number(drop) > 0 && <span className="text-[10px] text-red-400 font-medium">-{drop}%</span>}
                            </div>
                          </div>
                          <div className="h-6 sm:h-8 bg-zinc-800/50 rounded-lg overflow-hidden">
                            <div className={`h-full rounded-lg ${step.color} transition-all duration-700 flex items-center px-2`} style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}>
                              {pct >= 10 && <span className="text-[10px] sm:text-xs text-white font-bold">{pct.toFixed(0)}%</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {filteredAnalytics?.utmPerformance?.length > 0 && (
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
                    <div className="flex items-center gap-2 mb-4"><span className="text-base">🔗</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">UTM Source Performance</h3></div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead><tr className="border-b border-zinc-800/80">
                          {['Source', 'Views', 'Submits', 'CVR'].map(h => <th key={h} className={`px-3 py-2 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold ${h !== 'Source' ? 'text-right' : ''}`}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {filteredAnalytics.utmPerformance.map((utm: any) => (
                            <tr key={utm.source} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                              <td className="px-3 py-2.5 text-sm text-white font-medium">{utm.source}</td>
                              <td className="px-3 py-2.5 text-sm text-zinc-400 text-right font-mono">{utm.views}</td>
                              <td className="px-3 py-2.5 text-sm text-emerald-400 text-right font-mono font-bold">{utm.submits}</td>
                              <td className="px-3 py-2.5 text-right"><span className={`text-sm font-bold font-mono ${Number(utm.cvr) > 5 ? 'text-emerald-400' : Number(utm.cvr) > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>{utm.cvr}%</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {filteredAnalytics?.campaignPerformance?.length > 0 && (
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
                    <div className="flex items-center gap-2 mb-4"><span className="text-base">🎯</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Campaign Performance</h3></div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead><tr className="border-b border-zinc-800/80">
                          {['Campaign', 'Source', 'Type', 'Views', 'Submits', 'CVR'].map(h => <th key={h} className={`px-3 py-2 text-[10px] text-zinc-500 uppercase font-semibold ${['Views','Submits','CVR'].includes(h) ? 'text-right' : ''}`}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {filteredAnalytics.campaignPerformance.map((c: any) => (
                            <tr key={c.campaign} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                              <td className="px-3 py-2.5 text-sm text-white max-w-[200px] truncate" title={c.campaign}>{c.campaign}</td>
                              <td className="px-3 py-2.5 text-xs text-zinc-400">{c.source}</td>
                              <td className="px-3 py-2.5">{c.isPaid ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold">PAID</span> : <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">ORG</span>}</td>
                              <td className="px-3 py-2.5 text-sm text-zinc-400 text-right font-mono">{c.views}</td>
                              <td className="px-3 py-2.5 text-sm text-emerald-400 text-right font-mono font-bold">{c.submits}</td>
                              <td className="px-3 py-2.5 text-right"><span className={`text-sm font-bold font-mono ${Number(c.cvr) > 5 ? 'text-emerald-400' : Number(c.cvr) > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>{c.cvr}%</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {filteredAnalytics?.hourly?.some((h: any) => h.count > 0) && (
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-4"><span className="text-base">🕒</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Signup by Hour</h3></div>
                    <div className="h-24 sm:h-32 flex items-end gap-[2px]">
                      {filteredAnalytics.hourly.map((h: any) => {
                        const maxH = Math.max(...filteredAnalytics.hourly.map((x: any) => x.count), 1);
                        return (
                          <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">{h.label}: {h.count}</div>
                            <div className="w-full bg-purple-500/60 group-hover:bg-purple-400 rounded-t-sm transition-all" style={{ height: `${Math.max((h.count / maxH) * 100, h.count > 0 ? 3 : 0)}%` }} />
                            {h.hour % 4 === 0 && <span className="text-[7px] text-zinc-600 mt-0.5 font-mono">{h.hour}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-4"><span className="text-base">📅</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Period Breakdown</h3></div>
                  {filteredAnalytics?.daily?.length > 0 && (
                    <div className="mb-6">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-2">Daily</p>
                      <div className="overflow-x-auto max-h-60 overflow-y-auto">
                        <table className="w-full text-left">
                          <thead className="sticky top-0 bg-zinc-900"><tr className="border-b border-zinc-800/80">
                            {['Date', 'Views', 'CTA', 'Submits'].map(h => <th key={h} className={`px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold ${h !== 'Date' ? 'text-right' : ''}`}>{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {[...filteredAnalytics.daily].reverse().map((d: any) => (
                              <tr key={d.date} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                                <td className="px-3 py-1.5 text-xs text-zinc-300 font-mono">{d.date}</td>
                                <td className="px-3 py-1.5 text-xs text-zinc-400 text-right font-mono">{d.page_view || 0}</td>
                                <td className="px-3 py-1.5 text-xs text-zinc-400 text-right font-mono">{d.step1_cta_click || 0}</td>
                                <td className="px-3 py-1.5 text-xs text-emerald-400 text-right font-mono font-bold">{d.step4_submit || 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {filteredAnalytics?.weekly?.length > 0 && (
                    <div className="mb-6">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-2">Weekly</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead><tr className="border-b border-zinc-800/80">
                            {['Week', 'Views', 'Submits', 'CVR'].map(h => <th key={h} className={`px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold ${h !== 'Week' ? 'text-right' : ''}`}>{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {[...filteredAnalytics.weekly].reverse().map((w: any) => (
                              <tr key={w.week} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                                <td className="px-3 py-1.5 text-xs text-zinc-300 font-mono">{w.week}</td>
                                <td className="px-3 py-1.5 text-xs text-zinc-400 text-right font-mono">{w.views}</td>
                                <td className="px-3 py-1.5 text-xs text-emerald-400 text-right font-mono font-bold">{w.submits}</td>
                                <td className="px-3 py-1.5 text-xs text-purple-400 text-right font-mono">{w.views > 0 ? ((w.submits / w.views) * 100).toFixed(1) : '0'}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredAnalytics?.weekday && (
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-2">By Weekday</p>
                        <div className="space-y-1">
                          {filteredAnalytics.weekday.map((wd: any) => {
                            const mv = Math.max(...filteredAnalytics.weekday.map((x: any) => x.views), 1);
                            return (
                              <div key={wd.day} className="flex items-center gap-2">
                                <span className="text-[10px] text-zinc-400 w-8 text-right font-mono">{wd.day}</span>
                                <div className="flex-1 h-5 bg-zinc-800/50 rounded-md overflow-hidden relative">
                                  <div className="h-full rounded-md bg-sky-500/70 transition-all" style={{ width: `${mv > 0 ? Math.max((wd.views / mv) * 100, wd.views > 0 ? 2 : 0) : 0}%` }} />
                                  <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white font-medium">{wd.views}v / {wd.submits}s</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {filteredAnalytics?.monthly?.length > 0 && (
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-2">By Month</p>
                        <div className="space-y-1">
                          {filteredAnalytics.monthly.map((m: any) => {
                            const mv = Math.max(...filteredAnalytics.monthly.map((x: any) => x.views), 1);
                            return (
                              <div key={m.month} className="flex items-center gap-2">
                                <span className="text-[10px] text-zinc-400 w-16 text-right font-mono">{m.month}</span>
                                <div className="flex-1 h-5 bg-zinc-800/50 rounded-md overflow-hidden relative">
                                  <div className="h-full rounded-md bg-amber-500/70 transition-all" style={{ width: `${mv > 0 ? Math.max((m.views / mv) * 100, m.views > 0 ? 2 : 0) : 0}%` }} />
                                  <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white font-medium">{m.views}v / {m.submits}s</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                  {filteredAnalytics?.segmentDistribution && Object.keys(filteredAnalytics.segmentDistribution).length > 0 && (
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                      <div className="flex items-center gap-2 mb-3"><span className="text-base">📊</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Segment Split (Events)</h3></div>
                      <div className="space-y-2">
                        {Object.entries(filteredAnalytics.segmentDistribution).sort((a: any, b: any) => b[1] - a[1]).map(([seg, count]: any) => {
                          const total = Object.values(filteredAnalytics.segmentDistribution).reduce((s: any, v: any) => s + v, 0) as number;
                          const sn: Record<string, string> = { A: 'Hot Leads', B: 'Skeptic', C: 'Newbie' };
                          const sc: Record<string, string> = { A: 'bg-emerald-500', B: 'bg-amber-500', C: 'bg-sky-500' };
                          return (
                            <div key={seg} className="flex items-center gap-2">
                              <span className="text-xs text-zinc-400 w-16 text-right">{sn[seg] || seg}</span>
                              <div className="flex-1 h-5 bg-zinc-800/50 rounded-md overflow-hidden relative">
                                <div className={`h-full rounded-md ${sc[seg] || 'bg-zinc-500'}`} style={{ width: `${total > 0 ? Math.max((count / total) * 100, 2) : 0}%` }} />
                                <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white font-medium">{count} ({total > 0 ? ((count / total) * 100).toFixed(0) : 0}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {filteredAnalytics?.reasonDistribution && Object.keys(filteredAnalytics.reasonDistribution).length > 0 && (
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                      <div className="flex items-center gap-2 mb-3"><span className="text-base">🔍</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Pain Points (Seg A)</h3></div>
                      <div className="space-y-2">
                        {Object.entries(filteredAnalytics.reasonDistribution).sort((a: any, b: any) => b[1] - a[1]).map(([reason, count]: any) => {
                          const total = Object.values(filteredAnalytics.reasonDistribution).reduce((s: any, v: any) => s + v, 0) as number;
                          return (
                            <div key={reason} className="flex items-center gap-2">
                              <span className="text-xs text-zinc-400 w-20 text-right capitalize">{reason}</span>
                              <div className="flex-1 h-5 bg-zinc-800/50 rounded-md overflow-hidden relative">
                                <div className="h-full rounded-md bg-emerald-500" style={{ width: `${total > 0 ? Math.max((count / total) * 100, 2) : 0}%` }} />
                                <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white font-medium">{count} ({total > 0 ? ((count / total) * 100).toFixed(0) : 0}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center text-zinc-500 py-12">No analytics data yet. Visit teaser site to start collecting.</div>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <footer className="text-center pt-4 sm:pt-6 border-t border-zinc-900/50">
          <p className="text-[10px] sm:text-xs text-zinc-700">PIILK Internal — Confidential</p>
        </footer>

      </div>
    </main>
  );
}
const META_SOURCES = ['fb', 'ig', 'meta', 'facebook', 'instagram'];

function normalizeUtmSource(source: string | undefined | null): string {
  if (!source) return 'Direct';
  const lower = source.toLowerCase().trim();
  if (META_SOURCES.includes(lower)) return 'meta';
  return source;
}

function getRawPlatformLabel(source: string | undefined | null): string {
  if (!source) return 'Direct';
  const lower = source.toLowerCase().trim();
  if (lower === 'fb' || lower === 'facebook') return 'Facebook';
  if (lower === 'ig' || lower === 'instagram') return 'Instagram';
  if (lower === 'meta') return 'Meta (unspecified)';
  return source;
}

function getNYCDate(offset = 0): string {
  const n = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  n.setDate(n.getDate() + offset);
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

/* ─────────────────────────── Quiz Type Labels ─────────────────────────── */

const QUIZ_TYPE_LABELS: Record<string, { name: string; icon: string; color: string; bgColor: string; borderColor: string }> = {
  brick:   { name: 'Brick Stomach',     icon: '🧱', color: 'text-orange-400', bgColor: 'from-orange-950/40 to-zinc-900/60', borderColor: 'border-orange-900/40' },
  chalk:   { name: 'Chalk Mouth',       icon: '🦷', color: 'text-slate-300',  bgColor: 'from-slate-900/40 to-zinc-900/60',  borderColor: 'border-slate-700/40'  },
  zombie:  { name: 'Post-Shake Zombie', icon: '🧟', color: 'text-green-400',  bgColor: 'from-green-950/40 to-zinc-900/60',  borderColor: 'border-green-900/40'  },
  gambler: { name: '30-Min Gambler',    icon: '🎰', color: 'text-yellow-400', bgColor: 'from-yellow-950/40 to-zinc-900/60', borderColor: 'border-yellow-900/40' },
};

const UTM_SOURCE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  meta:       { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/30',   dot: 'bg-blue-500'   },
  tonic:      { bg: 'bg-pink-500/10',   text: 'text-pink-400',   border: 'border-pink-500/30',   dot: 'bg-pink-500'   },
  '10almonds':{ bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/30',  dot: 'bg-amber-500'  },
  Direct:     { bg: 'bg-zinc-500/10',   text: 'text-zinc-400',   border: 'border-zinc-500/30',   dot: 'bg-zinc-500'   },
};

function getUtmColor(source: string) {
  return UTM_SOURCE_COLORS[source] || { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-500' };
}

/* ─────────────────────────── Component ─────────────────────────── */

export default function DashboardPage() {
  // Auth
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // Variant tab
  const [variant, setVariant] = useState<'main' | 'type'>('main');

  // Dashboard data
  const [supabaseData, setSupabaseData] = useState<DashboardData | null>(null);
  const [klaviyoData, setKlaviyoData] = useState<DashboardData | null>(null);
  const [activeSource, setActiveSource] = useState<'klaviyo' | 'supabase'>('supabase');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  // ✅ 두 variant의 supabase/klaviyo total 캐싱 (null = 아직 미로드)
  const [supabaseTotals, setSupabaseTotals] = useState<{ main: number | null; type: number | null }>({ main: null, type: null });
  const [klaviyoTotals, setKlaviyoTotals] = useState<{ main: number | null; type: number | null }>({ main: null, type: null });

  // View mode
  const [viewMode, setViewMode] = useState<'overview' | 'participants' | 'analytics'>('participants');

  // Analytics
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<string>('today');

  // Custom date range, traffic filter, meta ads
  const [analyticsDateFrom, setAnalyticsDateFrom] = useState<string>('');
  const [analyticsDateTo, setAnalyticsDateTo] = useState<string>('');
  const [trafficFilter, setTrafficFilter] = useState<'all' | 'paid' | 'organic'>('all');
  // ✅ 제외 IP 목록 (테스트/사무실 IP 필터링) - localStorage에 저장
  const [excludeIPs, setExcludeIPs] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('piilk_exclude_ips') || '[]'); } catch { return []; }
  });
  const [excludeIPInput, setExcludeIPInput] = useState('');
  const [showIPFilter, setShowIPFilter] = useState(false);
  const [metaAdsData, setMetaAdsData] = useState<any[]>([]);
  const [metaAdsDate, setMetaAdsDate] = useState<string>('');
  const metaFileRef = useRef<HTMLInputElement>(null);

  // Participant list
  const [participants, setParticipants] = useState<{ klaviyo: Participant[]; supabase: Participant[] }>({ klaviyo: [], supabase: [] });
  // ✅ 반대 variant 참가자 캐시 (통합 리스트용)
  const [otherParticipants, setOtherParticipants] = useState<{ klaviyo: Participant[]; supabase: Participant[] }>({ klaviyo: [], supabase: [] });
  const [participantsLoading, setParticipantsLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [domainFilter, setDomainFilter] = useState<string>('');
  const [countryFilter, setCountryFilter] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [deviceFilter, setDeviceFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<'signed_up_at' | 'name' | 'email' | 'segment' | 'country' | 'city'>('signed_up_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Detail modal
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);

  // Saved auth
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (localStorage.getItem('piilk_dash') === 'true') setAuthenticated(true);
      const savedPw = localStorage.getItem('piilk_saved_pw');
      if (savedPw) { setPassword(savedPw); setRememberMe(true); }
    }
  }, []);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'piilk$1b') {
      setAuthenticated(true);
      localStorage.setItem('piilk_dash', 'true');
      if (rememberMe) localStorage.setItem('piilk_saved_pw', password);
      else localStorage.removeItem('piilk_saved_pw');
    } else {
      alert('Wrong password');
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/stats?variant=${variant}`);
      const result: ApiResponse = await res.json();
      if (result.success) {
        setSupabaseData(result.supabase);
        setKlaviyoData(result.klaviyo);
        setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [variant]);

  // ✅ fetchParticipants: 현재 + 반대 variant total 동시 캐싱 (깜빡임 방지)
  const fetchParticipants = useCallback(async () => {
    setParticipantsLoading(true);
    const otherVariant = variant === 'main' ? 'type' : 'main';
    try {
      // 현재 variant 전체 데이터 + 반대 variant total만 동시 fetch
      const [kRes, sRes, sOtherRes, kOtherRes] = await Promise.all([
        fetch(`/api/dashboard/participants?source=klaviyo&variant=${variant}`),
        fetch(`/api/dashboard/participants?source=supabase&variant=${variant}`),
        fetch(`/api/dashboard/participants?source=supabase&variant=${otherVariant}`),
        fetch(`/api/dashboard/participants?source=klaviyo&variant=${otherVariant}`),
      ]);
      const kResult: ParticipantsResponse = await kRes.json();
      const sResult: ParticipantsResponse = await sRes.json();
      const sOtherResult: ParticipantsResponse = await sOtherRes.json();
      const kOtherResult: ParticipantsResponse = await kOtherRes.json();

      setParticipants({
        klaviyo: kResult.success ? kResult.data : [],
        supabase: sResult.success ? sResult.data : [],
      });

      // 현재 variant 캐싱
      if (sResult.success) setSupabaseTotals(prev => ({ ...prev, [variant]: sResult.total }));
      if (kResult.success) setKlaviyoTotals(prev => ({ ...prev, [variant]: kResult.total }));

      // 반대 variant total 캐싱 (깜빡임 원인 제거)
      if (sOtherResult.success) setSupabaseTotals(prev => ({ ...prev, [otherVariant]: sOtherResult.total }));
      if (kOtherResult.success) setKlaviyoTotals(prev => ({ ...prev, [otherVariant]: kOtherResult.total }));

      // ✅ 반대 variant 전체 데이터도 저장 (통합 리스트용)
      setOtherParticipants({
        klaviyo: kOtherResult.success ? kOtherResult.data : [],
        supabase: sOtherResult.success ? sOtherResult.data : [],
      });

    } catch (err) { console.error(err); }
    finally { setParticipantsLoading(false); }
  }, [variant]);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/dashboard/analytics?variant=${variant}`);
      const result = await res.json();
      if (result.success) setAnalyticsData(result);
    } catch (err) { console.error(err); }
    finally { setAnalyticsLoading(false); }
  }, [variant]);

  // Reset data when variant changes
  useEffect(() => {
    if (authenticated) {
      setLoading(true);
      setSupabaseData(null);
      setKlaviyoData(null);
      setParticipants({ klaviyo: [], supabase: [] });
      setAnalyticsData(null);
      fetchData();
      fetchParticipants();
      fetchAnalytics();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  // Auto-refresh stats
  useEffect(() => {
    if (authenticated) {
      fetchData();
      const iv = setInterval(fetchData, 30000);
      return () => clearInterval(iv);
    }
  }, [authenticated, fetchData]);

  // Load on first auth
  useEffect(() => {
    if (authenticated && participants.klaviyo.length === 0 && participants.supabase.length === 0) {
      fetchParticipants();
      fetchAnalytics();
    }
  }, [authenticated, fetchParticipants, fetchAnalytics, participants.klaviyo.length, participants.supabase.length]);

  const currentParticipants = activeSource === 'klaviyo' ? participants.klaviyo : participants.supabase;
  const currentOtherParticipants = activeSource === 'klaviyo' ? otherParticipants.klaviyo : otherParticipants.supabase;

  // ✅ 통합 리스트: 현재 variant + 반대 variant, 시간순 정렬, variant 태그 추가
  const mergedParticipants = useMemo(() => {
    const mainList = (variant === 'main' ? currentParticipants : currentOtherParticipants)
      .map(p => ({ ...p, _variantTag: 'main' as const }));
    const typeList = (variant === 'type' ? currentParticipants : currentOtherParticipants)
      .map(p => ({ ...p, _variantTag: 'type' as const }));
    return [...mainList, ...typeList].sort((a, b) => {
      const aDate = a.signed_up_at || '';
      const bDate = b.signed_up_at || '';
      return bDate.localeCompare(aDate); // 최신순
    });
  }, [currentParticipants, currentOtherParticipants, variant]);

  /* ─── Today's signups (NYC timezone) ─── */
  const todaySignups = useMemo(() => {
    const todayStr = getNYCDate(0);
    return currentParticipants.filter(p => p.signed_up_at?.slice(0, 10) === todayStr).length;
  }, [currentParticipants]);

  /* ─── Daily signups for chart ─── */
  const dailySignups = useMemo(() => {
    const dayMap: Record<string, number> = {};
    currentParticipants.forEach(p => {
      if (!p.signed_up_at) return;
      const day = p.signed_up_at.slice(0, 10);
      if (day) dayMap[day] = (dayMap[day] || 0) + 1;
    });
    const sorted = Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0]));
    if (sorted.length > 1) {
      const filled: [string, number][] = [];
      const start = new Date(sorted[0][0]);
      const end = new Date(sorted[sorted.length - 1][0]);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        filled.push([key, dayMap[key] || 0]);
      }
      return filled;
    }
    return sorted;
  }, [currentParticipants]);

  const cumulativeSignups = useMemo(() => {
    let cum = 0;
    return dailySignups.map(([day, count]) => { cum += count; return [day, cum] as [string, number]; });
  }, [dailySignups]);

  const uniqueReasons = useMemo(() => {
    const s = new Set<string>(); currentParticipants.forEach(p => { if (p.sub_reason) s.add(p.sub_reason); }); return Array.from(s).sort();
  }, [currentParticipants]);

  const uniqueDomains = useMemo(() => {
    const s = new Set<string>(); currentParticipants.forEach(p => { if (p.email?.includes('@')) s.add(p.email.split('@')[1].toLowerCase()); }); return Array.from(s).sort();
  }, [currentParticipants]);

  const uniqueCountries = useMemo(() => {
    const s = new Set<string>(); currentParticipants.forEach(p => { if (p.country) s.add(p.country); }); return Array.from(s).sort();
  }, [currentParticipants]);

  const uniqueCities = useMemo(() => {
    const s = new Set<string>(); currentParticipants.forEach(p => { if (p.city) s.add(p.city); }); return Array.from(s).sort();
  }, [currentParticipants]);

  const uniqueDevices = useMemo(() => {
    const s = new Set<string>(); currentParticipants.forEach(p => { if (p.device_type) s.add(p.device_type); }); return Array.from(s).sort();
  }, [currentParticipants]);

  const trackingAnalytics = useMemo(() => {
    const p = currentParticipants;
    if (p.length === 0) return null;
    const countryCounts: Record<string, number> = {};
    p.forEach(x => { const c = x.country || 'Unknown'; countryCounts[c] = (countryCounts[c] || 0) + 1; });
    const cityCounts: Record<string, number> = {};
    p.forEach(x => { const c = x.city || 'Unknown'; cityCounts[c] = (cityCounts[c] || 0) + 1; });
    const deviceCounts: Record<string, number> = {};
    p.forEach(x => { const d = x.device_type || 'Unknown'; deviceCounts[d] = (deviceCounts[d] || 0) + 1; });
    const utmCounts: Record<string, number> = {};
    p.forEach(x => { const u = normalizeUtmSource(x.utm_source); utmCounts[u] = (utmCounts[u] || 0) + 1; });
    const sortMap = (map: Record<string, number>) => Object.entries(map).sort((a, b) => b[1] - a[1]);
    return {
      countries: sortMap(countryCounts), cities: sortMap(cityCounts).slice(0, 10),
      devices: sortMap(deviceCounts), utmSources: sortMap(utmCounts),
      hasTrackingData: p.some(x => x.country || x.device_type || x.utm_source),
    };
  }, [currentParticipants]);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (segmentFilter !== 'all') c++; if (reasonFilter !== 'all') c++;
    if (domainFilter) c++; if (countryFilter) c++; if (cityFilter) c++;
    if (deviceFilter) c++; if (dateFrom) c++; if (dateTo) c++;
    return c;
  }, [segmentFilter, reasonFilter, domainFilter, countryFilter, cityFilter, deviceFilter, dateFrom, dateTo]);

  const clearAllFilters = () => {
    setSearchQuery(''); setSegmentFilter('all'); setReasonFilter('all');
    setDomainFilter(''); setCountryFilter(''); setCityFilter('');
    setDeviceFilter(''); setDateFrom(''); setDateTo('');
  };

  const filteredParticipants = useMemo(() => {
    // Main Teaser 탭에서는 통합 리스트(Main+QuizType), Quiz Type 탭은 기존대로
    const baseList = variant === 'main' ? mergedParticipants : currentParticipants.map(p => ({ ...p, _variantTag: 'type' as const }));
    let list = [...baseList] as (Participant & { _variantTag?: 'main' | 'type' })[];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.email?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) || p.segment?.toLowerCase().includes(q) || p.sub_reason?.toLowerCase().includes(q) || p.country?.toLowerCase().includes(q) || p.city?.toLowerCase().includes(q) || p.ip_address?.includes(q));
    }
    if (segmentFilter !== 'all') {
      if (variant === 'type') {
        list = list.filter(p => p.sub_reason === segmentFilter || p.afterfeel_type === segmentFilter);
      } else {
        list = list.filter(p => p.segment === segmentFilter);
      }
    }
    if (reasonFilter !== 'all') list = list.filter(p => p.sub_reason === reasonFilter);
    if (domainFilter) list = list.filter(p => p.email?.toLowerCase().endsWith('@' + domainFilter.toLowerCase()));
    if (countryFilter) list = list.filter(p => p.country === countryFilter);
    if (cityFilter) list = list.filter(p => p.city === cityFilter);
    if (deviceFilter) list = list.filter(p => p.device_type === deviceFilter);
    if (dateFrom) list = list.filter(p => p.signed_up_at && p.signed_up_at.slice(0, 10) >= dateFrom);
    if (dateTo) list = list.filter(p => p.signed_up_at && p.signed_up_at.slice(0, 10) <= dateTo);
    // 기본 정렬: 시간순 (signed_up_at desc)
    if (sortField === 'signed_up_at' || sortField === 'email' || sortField === 'segment' || sortField === 'country') {
      list.sort((a, b) => {
        const aVal = (a[sortField] || '').toLowerCase();
        const bVal = (b[sortField] || '').toLowerCase();
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [mergedParticipants, currentParticipants, searchQuery, segmentFilter, reasonFilter, domainFilter, countryFilter, cityFilter, deviceFilter, dateFrom, dateTo, sortField, sortDir, variant]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const exportToCSV = () => {
    const headers = ['Email', 'Segment', 'Reason', 'AfterfeelType', 'Country', 'Region', 'City', 'Device', 'Language', 'Timezone', 'IP', 'Referrer', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Source', 'Signed Up'];
    const rows = filteredParticipants.map(p => [p.email||'', p.segment||'', p.sub_reason||'', p.afterfeel_type||'', p.country||'', p.region||'', p.city||'', p.device_type||'', p.language||'', p.timezone||'', p.ip_address||'', p.referrer||'', p.utm_source||'', p.utm_medium||'', p.utm_campaign||'', p.source||'', p.signed_up_at||'']);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url;
    link.download = `piilk-${variant}-participants-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click(); URL.revokeObjectURL(url);
  };

  // Quiz Type: afterfeel_type별 카운트
  const quizTypeCounts = useMemo(() => {
    if (variant !== 'type') return null;
    const counts: Record<string, number> = { brick: 0, chalk: 0, zombie: 0, gambler: 0 };
    currentParticipants.forEach(p => {
      const type = p.afterfeel_type || p.sub_reason || '';
      if (counts.hasOwnProperty(type)) counts[type]++;
    });
    return counts;
  }, [currentParticipants, variant]);

  const availableMonths = useMemo(() => {
    if (!analyticsData?.daily) return [];
    const months = new Set<string>();
    analyticsData.daily.forEach((d: any) => { if (d.date) months.add(d.date.slice(0, 7)); });
    return Array.from(months).sort().reverse();
  }, [analyticsData]);

  const filteredAnalytics = useMemo(() => {
    if (!analyticsData) return null;
    let startDate = '', endDate = '';
    const hasDateFilter = analyticsPeriod !== 'all';

    if (analyticsPeriod === 'custom_range') {
      startDate = analyticsDateFrom || '2000-01-01';
      endDate = analyticsDateTo || '2099-12-31';
    } else if (analyticsPeriod !== 'all') {
      const nowNYC = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      if (analyticsPeriod === 'today') { startDate = endDate = getNYCDate(0); }
      else if (analyticsPeriod === 'yesterday') { startDate = endDate = getNYCDate(-1); }
      else if (analyticsPeriod === 'last_7_days') { startDate = getNYCDate(-6); endDate = getNYCDate(0); }
      else if (analyticsPeriod === 'this_week') {
        const dow = nowNYC.getDay();
        const mon = new Date(nowNYC);
        mon.setDate(nowNYC.getDate() - (dow === 0 ? 6 : dow - 1));
        startDate = `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`;
        endDate = getNYCDate(0);
      }
      else if (analyticsPeriod === 'this_month') { startDate = `${nowNYC.getFullYear()}-${String(nowNYC.getMonth()+1).padStart(2,'0')}-01`; endDate = getNYCDate(0); }
      else if (analyticsPeriod === 'last_month') {
        const lm = new Date(nowNYC.getFullYear(), nowNYC.getMonth()-1, 1);
        startDate = `${lm.getFullYear()}-${String(lm.getMonth()+1).padStart(2,'0')}-01`;
        const lmEnd = new Date(nowNYC.getFullYear(), nowNYC.getMonth(), 0);
        endDate = `${lmEnd.getFullYear()}-${String(lmEnd.getMonth()+1).padStart(2,'0')}-${String(lmEnd.getDate()).padStart(2,'0')}`;
      }
      else {
        startDate = `${analyticsPeriod}-01`;
        const [y, m] = analyticsPeriod.split('-').map(Number);
        endDate = new Date(y, m, 0).toISOString().slice(0, 10);
      }
    }

    const filteredDaily = hasDateFilter ? (analyticsData.daily||[]).filter((d:any) => d.date >= startDate && d.date <= endDate) : (analyticsData.daily||[]);
    let filteredRaw = hasDateFilter ? (analyticsData.rawEvents||[]).filter((ev:any) => ev.d >= startDate && ev.d <= endDate) : (analyticsData.rawEvents||[]);

    if (trafficFilter !== 'all') {
      filteredRaw = filteredRaw.filter((ev: any) => {
        const isPaid = ev.um === 'paid';
        return trafficFilter === 'paid' ? isPaid : !isPaid;
      });
    }

    const funnelEvents = ['page_view','step1_cta_click','step2_answer','step3_email_focus','step3_reason_select','step4_submit'];
    const sessionsByEvt: Record<string,Set<string>> = {};
    funnelEvents.forEach(e => { sessionsByEvt[e] = new Set(); });
    filteredRaw.forEach((ev:any) => { if (funnelEvents.includes(ev.n) && ev.s) sessionsByEvt[ev.n].add(ev.s); });
    const funnel: Record<string,number> = {};
    funnelEvents.forEach(e => { funnel[e] = sessionsByEvt[e].size; });

    const weeklyMap: Record<string,{views:number;submits:number}> = {};
    filteredDaily.forEach((d:any) => {
      const dt = new Date(d.date);
      const jan1 = new Date(dt.getFullYear(),0,1);
      const wn = Math.ceil(((dt.getTime()-jan1.getTime())/86400000+jan1.getDay()+1)/7);
      const key = `${dt.getFullYear()}-W${String(wn).padStart(2,'0')}`;
      if (!weeklyMap[key]) weeklyMap[key] = {views:0,submits:0};
      weeklyMap[key].views += d.page_view||0;
      weeklyMap[key].submits += d.step4_submit||0;
    });
    const weekly = Object.entries(weeklyMap).sort((a,b)=>a[0].localeCompare(b[0])).map(([week,data])=>({week,...data}));

    const utmMap: Record<string,{views:Set<string>;submits:Set<string>}> = {};
    filteredRaw.forEach((ev:any) => {
      const src = normalizeUtmSource(ev.u);
      if (!utmMap[src]) utmMap[src]={views:new Set(),submits:new Set()};
      if (ev.n==='page_view') utmMap[src].views.add(ev.s);
      if (ev.n==='step4_submit') utmMap[src].submits.add(ev.s);
    });
    const utmPerformance = Object.entries(utmMap).map(([source,data])=>({source,views:data.views.size,submits:data.submits.size,cvr:data.views.size>0?((data.submits.size/data.views.size)*100).toFixed(1):'0'})).sort((a,b)=>b.views-a.views);

    const platformMap: Record<string,{views:Set<string>;submits:Set<string>}> = {};
    filteredRaw.forEach((ev:any) => {
      const src = getRawPlatformLabel(ev.u);
      if (!platformMap[src]) platformMap[src]={views:new Set(),submits:new Set()};
      if (ev.n==='page_view') platformMap[src].views.add(ev.s);
      if (ev.n==='step4_submit') platformMap[src].submits.add(ev.s);
    });
    const platformPerformance = Object.entries(platformMap).map(([platform,data])=>({platform,views:data.views.size,submits:data.submits.size,cvr:data.views.size>0?((data.submits.size/data.views.size)*100).toFixed(1):'0'})).sort((a,b)=>b.views-a.views);

    const campaignMap: Record<string,{views:Set<string>;submits:Set<string>;source:string;medium:string}> = {};
    filteredRaw.forEach((ev:any) => {
      const camp = ev.uc || '(no campaign)';
      const src = normalizeUtmSource(ev.u);
      const med = ev.um || '';
      if (!campaignMap[camp]) campaignMap[camp]={views:new Set(),submits:new Set(),source:src,medium:med};
      if (ev.n==='page_view') campaignMap[camp].views.add(ev.s);
      if (ev.n==='step4_submit') campaignMap[camp].submits.add(ev.s);
    });
    const campaignPerformance = Object.entries(campaignMap).map(([campaign,data])=>({campaign,source:data.source,medium:data.medium,views:data.views.size,submits:data.submits.size,cvr:data.views.size>0?((data.submits.size/data.views.size)*100).toFixed(1):'0',isPaid:data.medium==='paid'})).sort((a,b)=>b.views-a.views);

    const allRawP = hasDateFilter ? (analyticsData.rawEvents||[]).filter((ev:any) => ev.d >= startDate && ev.d <= endDate) : (analyticsData.rawEvents||[]);
    const pS = new Set<string>(); const oS = new Set<string>();
    const pSub = new Set<string>(); const oSub = new Set<string>();
    allRawP.forEach((ev:any) => {
      const ip = ev.um === 'paid';
      if (ev.n==='page_view') { if(ip) pS.add(ev.s); else oS.add(ev.s); }
      if (ev.n==='step4_submit') { if(ip) pSub.add(ev.s); else oSub.add(ev.s); }
    });
    const paidVsOrganic = {
      paid: { views: pS.size, submits: pSub.size, cvr: pS.size > 0 ? ((pSub.size/pS.size)*100).toFixed(1) : '0' },
      organic: { views: oS.size, submits: oSub.size, cvr: oS.size > 0 ? ((oSub.size/oS.size)*100).toFixed(1) : '0' }
    };

    const hourMapF: Record<number,number> = {};
    filteredRaw.filter((ev:any)=>ev.n==='step4_submit').forEach((ev:any)=>{hourMapF[ev.h]=(hourMapF[ev.h]||0)+1;});
    const hourly = Array.from({length:24},(_,i)=>({hour:i,label:`${i.toString().padStart(2,'0')}:00`,count:hourMapF[i]||0}));

    const wdNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const wdMap: Record<number,{views:number;submits:number}> = {};
    for(let i=0;i<7;i++) wdMap[i]={views:0,submits:0};
    filteredRaw.forEach((ev:any) => {
      const dow=new Date(ev.d).getDay();
      if(ev.n==='page_view')wdMap[dow].views++;
      if(ev.n==='step4_submit')wdMap[dow].submits++;
    });
    const weekday = Array.from({length:7},(_,i)=>({day:wdNames[i],views:wdMap[i].views,submits:wdMap[i].submits}));

    const moMap: Record<string,{views:number;submits:number}> = {};
    filteredRaw.forEach((ev:any) => {
      const k=ev.d?.slice(0,7);
      if(!k)return;
      if(!moMap[k])moMap[k]={views:0,submits:0};
      if(ev.n==='page_view')moMap[k].views++;
      if(ev.n==='step4_submit')moMap[k].submits++;
    });
    const monthly = Object.entries(moMap).sort((a,b)=>a[0].localeCompare(b[0])).map(([month,data])=>({month,...data}));

    const segDist: Record<string,number> = {};
    filteredRaw.filter((ev:any)=>ev.n==='step2_answer').forEach((ev:any)=>{segDist[ev.ed?.segment||'Unknown']=(segDist[ev.ed?.segment||'Unknown']||0)+1;});

    const reasonDist: Record<string,number> = {};
    filteredRaw.filter((ev:any)=>ev.n==='step3_reason_select').forEach((ev:any)=>{reasonDist[ev.ed?.reason||'Unknown']=(reasonDist[ev.ed?.reason||'Unknown']||0)+1;});

    const uvSessions = new Set(filteredRaw.map((ev:any)=>ev.s).filter(Boolean));
    const uvVisitors = new Set(filteredRaw.map((ev:any)=>ev.v || ev.s).filter(Boolean));

    if (variant === 'type') {
      const submitSids = sessionsByEvt['step4_submit'];
      submitSids.forEach((sid:string) => { sessionsByEvt['step3_email_focus'].add(sid); });
      funnel['step3_email_focus'] = sessionsByEvt['step3_email_focus'].size;
    }

    return {...analyticsData,funnel,daily:filteredDaily,weekly,weekday,monthly,utmPerformance,platformPerformance,campaignPerformance,paidVsOrganic,hourly,segmentDistribution:segDist,reasonDistribution:reasonDist,totalVisitors:uvVisitors.size,totalSessions:uvSessions.size};
  }, [analyticsData, analyticsPeriod, analyticsDateFrom, analyticsDateTo, trafficFilter, variant]);

  /* ─── Today analytics helper (paid/organic 분리 + IP 제외 + 하루 visitor 유니크) ─── */
  const todayAnalytics = useMemo(() => {
    const empty = {
      visitors: 0, sessions: 0, submits: 0, cvr: '—',
      paid:    { visitors: 0, submits: 0, cvr: '—' },
      organic: { visitors: 0, submits: 0, cvr: '—' },
    };
    if (!analyticsData?.rawEvents) return empty;
    const todayStr = getNYCDate(0);

    // ✅ 방문자: page_view 기준 유니크 visitor (IP 제외 + 하루 1회)
    const uniqueVisitorMap = new Map<string, boolean>(); // vid → isPaid
    analyticsData.rawEvents
      .filter((ev: any) => ev.d === todayStr && ev.n === 'page_view')
      .filter((ev: any) => !(ev.ip_address && excludeIPs.some((ip: string) => ev.ip_address.startsWith(ip))))
      .forEach((ev: any) => {
        const vid = ev.v || ev.s;
        if (!vid) return;
        const isPaid = ev.um === 'paid';
        if (!uniqueVisitorMap.has(vid)) {
          uniqueVisitorMap.set(vid, isPaid);
        } else if (isPaid && !uniqueVisitorMap.get(vid)) {
          uniqueVisitorMap.set(vid, true);
        }
      });

    const visitors = uniqueVisitorMap.size;
    const paidVids = new Set<string>(Array.from(uniqueVisitorMap.entries()).filter(([,isPaid]) => isPaid).map(([id]) => id));
    const orgVids  = new Set<string>(Array.from(uniqueVisitorMap.entries()).filter(([,isPaid]) => !isPaid).map(([id]) => id));
    const pVisitors = paidVids.size;
    const oVisitors = orgVids.size;

    // ✅ submits: Supabase participants 기준 (리얼 데이터) — NYC 타임존
    const todayParticipants = currentParticipants.filter((p: any) => {
      if (!p.signed_up_at) return false;
      const d = new Date(p.signed_up_at);
      const nycStr = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      return nycStr === todayStr;
    });
    const submits = todayParticipants.length;

    // Paid/Organic 분리 — participant의 utm_medium 기준
    const pSubmits = todayParticipants.filter((p: any) => p.utm_medium === 'paid').length;
    const oSubmits = todayParticipants.filter((p: any) => p.utm_medium !== 'paid').length;

    const cvr  = visitors  > 0 ? `${((submits  / visitors)  * 100).toFixed(1)}%` : '—';
    const pCvr = pVisitors > 0 ? `${((pSubmits / pVisitors) * 100).toFixed(1)}%` : '—';
    const oCvr = oVisitors > 0 ? `${((oSubmits / oVisitors) * 100).toFixed(1)}%` : '—';

    const sessions = new Set(
      analyticsData.rawEvents
        .filter((ev: any) => ev.d === todayStr)
        .map((ev: any) => ev.s).filter(Boolean)
    ).size;

    return {
      visitors, sessions, submits, cvr,
      paid:    { visitors: pVisitors, submits: pSubmits, cvr: pCvr },
      organic: { visitors: oVisitors, submits: oSubmits, cvr: oCvr },
    };
  }, [analyticsData, excludeIPs, currentParticipants]);

  const segColor = (s?: string) => {
    if (variant === 'type') {
      const t = QUIZ_TYPE_LABELS[s || ''];
      if (t) return `bg-zinc-800/30 ${t.color} border-zinc-700/30`;
    }
    switch(s) {
      case 'A': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'B': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'C': return 'bg-sky-500/20 text-sky-400 border-sky-500/30';
      default:  return 'bg-zinc-700/30 text-zinc-400 border-zinc-600/30';
    }
  };

  const segLabel = (s?: string, p?: Participant) => {
    if (variant === 'type') {
      const type = p?.afterfeel_type || p?.sub_reason || s || '';
      const t = QUIZ_TYPE_LABELS[type];
      return t ? t.name : type || 'afterfeel_quiz';
    }
    switch(s) {
      case 'A': return 'Hot Leads';
      case 'B': return 'Skeptic';
      case 'C': return 'Newbie';
      default:  return s||'—';
    }
  };

  const fmtDate = (d?: string) => {
    if(!d)return'—';
    try {
      const dt=new Date(d);
      return dt.toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'})+' '+dt.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    } catch { return d; }
  };

  const fmtShortDate = (d: string) => { const p=d.split('-'); return `${p[1]}/${p[2]}`; };

  // ✅ 트래픽 소스 배지 헬퍼
  const trafficSourceLabel = (p: Participant): { label: string; color: string } => {
    const src = (p.utm_source || '').toLowerCase();
    const med = (p.utm_medium || '').toLowerCase();
    const ref = (p.referrer || '').toLowerCase();
    if (med === 'paid' || src === 'meta' || src === 'facebook' || src === 'fb') {
      // placement 구분
      if (src === 'instagram' || ref.includes('instagram')) return { label: 'IG', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' };
      return { label: 'Meta', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
    }
    if (src === 'instagram' || ref.includes('instagram.com')) return { label: 'IG', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' };
    if (src === 'facebook' || ref.includes('facebook.com')) return { label: 'FB', color: 'bg-blue-600/20 text-blue-400 border-blue-600/30' };
    if (src === 'google' || ref.includes('google.com')) return { label: 'Google', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
    if (src === 'tiktok' || ref.includes('tiktok.com')) return { label: 'TikTok', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' };
    if (src === 'twitter' || src === 'x' || ref.includes('twitter.com') || ref.includes('x.com')) return { label: 'X', color: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30' };
    if (src === 'email' || med === 'email') return { label: 'Email', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
    if (src) return { label: src, color: 'bg-zinc-700/30 text-zinc-400 border-zinc-600/30' };
    return { label: 'Direct', color: 'bg-zinc-800/50 text-zinc-500 border-zinc-700/30' };
  };
  const deviceIcon = (d?: string) => {
    switch(d) {
      case 'mobile':  return '📱';
      case 'desktop': return '💻';
      case 'tablet':  return '📟';
      default:        return '—';
    }
  };

  const BarChart = ({ data, color, total }: { data: [string, number][]; color: string; total: number }) => (
    <div className="space-y-1.5">
      {data.map(([label, count]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-[10px] sm:text-xs text-zinc-400 w-20 sm:w-24 truncate text-right shrink-0">{label}</span>
          <div className="flex-1 h-5 sm:h-6 bg-zinc-800/50 rounded-md overflow-hidden relative">
            <div className={`h-full rounded-md ${color} transition-all duration-700`} style={{ width: `${total > 0 ? Math.max((count / total) * 100, 2) : 0}%` }} />
            <span className="absolute inset-0 flex items-center px-2 text-[10px] sm:text-xs text-white font-medium">{count} <span className="text-zinc-500 ml-1">({total > 0 ? ((count / total) * 100).toFixed(0) : 0}%)</span></span>
          </div>
        </div>
      ))}
    </div>
  );

  const SignupChart = ({ daily, cumulative }: { daily: [string, number][]; cumulative: [string, number][] }) => {
    const [chartMode, setChartMode] = useState<'daily' | 'cumulative'>('daily');
    const chartData = chartMode === 'daily' ? daily : cumulative;
    if (chartData.length === 0) return null;
    const maxVal = Math.max(...chartData.map(d => d[1]), 1);
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><span className="text-base">📈</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Signup Trend</h3></div>
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
            <button onClick={() => setChartMode('daily')} className={`px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-all ${chartMode === 'daily' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>Daily</button>
            <button onClick={() => setChartMode('cumulative')} className={`px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-all ${chartMode === 'cumulative' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>Cumulative</button>
          </div>
        </div>
        <div className="relative h-40 sm:h-52">
          <div className="absolute left-0 top-0 bottom-5 w-8 flex flex-col justify-between text-[9px] text-zinc-600 font-mono"><span>{maxVal}</span><span>{Math.round(maxVal / 2)}</span><span>0</span></div>
          <div className="absolute left-9 right-0 top-0 bottom-5">
            <div className="absolute top-0 left-0 right-0 border-t border-zinc-800/50" />
            <div className="absolute top-1/2 left-0 right-0 border-t border-zinc-800/30 border-dashed" />
            <div className="absolute bottom-0 left-0 right-0 border-t border-zinc-800/50" />
          </div>
          <div className="absolute left-9 right-0 top-0 bottom-5 flex items-end gap-[1px]">
            {chartData.map(([day, count], i) => {
              const height = maxVal > 0 ? (count / maxVal) * 100 : 0;
              const isToday = day === new Date().toISOString().slice(0, 10);
              return (
                <div key={day} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[9px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">{fmtShortDate(day)}: <span className="font-bold">{count}</span></div>
                  <div className={`w-full rounded-t-sm transition-all duration-500 ${isToday ? 'bg-emerald-400' : chartMode === 'cumulative' ? 'bg-purple-500/80 group-hover:bg-purple-400' : 'bg-emerald-500/60 group-hover:bg-emerald-400'}`} style={{ height: `${Math.max(height, count > 0 ? 2 : 0)}%` }} />
                  {(chartData.length <= 14 || i % Math.ceil(chartData.length / 10) === 0 || i === chartData.length - 1) && (
                    <span className={`text-[7px] sm:text-[8px] mt-1 font-mono ${isToday ? 'text-emerald-400 font-bold' : 'text-zinc-600'}`}>{fmtShortDate(day)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-800/50">
          <div className="text-[10px] sm:text-xs text-zinc-500">Period: <span className="text-zinc-300 font-medium">{chartData.length} days</span></div>
          {chartMode === 'daily' && <div className="text-[10px] sm:text-xs text-zinc-500">Avg: <span className="text-zinc-300 font-medium">{(daily.reduce((s, d) => s + d[1], 0) / Math.max(daily.length, 1)).toFixed(1)}</span>/day</div>}
          <div className="text-[10px] sm:text-xs text-zinc-500">Peak: <span className="text-emerald-400 font-medium">{Math.max(...daily.map(d => d[1]))}</span></div>
        </div>
      </div>
    );
  };

  /* ─── UTM Source Stats Section ─── */
  const UtmSourceStatsSection = () => {
    const [utmView, setUtmView] = useState<'today' | 'total'>('today');
    const rawUtmStats: UtmSourceStat[] | undefined = analyticsData?.utmSourceStats?.[utmView];
    const utmStats = useMemo(() => {
      if (!rawUtmStats) return undefined;
      const merged: Record<string, UtmSourceStat> = {};
      rawUtmStats.forEach(stat => {
        const n = normalizeUtmSource(stat.source);
        if (!merged[n]) { merged[n] = { ...stat, source: n }; }
        else {
          merged[n].visitors += stat.visitors; merged[n].sessions += stat.sessions;
          merged[n].events += stat.events; merged[n].page_views += stat.page_views;
          merged[n].submits += stat.submits;
        }
      });
      Object.values(merged).forEach(m => { m.cvr = m.page_views > 0 ? ((m.submits / m.page_views) * 100).toFixed(1) : '0'; });
      return Object.values(merged).sort((a, b) => b.visitors - a.visitors);
    }, [rawUtmStats]);

    const visitorStatsData: { total: VisitorStat; today: VisitorStat } | undefined = analyticsData?.visitorStats;
    if (!utmStats && !visitorStatsData) return null;
    const currentVS = visitorStatsData?.[utmView];
    const totalVisitorsSum = utmStats?.reduce((s, u) => s + u.visitors, 0) || 0;
    const totalSubmitsSum = utmStats?.reduce((s, u) => s + u.submits, 0) || 0;

    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-5">
          <div className="flex items-center gap-2">
            <span className="text-base">📡</span>
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Traffic Source Breakdown</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded border ${variant === 'main' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-purple-500/10 text-purple-400 border-purple-500/30'}`}>{variant === 'main' ? 'Main Teaser' : 'Quiz Type'}</span>
          </div>
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
            <button onClick={() => setUtmView('today')} className={`px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all ${utmView === 'today' ? 'bg-emerald-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Today</button>
            <button onClick={() => setUtmView('total')} className={`px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all ${utmView === 'total' ? 'bg-purple-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Total</button>
          </div>
        </div>
        {currentVS && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-5">
            <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3"><p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">Visitors</p><p className="text-xl sm:text-2xl font-black text-white">{currentVS.visitors.toLocaleString()}</p></div>
            <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3"><p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">Sessions</p><p className="text-xl sm:text-2xl font-black text-white">{currentVS.sessions.toLocaleString()}</p></div>
            <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3"><p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">Events</p><p className="text-xl sm:text-2xl font-black text-zinc-300">{currentVS.events.toLocaleString()}</p></div>
            <div className="bg-emerald-950/30 border border-emerald-900/30 rounded-lg p-3"><p className="text-[9px] text-emerald-500 uppercase tracking-widest font-semibold mb-0.5">Submits</p><p className="text-xl sm:text-2xl font-black text-emerald-400">{totalSubmitsSum}</p></div>
          </div>
        )}
        {utmStats && utmStats.length > 0 && (
          <div className="space-y-2.5">
            {utmStats.map((utm) => {
              const colors = getUtmColor(utm.source);
              const visitorPct = totalVisitorsSum > 0 ? ((utm.visitors / totalVisitorsSum) * 100) : 0;
              return (
                <div key={utm.source} className={`${colors.bg} border ${colors.border} rounded-xl p-3 sm:p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} /><span className={`text-sm sm:text-base font-bold ${colors.text}`}>{utm.source}</span><span className="text-[10px] text-zinc-500 font-medium">{visitorPct.toFixed(1)}% of traffic</span></div>
                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${Number(utm.cvr) > 3 ? 'bg-emerald-500/20 text-emerald-400' : Number(utm.cvr) > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700/30 text-zinc-500'}`}>CVR {utm.cvr}%</span>
                  </div>
                  <div className="h-2 bg-zinc-800/80 rounded-full overflow-hidden mb-3"><div className={`h-full rounded-full ${colors.dot} transition-all duration-700`} style={{ width: `${Math.max(visitorPct, utm.visitors > 0 ? 2 : 0)}%` }} /></div>
                  <div className="grid grid-cols-5 gap-2">
                    <div className="text-center"><p className="text-sm sm:text-lg font-black text-white">{utm.visitors.toLocaleString()}</p><p className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-widest">Visitors</p></div>
                    <div className="text-center"><p className="text-sm sm:text-lg font-black text-zinc-300">{utm.sessions.toLocaleString()}</p><p className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-widest">Sessions</p></div>
                    <div className="text-center"><p className="text-sm sm:text-lg font-black text-zinc-400">{utm.events.toLocaleString()}</p><p className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-widest">Events</p></div>
                    <div className="text-center"><p className="text-sm sm:text-lg font-black text-zinc-400">{utm.page_views.toLocaleString()}</p><p className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-widest">Views</p></div>
                    <div className="text-center"><p className="text-sm sm:text-lg font-black text-emerald-400">{utm.submits}</p><p className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-widest">Submits</p></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {(!utmStats || utmStats.length === 0) && (<div className="text-center text-zinc-600 py-6 text-sm">No traffic data for this period.</div>)}
      </div>
    );
  };

  /* ─── LOGIN ─── */
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <form onSubmit={handleAuth} className="text-center max-w-sm w-full">
          <div className="flex justify-center mb-4">
            <Image src="/pillk-logo.png" alt="PIILK" width={120} height={40} className="h-10 w-auto" priority />
          </div>
          <p className="text-zinc-600 text-sm mb-6 sm:mb-8">Internal Dashboard</p>
          <div className="space-y-3">
            <div className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-800 text-zinc-400 rounded-lg text-base text-left">armoredfresh</div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 text-white rounded-lg focus:outline-none focus:border-zinc-600 text-base" autoFocus autoComplete="current-password" />
            <label className="flex items-center gap-2 text-zinc-400 text-sm cursor-pointer justify-start px-1">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer" />
              <span>Remember Password</span>
            </label>
            <button type="submit" className="w-full px-6 py-3 bg-white text-black rounded-lg font-semibold hover:bg-zinc-200 active:scale-[0.98] transition-all">Login</button>
          </div>
        </form>
      </div>
    );
  }

  if (loading) {
    return (<div className="min-h-screen bg-black flex items-center justify-center"><div className="w-10 h-10 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin" /></div>);
  }

  const data = activeSource === 'klaviyo' ? klaviyoData : supabaseData;
  const goal = 15000;
  const progress = data ? Math.min((data.total / goal) * 100, 100) : 0;

  // ✅ 반대 variant 숫자 (null이면 미로드 = 표시 안 함)
  const oppositeVariant = variant === 'main' ? 'type' : 'main';
  const oppSupabaseTotal = supabaseTotals[oppositeVariant];
  const oppKlaviyoTotal = klaviyoTotals[oppositeVariant];

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-black to-zinc-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-xl border-b border-zinc-900">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => window.open('https://teaser.piilk.com', '_blank')} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 active:scale-95 transition-all" title="Go to teaser site">
              <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <Image src="/pillk-logo.png" alt="PIILK" width={80} height={28} className="h-6 sm:h-7 w-auto" />
            <span className="text-[10px] sm:text-xs text-zinc-600 uppercase tracking-wider hidden sm:inline">Dashboard</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-zinc-500 text-[10px] sm:text-xs font-mono">{lastUpdated}</span>
            <button onClick={() => { fetchData(); fetchParticipants(); fetchAnalytics(); }} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 active:scale-95">
              <svg className="w-3 h-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <button onClick={() => { localStorage.removeItem('piilk_dash'); localStorage.removeItem('piilk_saved_pw'); setAuthenticated(false); setPassword(''); setRememberMe(false); }} className="text-[10px] sm:text-xs text-zinc-500 hover:text-white transition-colors">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* Variant Tabs */}
        <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 rounded-xl p-1">
          <button onClick={() => setVariant('main')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${variant === 'main' ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            Main Teaser
          </button>
          <button onClick={() => setVariant('type')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${variant === 'type' ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            Quiz Type
          </button>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-800 rounded-xl p-1">
          {(['overview','participants','analytics'] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all capitalize ${viewMode === mode ? 'bg-white text-black shadow-lg shadow-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {mode === 'overview' && <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
              {mode === 'participants' && <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
              {mode === 'analytics' && <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
              {mode}
            </button>
          ))}
        </div>

        {/* Data Source Tabs */}
        {viewMode !== 'analytics' && (
          <div className="flex gap-2">
            {/* Klaviyo 버튼 */}
            <button onClick={() => setActiveSource('klaviyo')} className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${activeSource === 'klaviyo' ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
              📧 Klaviyo
              {klaviyoData && <span className="text-xs opacity-80">({klaviyoData.total})</span>}
              {oppKlaviyoTotal !== null && (
                <>
                  <span className="text-xs opacity-40">+</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold border ${variant === 'main' ? 'bg-purple-900/50 text-purple-300 border-purple-700/40' : 'bg-emerald-900/50 text-emerald-300 border-emerald-700/40'}`}
                    title={`${oppositeVariant === 'main' ? 'Main Teaser' : 'Quiz Type'} Klaviyo`}
                  >
                    {oppositeVariant === 'main' ? 'Main' : 'Quiz'} {oppKlaviyoTotal}
                  </span>
                </>
              )}
            </button>

            {/* Supabase 버튼 */}
            <button onClick={() => setActiveSource('supabase')} className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${activeSource === 'supabase' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
              🗄️ Supabase
              {supabaseData && <span className="text-xs opacity-80">({supabaseData.total})</span>}
              {oppSupabaseTotal !== null && (
                <>
                  <span className="text-xs opacity-40">+</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold border ${variant === 'main' ? 'bg-purple-900/50 text-purple-300 border-purple-700/40' : 'bg-emerald-900/50 text-emerald-300 border-emerald-700/40'}`}
                    title={`${oppositeVariant === 'main' ? 'Main Teaser' : 'Quiz Type'} Supabase`}
                  >
                    {oppositeVariant === 'main' ? 'Main' : 'Quiz'} {oppSupabaseTotal}
                  </span>
                </>
              )}
            </button>
          </div>
        )}

        {/* ══════ OVERVIEW ══════ */}
        {viewMode === 'overview' && data ? (
          <>
            <section className="relative overflow-hidden bg-gradient-to-br from-zinc-900/80 to-zinc-950 border border-zinc-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8">
              <div className={`absolute inset-0 bg-gradient-to-r ${variant === 'type' ? 'from-purple-500/5' : activeSource === 'klaviyo' ? 'from-purple-500/5' : 'from-emerald-500/5'} to-transparent`} />
              <div className="relative">
                <div className="flex items-end justify-between gap-4 mb-4 sm:mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${activeSource === 'klaviyo' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{activeSource === 'klaviyo' ? 'Klaviyo' : 'Supabase'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded border ${variant === 'main' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-purple-500/10 text-purple-400 border-purple-500/30'}`}>{variant === 'main' ? 'Main Teaser' : 'Quiz Type'}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">TODAY +{todaySignups}</span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest mb-1 sm:mb-2">Total Signups</p>
                    <p className="text-5xl sm:text-6xl lg:text-8xl font-black leading-none tracking-tighter bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">{data.total.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-zinc-500 text-xs sm:text-sm">Goal: {goal.toLocaleString()}</p>
                    <p className={`text-xl sm:text-2xl font-bold ${variant === 'type' ? 'text-purple-500' : activeSource === 'klaviyo' ? 'text-purple-500' : 'text-emerald-500'}`}>{progress.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="h-1.5 sm:h-2 bg-zinc-800/50 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${variant === 'type' ? 'bg-gradient-to-r from-purple-600 to-purple-400' : activeSource === 'klaviyo' ? 'bg-gradient-to-r from-purple-600 to-purple-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`} style={{ width: `${progress}%` }} />
                </div>
                <div className="flex justify-between mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-zinc-700 font-mono"><span>0</span><span>5K</span><span>10K</span><span>15K</span></div>
              </div>
            </section>

            {dailySignups.length > 0 && <SignupChart daily={dailySignups} cumulative={cumulativeSignups} />}

            {/* Segments */}
            {variant === 'type' ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {Object.entries(QUIZ_TYPE_LABELS).map(([key, label]) => {
                  const count = data.quizBreakdown?.[key as keyof typeof data.quizBreakdown] ?? quizTypeCounts?.[key] ?? 0;
                  const pct = data.total > 0 ? ((count / data.total) * 100).toFixed(1) : '0';
                  return (
                    <div key={key} className={`bg-gradient-to-br ${label.bgColor} border ${label.borderColor} rounded-xl sm:rounded-2xl p-4 sm:p-5 relative overflow-hidden`}>
                      <div className="absolute top-0 right-0 w-20 h-20 opacity-10 text-6xl flex items-center justify-center pointer-events-none">{label.icon}</div>
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-2"><span className="text-lg">{label.icon}</span><p className={`text-[9px] sm:text-xs uppercase tracking-widest font-bold ${label.color}`}>{label.name}</p></div>
                        <div className="flex items-end justify-between mt-3">
                          <p className={`text-3xl sm:text-4xl font-black ${label.color}`}>{count}</p>
                          <p className={`text-sm sm:text-base font-bold ${label.color} opacity-70`}>{pct}%</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
                <div className="lg:col-span-2 bg-gradient-to-br from-emerald-950/40 to-zinc-900/60 border border-emerald-900/40 rounded-xl sm:rounded-2xl p-4 sm:p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 sm:w-48 h-32 sm:h-48 bg-emerald-500/10 rounded-full blur-3xl" />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-4 sm:mb-6">
                      <div>
                        <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-emerald-500 rounded-full animate-pulse" /><p className="text-[10px] sm:text-xs text-emerald-400 uppercase tracking-widest font-bold">Segment A</p></div>
                        <h2 className="text-lg sm:text-xl font-bold text-white">Hot Leads</h2>
                        <p className="text-zinc-500 text-[10px] sm:text-xs">Yes - Core Target</p>
                      </div>
                      <div className="text-right">
                        <p className="text-4xl sm:text-5xl lg:text-6xl font-black text-emerald-400">{data.segments.A.total}</p>
                        <p className="text-emerald-600 text-base sm:text-lg font-bold">{data.segments.A.percentage}%</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                      {data.segments.A.breakdown && [
                        { label: 'Residue',    value: data.segments.A.breakdown.residue    },
                        { label: 'Aftertaste', value: data.segments.A.breakdown.aftertaste },
                        { label: 'Heaviness',  value: data.segments.A.breakdown.heaviness  },
                        { label: 'Habit',      value: data.segments.A.breakdown.habit      },
                        { label: 'Lapsed',     value: data.segments.A.breakdown.lapsed     },
                      ].map((item) => (
                        <div key={item.label} className="bg-black/40 rounded-lg sm:rounded-xl p-2 sm:p-3 text-center border border-emerald-900/20">
                          <p className="text-lg sm:text-2xl font-black text-white">{item.value}</p>
                          <p className="text-[7px] sm:text-[9px] text-emerald-500/80 uppercase tracking-wider font-semibold mt-0.5 sm:mt-1 leading-tight">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-4">
                  <div className="bg-gradient-to-br from-amber-950/30 to-zinc-900/50 border border-amber-900/30 rounded-xl sm:rounded-2xl p-3 sm:p-5">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-amber-500 rounded-full" /><p className="text-[9px] sm:text-xs text-amber-500 uppercase tracking-widest font-bold">Segment B</p></div>
                    <h3 className="text-base sm:text-lg font-bold text-white">Skeptics</h3><p className="text-zinc-500 text-[10px] sm:text-xs mb-2 sm:mb-3">No - Unaware</p>
                    <div className="flex items-end justify-between"><p className="text-3xl sm:text-4xl font-black text-amber-400">{data.segments.B.total}</p><p className="text-amber-600 text-sm sm:text-base font-bold">{data.segments.B.percentage}%</p></div>
                  </div>
                  <div className="bg-gradient-to-br from-sky-950/30 to-zinc-900/50 border border-sky-900/30 rounded-xl sm:rounded-2xl p-3 sm:p-5">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-sky-500 rounded-full" /><p className="text-[9px] sm:text-xs text-sky-500 uppercase tracking-widest font-bold">Segment C</p></div>
                    <h3 className="text-base sm:text-lg font-bold text-white">Newbies</h3><p className="text-zinc-500 text-[10px] sm:text-xs mb-2 sm:mb-3">New to Protein</p>
                    <div className="flex items-end justify-between"><p className="text-3xl sm:text-4xl font-black text-sky-400">{data.segments.C.total}</p><p className="text-sky-600 text-sm sm:text-base font-bold">{data.segments.C.percentage}%</p></div>
                  </div>
                </div>
              </div>
            )}

            {/* Tracking Analytics */}
            {trackingAnalytics && trackingAnalytics.hasTrackingData && (
              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-sm sm:text-base font-bold text-zinc-400 uppercase tracking-widest">Audience Insights</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                  {[
                    { icon: '🌍', title: 'Country',        data: trackingAnalytics.countries,   color: 'bg-emerald-500' },
                    { icon: '🏙️', title: 'Top Cities',     data: trackingAnalytics.cities,      color: 'bg-purple-500'  },
                    { icon: '📱', title: 'Device',         data: trackingAnalytics.devices,     color: 'bg-amber-500'   },
                    { icon: '🔗', title: 'Traffic Source', data: trackingAnalytics.utmSources,  color: 'bg-sky-500'     },
                  ].map(section => (
                    <div key={section.title} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                      <div className="flex items-center gap-2 mb-3 sm:mb-4"><span className="text-base">{section.icon}</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">{section.title}</h3></div>
                      <BarChart data={section.data} color={section.color} total={currentParticipants.length} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : viewMode === 'overview' ? (
          <div className="text-center text-zinc-500 py-12">데이터를 불러올 수 없습니다.</div>
        ) : null}

        {/* ══════ PARTICIPANTS ══════ */}
        {viewMode === 'participants' && (
          <div className="space-y-4">
            {/* ✅ 상단 카드 — Quiz Type vs Main Teaser */}
            {(() => {
              const todayStr = getNYCDate(0);
              // ✅ NYC 타임존 기준 오늘 판단 (UTC signed_up_at → NYC 변환)
              const isToday = (p: Participant) => {
                if (!p.signed_up_at) return false;
                const d = new Date(p.signed_up_at);
                const nycStr = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
                return nycStr === todayStr;
              };
              const kTotal = participants.klaviyo.length;
              const sTotal = participants.supabase.length;

              if (variant === 'type') {
                const todayQuizCounts: Record<string, number> = { brick: 0, chalk: 0, zombie: 0, gambler: 0 };
                currentParticipants.filter(isToday).forEach(p => {
                  const type = p.afterfeel_type || p.sub_reason || '';
                  if (Object.prototype.hasOwnProperty.call(todayQuizCounts, type)) todayQuizCounts[type]++;
                });
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
                    {/* Total 강조 카드 */}
                    <div className="relative bg-gradient-to-br from-zinc-800/80 to-zinc-900 border-2 border-zinc-600 rounded-xl p-3 sm:p-4 overflow-hidden">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-full blur-xl pointer-events-none" />
                      <p className="text-[9px] sm:text-[10px] text-zinc-400 uppercase tracking-widest mb-0.5 font-bold">Total</p>
                      <p className="text-2xl sm:text-3xl font-black text-white">{currentParticipants.length}</p>
                      <div className="flex gap-1.5 mt-1.5">
                        <span className="text-[9px] text-purple-400 font-semibold bg-purple-500/10 px-1.5 py-0.5 rounded">K {kTotal}</span>
                        <span className="text-[9px] text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">S {sTotal}</span>
                      </div>
                      <p className="text-[9px] text-emerald-400 font-bold mt-1">+{currentParticipants.filter(isToday).length} today</p>
                    </div>
                    {Object.entries(QUIZ_TYPE_LABELS).map(([key, label]) => (
                      <div key={key} className={`bg-gradient-to-br ${label.bgColor} border ${label.borderColor} rounded-xl p-3 sm:p-4`}>
                        <p className={`text-[10px] sm:text-xs ${label.color} uppercase tracking-widest mb-1`}>{label.icon} {key}</p>
                        <p className={`text-xl sm:text-2xl font-black ${label.color}`}>{quizTypeCounts?.[key] ?? 0}</p>
                        <p className="text-[9px] text-zinc-500 mt-1">+{todayQuizCounts[key]} today</p>
                      </div>
                    ))}
                  </div>
                );
              }

              // ✅ Main Teaser: Hot Leads 오늘 신규 + Visitors(Paid/Organic) + CVR(Paid/Organic)
              const todayA = currentParticipants.filter(p => isToday(p) && p.segment === 'A').length;
              const otherTotal: number | null = variant === 'main' ? supabaseTotals.type : supabaseTotals.main;
              const combinedTotal = otherTotal !== null
                ? currentParticipants.length + (otherTotal as number)
                : currentParticipants.length;
              const isCombined = otherTotal !== null;
              const combinedTodayAll = currentParticipants.filter(isToday).length;

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  {/* Total 강조 카드 — Main+QuizType Supabase 합산 */}
                  <div className="relative bg-gradient-to-br from-zinc-800/80 to-zinc-900 border-2 border-zinc-600 rounded-xl p-4 overflow-hidden flex flex-col items-center justify-center text-center min-h-[160px]">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-full blur-xl pointer-events-none" />
                    <p className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold mb-2">Total</p>
                    <div className="flex items-baseline gap-1.5 justify-center">
                      <p className="text-6xl sm:text-7xl font-black text-white leading-none">{combinedTotal.toLocaleString()}</p>
                      {!isCombined && <span className="text-[9px] text-zinc-600 animate-pulse">…</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-lg sm:text-xl font-black text-emerald-400">+{combinedTodayAll} today</span>
                    </div>
                  </div>

                  {/* Hot Leads (Seg A) — 오늘 신규만 */}
                  <div className="bg-emerald-950/30 border border-emerald-900/30 rounded-xl p-4 flex flex-col items-center justify-center text-center min-h-[160px]">
                    <div className="flex items-center justify-between w-full mb-2">
                      <p className="text-[10px] text-emerald-500 uppercase tracking-widest font-bold">Hot Leads</p>
                      <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">TODAY</span>
                    </div>
                    <p className="text-6xl sm:text-7xl font-black text-emerald-400 leading-none">{todayA}</p>
                    {(() => {
                      const yStr = getNYCDate(-1);
                      const yesterdayA = currentParticipants.filter(p => p.signed_up_at?.slice(0,10) === yStr && p.segment === 'A').length;
                      if (yesterdayA === 0) return null;
                      const diff = todayA - yesterdayA;
                      const pct = ((diff / yesterdayA) * 100).toFixed(0);
                      return (
                        <div className="mt-2 flex items-baseline gap-1.5">
                          <span className={`text-base font-black ${diff >= 0 ? 'text-sky-400' : 'text-red-400'}`}>{diff >= 0 ? '▲' : '▼'}{Math.abs(Number(pct))}%</span>
                          <span className="text-xs text-zinc-500">vs yesterday ({yesterdayA})</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* ✅ Visitors — Paid / Organic 분리 */}
                  <div className="bg-sky-950/30 border border-sky-900/30 rounded-xl p-3 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] sm:text-xs text-sky-400 uppercase tracking-widest font-bold">Visitors</p>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            if (!analyticsData?.rawEvents) return;
                            const todayStr = getNYCDate(0);
                            const todayPV = analyticsData.rawEvents.filter((ev: any) => ev.d === todayStr && ev.n === 'page_view');
                            const vidMap = new Map<string, number>();
                            todayPV.forEach((ev: any) => {
                              const vid = ev.v || ev.s || 'no-id';
                              vidMap.set(vid, (vidMap.get(vid) || 0) + 1);
                            });
                            const multiVisit = Array.from(vidMap.entries()).filter(([,c]) => c > 1);
                            const noV = todayPV.filter((ev: any) => !ev.v).length;
                            // Paid/Organic 중복 체크
                            const paidVidSet = new Set(todayPV.filter((ev:any)=>ev.um==='paid').map((ev:any)=>ev.v||ev.s).filter(Boolean));
                            const orgVidSet  = new Set(todayPV.filter((ev:any)=>ev.um!=='paid').map((ev:any)=>ev.v||ev.s).filter(Boolean));
                            const overlap = Array.from(paidVidSet).filter(id => orgVidSet.has(id)).length;
                            alert(
                              `📊 Visitor Debug (오늘)\n\n` +
                              `전체 page_view 이벤트: ${todayPV.length}개\n` +
                              `유니크 visitor_id: ${vidMap.size}명\n` +
                              `visitor_id 없음 (session 폴백): ${noV}개\n` +
                              `재방문 (2회↑): ${multiVisit.length}명\n` +
                              `  → 예: ${multiVisit.slice(0,3).map(([id,c])=>`${id.slice(-6)}(${c}회)`).join(', ')}\n\n` +
                              `Paid visitors (raw): ${paidVidSet.size}명\n` +
                              `Organic visitors (raw): ${orgVidSet.size}명\n` +
                              `Paid+Organic 중복: ${overlap}명 (Paid로 분류됨)\n` +
                              `보정 후 Organic: ${orgVidSet.size - overlap}명\n` +
                              `Paid + Organic 합산: ${paidVidSet.size + (orgVidSet.size - overlap)}명 (= 유니크 ${vidMap.size}명)`
                            );
                          }}
                          className="text-[8px] bg-sky-500/10 text-sky-500 px-1.5 py-0.5 rounded border border-sky-500/20 hover:bg-sky-500/20"
                        >Debug</button>
                        <span className="text-[8px] bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded font-bold">TODAY</span>
                      </div>
                    </div>
                    {analyticsData ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs text-red-400 font-bold"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Paid</span>
                          <span className="text-2xl sm:text-3xl font-black text-white">{todayAnalytics.paid.visitors}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Organic</span>
                          <span className="text-2xl sm:text-3xl font-black text-white">{todayAnalytics.organic.visitors}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800">
                          <p className="text-[10px] text-zinc-500 font-semibold">Total</p>
                          <p className="text-base font-black text-zinc-300">{todayAnalytics.visitors}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-3xl font-black text-zinc-600">—</p>
                    )}
                  </div>

                  {/* ✅ CVR — Paid / Organic 분리 + 평균 */}
                  <div className="bg-purple-950/30 border border-purple-900/30 rounded-xl p-3 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] sm:text-xs text-purple-400 uppercase tracking-widest font-bold">CVR</p>
                      <span className="text-[8px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold">TODAY</span>
                    </div>
                    {analyticsData ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs text-red-400 font-bold"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Paid</span>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[11px] text-zinc-500 font-mono">{todayAnalytics.paid.submits}/{todayAnalytics.paid.visitors}</span>
                            <span className="text-2xl sm:text-3xl font-black text-amber-400">{todayAnalytics.paid.cvr}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Organic</span>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[11px] text-zinc-500 font-mono">{todayAnalytics.organic.submits}/{todayAnalytics.organic.visitors}</span>
                            <span className="text-2xl sm:text-3xl font-black text-amber-400">{todayAnalytics.organic.cvr}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800">
                          <p className="text-[10px] text-zinc-500 font-semibold">Avg CVR <span className="text-zinc-600">(Submits {todayAnalytics.submits})</span></p>
                          <p className="text-base font-black text-purple-300">{todayAnalytics.cvr}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-3xl font-black text-zinc-600">—</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Search & Filters */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input type="text" placeholder="Search email, country, city, IP..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-zinc-600 placeholder-zinc-600" />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>}
              </div>
              <select value={segmentFilter} onChange={e => setSegmentFilter(e.target.value)} className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-zinc-600 cursor-pointer min-w-[140px]">
                <option value="all">All Segments</option>
                {variant === 'type' ? (
                  <>
                    <option value="brick">🧱 Brick Stomach</option>
                    <option value="chalk">🦷 Chalk Mouth</option>
                    <option value="zombie">🧟 Post-Shake Zombie</option>
                    <option value="gambler">🎰 30-Min Gambler</option>
                  </>
                ) : (
                  <>
                    <option value="A">A - Hot Leads</option>
                    <option value="B">B - Skeptics</option>
                    <option value="C">C - Newbies</option>
                  </>
                )}
              </select>
              <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} className={`px-4 py-2.5 border rounded-xl text-sm flex items-center gap-2 justify-center transition-colors ${showAdvancedFilters || activeFilterCount > 0 ? 'bg-purple-600 border-purple-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                Filters {activeFilterCount > 0 && <span className="bg-white text-purple-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{activeFilterCount}</span>}
              </button>
              <button onClick={exportToCSV} className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 text-sm hover:bg-zinc-800 hover:text-white transition-colors flex items-center gap-2 justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Export
              </button>
              <button onClick={fetchParticipants} disabled={participantsLoading} className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 text-sm hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-2 justify-center">
                <svg className={`w-4 h-4 ${participantsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Refresh
              </button>
            </div>

            {showAdvancedFilters && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">Advanced Filters</h3>{activeFilterCount > 0 && <button onClick={clearAllFilters} className="text-xs text-purple-400 hover:text-purple-300">Clear all filters</button>}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Reason',      value: reasonFilter,  onChange: (v:string)=>setReasonFilter(v),  options: [{ v: 'all', l: 'All Reasons' },   ...uniqueReasons.map(r=>({v:r,l:r}))]       },
                    { label: 'Country',     value: countryFilter, onChange: (v:string)=>setCountryFilter(v), options: [{ v: '', l: 'All Countries' },    ...uniqueCountries.map(c=>({v:c,l:c}))]    },
                    { label: 'City',        value: cityFilter,    onChange: (v:string)=>setCityFilter(v),    options: [{ v: '', l: 'All Cities' },        ...uniqueCities.map(c=>({v:c,l:c}))]      },
                    { label: 'Device',      value: deviceFilter,  onChange: (v:string)=>setDeviceFilter(v),  options: [{ v: '', l: 'All Devices' },       ...uniqueDevices.map(d=>({v:d,l:d}))]     },
                    { label: 'Email Domain',value: domainFilter,  onChange: (v:string)=>setDomainFilter(v),  options: [{ v: '', l: 'All Domains' },       ...uniqueDomains.map(d=>({v:d,l:`@${d}`}))] },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">{f.label}</label>
                      <select value={f.value} onChange={e => f.onChange(e.target.value)} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-600 cursor-pointer">
                        {f.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </div>
                  ))}
                  <div><label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Date From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-600" /></div>
                  <div><label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Date To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-600" /></div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-zinc-500 text-xs sm:text-sm">
                {filteredParticipants.length === (variant === 'main' ? mergedParticipants.length : currentParticipants.length)
                  ? `${filteredParticipants.length} participants`
                  : `${filteredParticipants.length} of ${variant === 'main' ? mergedParticipants.length : currentParticipants.length} participants`}
                {variant === 'main' && <span className="text-zinc-600 ml-1">(Main {currentParticipants.length} + Quiz {currentOtherParticipants.length})</span>}
              </p>
              <div className="flex items-center gap-2">
                <p className={`text-xs px-2 py-0.5 rounded ${variant === 'main' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-400'}`}>{variant === 'main' ? 'Main' : 'Quiz'}</p>
                <p className={`text-xs px-2 py-0.5 rounded ${activeSource === 'klaviyo' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{activeSource === 'klaviyo' ? 'Klaviyo' : 'Supabase'}</p>
              </div>
            </div>

            {participantsLoading ? (
              <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin" /></div>
            ) : filteredParticipants.length === 0 ? (
              <div className="text-center py-16 text-zinc-600">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <p className="text-sm">{searchQuery || activeFilterCount > 0 ? 'No matching participants found.' : 'No participants yet.'}</p>
                {activeFilterCount > 0 && <button onClick={clearAllFilters} className="mt-2 text-purple-400 hover:text-purple-300 text-sm">Clear all filters</button>}
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead><tr className="border-b border-zinc-800/80 bg-zinc-900/60">
                        <th className="px-3 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold w-10">#</th>
                        {variant === 'main' && <th className="px-2 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold w-16">LP</th>}
                        {[{f:'email' as const,l:'Email'},{f:'segment' as const,l:variant === 'type' ? 'Type' : 'Seg'},{f:null,l:'Source'},{f:'country' as const,l:'Location'},{f:null,l:'Device'},{f:'signed_up_at' as const,l:'Date'}].map(col => (
                          <th key={col.l} className={`px-3 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold ${col.f ? 'cursor-pointer hover:text-zinc-300 select-none' : ''}`} onClick={() => col.f && handleSort(col.f)}>
                            <span className="flex items-center gap-1">{col.l}{col.f && sortField === col.f && <span className="text-white">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                          </th>
                        ))}
                        <th className="px-3 py-3 w-10"></th>
                      </tr></thead>
                      <tbody>
                        {filteredParticipants.map((p, i) => {
                          const vTag = (p as any)._variantTag as 'main' | 'type' | undefined;
                          return (
                          <tr key={p.id || i} className="border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors">
                            <td className="px-3 py-3 text-xs text-zinc-600 font-mono">{i + 1}</td>
                            {variant === 'main' && (
                              <td className="px-2 py-3">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${vTag === 'main' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-400'}`}>
                                  {vTag === 'main' ? 'Main' : 'Quiz'}
                                </span>
                              </td>
                            )}
                            <td className="px-3 py-3 text-sm text-white font-medium max-w-[180px] truncate">{p.email}</td>
                            <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md border ${segColor(vTag === 'type' ? (p.afterfeel_type || p.sub_reason) : p.segment)}`}>{segLabel(p.segment, p)}</span></td>
                            <td className="px-3 py-3 text-xs text-zinc-400 max-w-[100px] truncate">{(() => { const s = trafficSourceLabel(p); return <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md border ${s.color}`}>{s.label}</span>; })()}</td>
                            <td className="px-3 py-3 text-xs text-zinc-300 whitespace-nowrap">{p.city && p.country ? `${p.city}, ${p.country}` : p.country || '—'}</td>
                            <td className="px-3 py-3 text-sm whitespace-nowrap">{deviceIcon(p.device_type)}</td>
                            <td className="px-3 py-3 text-xs text-zinc-500 font-mono whitespace-nowrap">{fmtDate(p.signed_up_at)}</td>
                            <td className="px-3 py-3"><button onClick={() => setSelectedParticipant(p)} className="text-zinc-600 hover:text-white transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button></td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile Cards */}
                <div className="sm:hidden space-y-2">
                  {filteredParticipants.map((p, i) => {
                    const vTag = (p as any)._variantTag as 'main' | 'type' | undefined;
                    return (
                    <div key={p.id || i} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-3 space-y-2" onClick={() => setSelectedParticipant(p)}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 flex items-center gap-1.5">
                          {variant === 'main' && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${vTag === 'main' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-400'}`}>{vTag === 'main' ? 'Main' : 'Quiz'}</span>}
                          <div className="min-w-0"><p className="text-sm font-medium text-white truncate">{p.email}</p><div className="flex items-center gap-2 mt-0.5">{p.city && <span className="text-[10px] text-zinc-500">{p.city}, {p.country}</span>}{p.device_type && <span className="text-xs">{deviceIcon(p.device_type)}</span>}</div></div>
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md border shrink-0 ${segColor(vTag === 'type' ? (p.afterfeel_type || p.sub_reason) : p.segment)}`}>{segLabel(p.segment, p)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">{(() => { const s = trafficSourceLabel(p); return <span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded border ${s.color}`}>{s.label}</span>; })()}<span className="text-zinc-600 font-mono whitespace-nowrap ml-auto">{fmtDate(p.signed_up_at)}</span></div>
                    </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Detail Modal */}
        {selectedParticipant && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedParticipant(null)}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-5 sm:p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between">
                <div><p className="text-lg font-bold text-white">{selectedParticipant.email}</p>{selectedParticipant.name && <p className="text-sm text-zinc-400">{selectedParticipant.name}</p>}</div>
                <button onClick={() => setSelectedParticipant(null)} className="text-zinc-500 hover:text-white p-1"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-lg border ${segColor(variant === 'type' ? (selectedParticipant.afterfeel_type || selectedParticipant.sub_reason) : selectedParticipant.segment)}`}>{segLabel(selectedParticipant.segment, selectedParticipant)}</span>
                {(() => { const s = trafficSourceLabel(selectedParticipant); return <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-lg border ${s.color}`}>{s.label}</span>; })()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {l:'Country',      v:selectedParticipant.country},
                  {l:'Region',       v:selectedParticipant.region},
                  {l:'City',         v:selectedParticipant.city},
                  {l:'Device',       v:selectedParticipant.device_type},
                  {l:'Language',     v:selectedParticipant.language},
                  {l:'Timezone',     v:selectedParticipant.timezone},
                  {l:'IP Address',   v:selectedParticipant.ip_address},
                  {l:'Referrer',     v:selectedParticipant.referrer},
                  {l:'UTM Source',   v:selectedParticipant.utm_source},
                  {l:'UTM Medium',   v:selectedParticipant.utm_medium},
                  {l:'UTM Campaign', v:selectedParticipant.utm_campaign},
                  {l:'Source',       v:selectedParticipant.source},
                  {l:'Afterfeel Type',v:selectedParticipant.afterfeel_type},
                  {l:'Signed Up',    v:fmtDate(selectedParticipant.signed_up_at)},
                ].map(item => (
                  <div key={item.l} className="bg-zinc-800/50 rounded-lg p-2.5">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">{item.l}</p>
                    <p className="text-xs text-white font-medium truncate">{item.v || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════ ANALYTICS ══════ */}
        {viewMode === 'analytics' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm sm:text-base font-bold text-zinc-400 uppercase tracking-widest">Funnel Analytics</h2>
                <span className={`text-xs px-2 py-0.5 rounded border ${variant === 'main' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-purple-500/10 text-purple-400 border-purple-500/30'}`}>{variant === 'main' ? 'Main Teaser' : 'Quiz Type'}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[{key:'all',label:'All'},{key:'today',label:'Today'},{key:'yesterday',label:'Yesterday'},{key:'last_7_days',label:'Last 7D'},{key:'this_week',label:'This Week'},{key:'this_month',label:'This Month'},{key:'last_month',label:'Last Month'}].map(opt => (
                  <button key={opt.key} onClick={() => { setAnalyticsPeriod(opt.key); setAnalyticsDateFrom(''); setAnalyticsDateTo(''); }} className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-all ${analyticsPeriod === opt.key ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>{opt.label}</button>
                ))}
                {availableMonths.length > 1 && (
                  <select value={analyticsPeriod.match(/^\d{4}-\d{2}$/) ? analyticsPeriod : ''} onChange={e => { if (e.target.value) setAnalyticsPeriod(e.target.value); }} className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-[10px] sm:text-xs text-zinc-400 focus:outline-none cursor-pointer">
                    <option value="">Month...</option>{availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                <button onClick={fetchAnalytics} disabled={analyticsLoading} className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 text-xs hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-1.5">
                  <svg className={`w-3.5 h-3.5 ${analyticsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Refresh
                </button>
              </div>
            </div>

            {/* Custom Date Range + Traffic Filter + IP 제외 */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Range:</label>
                  <input type="date" value={analyticsDateFrom} onChange={e => { setAnalyticsDateFrom(e.target.value); if (e.target.value && analyticsDateTo) setAnalyticsPeriod('custom_range'); }} className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-zinc-600" />
                  <span className="text-zinc-600 text-xs">→</span>
                  <input type="date" value={analyticsDateTo} onChange={e => { setAnalyticsDateTo(e.target.value); if (analyticsDateFrom && e.target.value) setAnalyticsPeriod('custom_range'); }} className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-zinc-600" />
                  {analyticsPeriod === 'custom_range' && <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">Custom</span>}
                </div>
                <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
                  {([{key:'all' as const,label:'All',icon:'🌐'},{key:'paid' as const,label:'Paid',icon:'💰'},{key:'organic' as const,label:'Organic',icon:'🌱'}]).map(opt => (
                    <button key={opt.key} onClick={() => setTrafficFilter(opt.key)} className={`px-2.5 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 ${trafficFilter === opt.key ? (opt.key === 'paid' ? 'bg-red-500 text-white' : opt.key === 'organic' ? 'bg-emerald-500 text-white' : 'bg-white text-black') : 'text-zinc-500 hover:text-zinc-300'}`}><span>{opt.icon}</span>{opt.label}</button>
                  ))}
                </div>
                <button onClick={() => setShowIPFilter(v => !v)} className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${excludeIPs.length > 0 ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'}`}>
                  🚫 IP 제외 {excludeIPs.length > 0 && <span className="bg-red-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">{excludeIPs.length}</span>}
                </button>
              </div>

              {/* ✅ IP 제외 필터 패널 */}
              {showIPFilter && (
                <div className="bg-zinc-900/60 border border-zinc-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-white">🚫 제외 IP 관리 <span className="text-zinc-500 font-normal">(테스트/사무실 IP)</span></p>
                    {excludeIPs.length > 0 && <button onClick={() => { setExcludeIPs([]); localStorage.setItem('piilk_exclude_ips', '[]'); }} className="text-[10px] text-red-400 hover:text-red-300">전체 삭제</button>}
                  </div>

                  {/* ✅ 봇 IP 원클릭 추가 */}
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] text-zinc-500">빠른 추가:</span>
                    <button onClick={() => {
                      const botIPs = ['209.38','64.23','137.184','146.190','24.199','134.199','147.182','165.225','143.110','176.3','172.56'];
                      const newIPs = Array.from(new Set([...excludeIPs, ...botIPs]));
                      setExcludeIPs(newIPs);
                      localStorage.setItem('piilk_exclude_ips', JSON.stringify(newIPs));
                    }} className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold hover:bg-orange-500/30">
                      🤖 DigitalOcean 봇 전체 ({['209.38','64.23','137.184','146.190','24.199','134.199','147.182','165.225','143.110','176.3','172.56'].filter(ip => !excludeIPs.includes(ip)).length}개 추가)
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text" value={excludeIPInput} onChange={e => setExcludeIPInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && excludeIPInput.trim()) {
                          // 줄바꿈/쉼표로 구분된 여러 IP 한번에 추가
                          const newEntries = excludeIPInput.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
                          const newIPs = Array.from(new Set([...excludeIPs, ...newEntries]));
                          setExcludeIPs(newIPs);
                          localStorage.setItem('piilk_exclude_ips', JSON.stringify(newIPs));
                          setExcludeIPInput('');
                        }
                      }}
                      placeholder="예: 123.456 또는 여러 IP를 줄바꿈/쉼표로 입력"
                      className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
                    />
                    <button onClick={() => {
                      if (!excludeIPInput.trim()) return;
                      const newEntries = excludeIPInput.split(/[\n,\s]+/).map((s: string) => s.trim()).filter(Boolean);
                      const newIPs = Array.from(new Set([...excludeIPs, ...newEntries]));
                      setExcludeIPs(newIPs);
                      localStorage.setItem('piilk_exclude_ips', JSON.stringify(newIPs));
                      setExcludeIPInput('');
                    }} className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-500">추가</button>
                  </div>
                  {excludeIPs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {excludeIPs.map((ip: string, i: number) => (
                        <span key={i} className="flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-mono px-2 py-0.5 rounded-full">
                          {ip}
                          <button onClick={() => {
                            const newIPs = excludeIPs.filter((_: string, j: number) => j !== i);
                            setExcludeIPs(newIPs);
                            localStorage.setItem('piilk_exclude_ips', JSON.stringify(newIPs));
                          }} className="text-red-500 hover:text-red-300 ml-0.5">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-zinc-600">부분 IP 입력 가능 (예: <span className="font-mono text-zinc-500">192.168</span> → 해당 대역 전체 제외) · 여러 IP 동시 입력 가능 · 설정은 브라우저에 저장됩니다</p>
                </div>
              )}
            </div>

            {/* Meta Ads Upload */}
            <div className="flex items-center gap-3">
              <input ref={metaFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const XLSX = await import('xlsx');
                  const buf = await file.arrayBuffer();
                  const wb = XLSX.read(buf, {type:'array'});
                  const ws = wb.Sheets[wb.SheetNames[0]];
                  const rows: any[] = XLSX.utils.sheet_to_json(ws);
                  const parsed = rows.map((r:any) => {
                    const name = r['광고 이름']||r['Ad Name']||'';
                    const nl = name.toLowerCase();
                    return {
                      adName: name,
                      date: r['보고 시작']||'',
                      status: r['광고 게재']||'',
                      results: Number(r['결과']||0)||0,
                      reach: Number(r['도달']||0)||0,
                      spend: Number(r['지출 금액 (USD)']||0)||0,
                      impressions: Number(r['노출']||0)||0,
                      linkClicks: Number(r['링크 클릭']||0)||0,
                      cpc: Number(r['CPC(링크 클릭당 비용) (USD)']||0)||0,
                      ctrLink: Number(r['CTR(링크 클릭률)']||0)||0,
                      allClicks: Number(r['클릭(전체)']||0)||0,
                      landingPageViews: Number(r['랜딩 페이지 조회']||0)||0,
                      variant: nl.includes('_main')||nl.includes('main') ? 'main' : nl.includes('_type')||nl.includes('type') ? 'type' : 'unknown'
                    };
                  }).filter((r:any) => r.spend > 0 || r.impressions > 0);
                  setMetaAdsData(parsed);
                  if (parsed.length > 0) setMetaAdsDate(parsed[0].date);
                } catch(err) { alert('파일 파싱 실패'); }
              }} className="hidden" />
              <button onClick={() => metaFileRef.current?.click()} className="px-3 py-1.5 bg-blue-600/20 border border-blue-600/30 rounded-lg text-xs text-blue-400 hover:bg-blue-600/30 transition-colors flex items-center gap-1.5"><span>📊</span>Upload Meta Ads Report</button>
              {metaAdsDate && <span className="text-[10px] text-blue-400">✓ {metaAdsDate} ({metaAdsData.length} ads)</span>}
            </div>

            {analyticsLoading && !analyticsData ? (
              <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin" /></div>
            ) : analyticsData ? (
              <>
                <UtmSourceStatsSection />

                {/* Meta Ads Comparison */}
                {metaAdsData.length > 0 && (() => {
                  const metaTotal = metaAdsData.reduce((acc:any, ad:any) => ({
                    spend: acc.spend + ad.spend, impressions: acc.impressions + ad.impressions,
                    linkClicks: acc.linkClicks + ad.linkClicks, landingPageViews: acc.landingPageViews + ad.landingPageViews,
                    results: acc.results + ad.results
                  }), { spend:0, impressions:0, linkClicks:0, landingPageViews:0, results:0 });
                  const ourSubmits = currentParticipants.filter(p => p.signed_up_at?.slice(0,10) === metaAdsDate && normalizeUtmSource(p.utm_source) === 'meta').length;
                  return (
                    <div className="bg-gradient-to-br from-blue-950/30 to-zinc-900/60 border border-blue-900/40 rounded-xl p-4 sm:p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2"><span className="text-base">📊</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Meta Ads vs Dashboard</h3><span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">{metaAdsDate}</span></div>
                        <button onClick={() => { setMetaAdsData([]); setMetaAdsDate(''); }} className="text-[10px] text-zinc-500 hover:text-red-400">✕ Remove</button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                        <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3"><p className="text-[8px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">Meta Spend</p><p className="text-xl font-black text-white">${metaTotal.spend.toFixed(2)}</p></div>
                        <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3"><p className="text-[8px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">Link Clicks</p><p className="text-xl font-black text-white">{metaTotal.linkClicks}</p></div>
                        <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3"><p className="text-[8px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">LP Views</p><p className="text-xl font-black text-amber-400">{metaTotal.landingPageViews}</p></div>
                        <div className="bg-emerald-950/30 border border-emerald-900/30 rounded-lg p-3"><p className="text-[8px] text-emerald-500 uppercase tracking-widest font-semibold mb-0.5">Our Submits</p><p className="text-xl font-black text-emerald-400">{ourSubmits}</p></div>
                      </div>
                      <div className="bg-zinc-800/30 rounded-lg p-3 mb-4">
                        <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-2">Full Funnel</p>
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="text-zinc-400">Impressions <span className="text-white font-bold">{metaTotal.impressions.toLocaleString()}</span></span>
                          <span className="text-zinc-600">→</span>
                          <span className="text-zinc-400">Clicks <span className="text-white font-bold">{metaTotal.linkClicks}</span></span>
                          <span className="text-zinc-600">→</span>
                          <span className="text-zinc-400">LP Views <span className="text-amber-400 font-bold">{metaTotal.landingPageViews}</span></span>
                          <span className="text-zinc-600">→</span>
                          <span className="text-zinc-400">Submits <span className="text-emerald-400 font-bold">{ourSubmits}</span></span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-[10px]">
                          <span className="text-zinc-500">CTR: <span className="text-white font-bold">{metaTotal.impressions > 0 ? ((metaTotal.linkClicks / metaTotal.impressions) * 100).toFixed(2) : '0'}%</span></span>
                          <span className="text-zinc-500">Click→Submit: <span className="text-emerald-400 font-bold">{metaTotal.linkClicks > 0 ? ((ourSubmits / metaTotal.linkClicks) * 100).toFixed(1) : '0'}%</span></span>
                          <span className="text-zinc-500">CPA: <span className="text-amber-400 font-bold">{ourSubmits > 0 ? `$${(metaTotal.spend / ourSubmits).toFixed(2)}` : 'N/A'}</span></span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead><tr className="border-b border-zinc-800/80">
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold">Ad</th>
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold">Variant</th>
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold text-right">Spend</th>
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold text-right">Clicks</th>
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold text-right">LP Views</th>
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold text-right">CTR</th>
                            <th className="px-2 py-1.5 text-[9px] text-zinc-500 uppercase font-semibold text-right">Results</th>
                          </tr></thead>
                          <tbody>
                            {metaAdsData.map((ad:any, i:number) => (
                              <tr key={i} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                                <td className="px-2 py-1.5 text-xs text-white max-w-[180px] truncate">{ad.adName}</td>
                                <td className="px-2 py-1.5"><span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${ad.variant === 'main' ? 'bg-emerald-500/20 text-emerald-400' : ad.variant === 'type' ? 'bg-purple-500/20 text-purple-400' : 'bg-zinc-700/30 text-zinc-500'}`}>{ad.variant}</span></td>
                                <td className="px-2 py-1.5 text-xs text-white text-right font-mono">${ad.spend.toFixed(2)}</td>
                                <td className="px-2 py-1.5 text-xs text-zinc-300 text-right font-mono">{ad.linkClicks}</td>
                                <td className="px-2 py-1.5 text-xs text-amber-400 text-right font-mono">{ad.landingPageViews}</td>
                                <td className="px-2 py-1.5 text-xs text-zinc-400 text-right font-mono">{ad.ctrLink?.toFixed(2)}%</td>
                                <td className="px-2 py-1.5 text-xs text-emerald-400 text-right font-mono font-bold">{ad.results}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                {/* Paid vs Organic */}
                {filteredAnalytics?.paidVsOrganic && (
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
                    <div className="flex items-center gap-2 mb-4"><span className="text-base">💰</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Paid vs Organic</h3></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-sm font-bold text-red-400">Paid</span></div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="text-center"><p className="text-2xl font-black text-white">{filteredAnalytics.paidVsOrganic.paid.views}</p><p className="text-[8px] text-zinc-500 uppercase mt-1">Views</p></div>
                          <div className="text-center"><p className="text-2xl font-black text-emerald-400">{filteredAnalytics.paidVsOrganic.paid.submits}</p><p className="text-[8px] text-zinc-500 uppercase mt-1">Submits</p></div>
                          <div className="text-center"><p className={`text-2xl font-black ${Number(filteredAnalytics.paidVsOrganic.paid.cvr) > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>{filteredAnalytics.paidVsOrganic.paid.cvr}%</p><p className="text-[8px] text-zinc-500 uppercase mt-1">CVR</p></div>
                        </div>
                      </div>
                      <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><span className="text-sm font-bold text-emerald-400">Organic</span></div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="text-center"><p className="text-2xl font-black text-white">{filteredAnalytics.paidVsOrganic.organic.views}</p><p className="text-[8px] text-zinc-500 uppercase mt-1">Views</p></div>
                          <div className="text-center"><p className="text-2xl font-black text-emerald-400">{filteredAnalytics.paidVsOrganic.organic.submits}</p><p className="text-[8px] text-zinc-500 uppercase mt-1">Submits</p></div>
                          <div className="text-center"><p className={`text-2xl font-black ${Number(filteredAnalytics.paidVsOrganic.organic.cvr) > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>{filteredAnalytics.paidVsOrganic.organic.cvr}%</p><p className="text-[8px] text-zinc-500 uppercase mt-1">CVR</p></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 sm:p-4"><p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest mb-1">Visitors</p><p className="text-xl sm:text-2xl font-black text-white">{filteredAnalytics?.totalVisitors}</p></div>
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 sm:p-4"><p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest mb-1">Sessions</p><p className="text-xl sm:text-2xl font-black text-white">{filteredAnalytics?.totalSessions}</p></div>
                  <div className="bg-emerald-950/30 border border-emerald-900/30 rounded-xl p-3 sm:p-4"><p className="text-[10px] sm:text-xs text-emerald-500 uppercase tracking-widest mb-1">Submits</p><p className="text-xl sm:text-2xl font-black text-emerald-400">{filteredAnalytics?.funnel?.step4_submit || 0}</p></div>
                  <div className="bg-purple-950/30 border border-purple-900/30 rounded-xl p-3 sm:p-4"><p className="text-[10px] sm:text-xs text-purple-500 uppercase tracking-widest mb-1">CVR</p><p className="text-xl sm:text-2xl font-black text-purple-400">{filteredAnalytics?.funnel?.page_view > 0 ? ((filteredAnalytics.funnel.step4_submit / filteredAnalytics.funnel.page_view) * 100).toFixed(1) : '0'}%</p></div>
                </div>

                {/* Funnel */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-4 sm:mb-6"><span className="text-base">🎯</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Conversion Funnel</h3></div>
                  <div className="space-y-3">
                    {[
                      {key:'page_view',        label:'Page View',    desc:'Landed on site',         color:'bg-zinc-500'   },
                      {key:'step1_cta_click',   label:'Get in Line',  desc:'Clicked CTA',            color:'bg-sky-500'    },
                      {key:'step2_answer',      label:'Answered',     desc:'Selected Yes/No/Never',  color:'bg-amber-500'  },
                      {key:'step3_email_focus', label:'Email Focus',  desc:'Started typing email',   color:'bg-purple-500' },
                      {key:'step4_submit',      label:'Submitted',    desc:'Completed signup',        color:'bg-emerald-500'},
                    ].map((step, idx) => {
                      const count = filteredAnalytics?.funnel?.[step.key] || 0;
                      const pv = filteredAnalytics?.funnel?.page_view || 1;
                      const prevKey = ['page_view','step1_cta_click','step2_answer','step3_email_focus','step4_submit'][idx-1];
                      const prev = idx === 0 ? count : (filteredAnalytics?.funnel?.[prevKey] || 1);
                      const pct = pv > 0 ? (count / pv) * 100 : 0;
                      const drop = idx > 0 && prev > 0 ? ((1 - count / prev) * 100).toFixed(0) : null;
                      return (
                        <div key={step.key}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${step.color}`} /><span className="text-xs sm:text-sm font-semibold text-white">{step.label}</span><span className="text-[10px] text-zinc-600 hidden sm:inline">{step.desc}</span></div>
                            <div className="flex items-center gap-3"><span className="text-sm sm:text-base font-black text-white">{count}</span>{drop && Number(drop) > 0 && <span className="text-[10px] text-red-400 font-medium">-{drop}%</span>}</div>
                          </div>
                          <div className="h-6 sm:h-8 bg-zinc-800/50 rounded-lg overflow-hidden">
                            <div className={`h-full rounded-lg ${step.color} transition-all duration-700 flex items-center px-2`} style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}>
                              {pct >= 10 && <span className="text-[10px] sm:text-xs text-white font-bold">{pct.toFixed(0)}%</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* UTM Performance */}
                {filteredAnalytics?.utmPerformance?.length > 0 && (
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
                    <div className="flex items-center gap-2 mb-4"><span className="text-base">🔗</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">UTM Source Performance</h3></div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead><tr className="border-b border-zinc-800/80">
                          <th className="px-3 py-2 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Source</th>
                          <th className="px-3 py-2 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold text-right">Views</th>
                          <th className="px-3 py-2 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold text-right">Submits</th>
                          <th className="px-3 py-2 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold text-right">CVR</th>
                        </tr></thead>
                        <tbody>
                          {filteredAnalytics.utmPerformance.map((utm: any) => (
                            <tr key={utm.source} className="border-b border-zinc-800/40">
                              <td className="px-3 py-2.5 text-sm text-white font-medium">{utm.source}</td>
                              <td className="px-3 py-2.5 text-sm text-zinc-400 text-right font-mono">{utm.views}</td>
                              <td className="px-3 py-2.5 text-sm text-emerald-400 text-right font-mono font-bold">{utm.submits}</td>
                              <td className="px-3 py-2.5 text-right"><span className={`text-sm font-bold font-mono ${Number(utm.cvr) > 5 ? 'text-emerald-400' : Number(utm.cvr) > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>{utm.cvr}%</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Campaign Performance */}
                {filteredAnalytics?.campaignPerformance?.length > 0 && (
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
                    <div className="flex items-center gap-2 mb-4"><span className="text-base">🎯</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Campaign Performance</h3></div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead><tr className="border-b border-zinc-800/80">
                          <th className="px-3 py-2 text-[10px] text-zinc-500 uppercase font-semibold">Campaign</th>
                          <th className="px-3 py-2 text-[10px] text-zinc-500 uppercase font-semibold">Source</th>
                          <th className="px-3 py-2 text-[10px] text-zinc-500 uppercase font-semibold">Type</th>
                          <th className="px-3 py-2 text-[10px] text-zinc-500 uppercase font-semibold text-right">Views</th>
                          <th className="px-3 py-2 text-[10px] text-zinc-500 uppercase font-semibold text-right">Submits</th>
                          <th className="px-3 py-2 text-[10px] text-zinc-500 uppercase font-semibold text-right">CVR</th>
                        </tr></thead>
                        <tbody>
                          {filteredAnalytics.campaignPerformance.map((c:any) => (
                            <tr key={c.campaign} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                              <td className="px-3 py-2.5 text-sm text-white max-w-[200px] truncate" title={c.campaign}>{c.campaign}</td>
                              <td className="px-3 py-2.5 text-xs text-zinc-400">{c.source}</td>
                              <td className="px-3 py-2.5">{c.isPaid ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold">PAID</span> : <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">ORG</span>}</td>
                              <td className="px-3 py-2.5 text-sm text-zinc-400 text-right font-mono">{c.views}</td>
                              <td className="px-3 py-2.5 text-sm text-emerald-400 text-right font-mono font-bold">{c.submits}</td>
                              <td className="px-3 py-2.5 text-right"><span className={`text-sm font-bold font-mono ${Number(c.cvr) > 5 ? 'text-emerald-400' : Number(c.cvr) > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>{c.cvr}%</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Hourly */}
                {filteredAnalytics?.hourly?.some((h: any) => h.count > 0) && (
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-4"><span className="text-base">🕒</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Signup by Hour</h3></div>
                    <div className="h-24 sm:h-32 flex items-end gap-[2px]">
                      {filteredAnalytics.hourly.map((h: any) => {
                        const maxH = Math.max(...filteredAnalytics.hourly.map((x: any) => x.count), 1);
                        return (
                          <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">{h.label}: {h.count}</div>
                            <div className="w-full bg-purple-500/60 group-hover:bg-purple-400 rounded-t-sm transition-all" style={{ height: `${Math.max((h.count / maxH) * 100, h.count > 0 ? 3 : 0)}%` }} />
                            {h.hour % 4 === 0 && <span className="text-[7px] text-zinc-600 mt-0.5 font-mono">{h.hour}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Period Breakdown */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-4"><span className="text-base">📅</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Period Breakdown</h3></div>

                  {filteredAnalytics?.daily?.length > 0 && (
                    <div className="mb-6">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-2">Daily</p>
                      <div className="overflow-x-auto max-h-60 overflow-y-auto">
                        <table className="w-full text-left">
                          <thead className="sticky top-0 bg-zinc-900"><tr className="border-b border-zinc-800/80">
                            <th className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Date</th>
                            <th className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold text-right">Views</th>
                            <th className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold text-right">CTA</th>
                            <th className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold text-right">Submits</th>
                          </tr></thead>
                          <tbody>
                            {[...filteredAnalytics.daily].reverse().map((d: any) => (
                              <tr key={d.date} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                                <td className="px-3 py-1.5 text-xs text-zinc-300 font-mono">{d.date}</td>
                                <td className="px-3 py-1.5 text-xs text-zinc-400 text-right font-mono">{d.page_view || 0}</td>
                                <td className="px-3 py-1.5 text-xs text-zinc-400 text-right font-mono">{d.step1_cta_click || 0}</td>
                                <td className="px-3 py-1.5 text-xs text-emerald-400 text-right font-mono font-bold">{d.step4_submit || 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {filteredAnalytics?.weekly?.length > 0 && (
                    <div className="mb-6">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-2">Weekly</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead><tr className="border-b border-zinc-800/80">
                            <th className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Week</th>
                            <th className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold text-right">Views</th>
                            <th className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold text-right">Submits</th>
                            <th className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold text-right">CVR</th>
                          </tr></thead>
                          <tbody>
                            {[...filteredAnalytics.weekly].reverse().map((w: any) => (
                              <tr key={w.week} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                                <td className="px-3 py-1.5 text-xs text-zinc-300 font-mono">{w.week}</td>
                                <td className="px-3 py-1.5 text-xs text-zinc-400 text-right font-mono">{w.views}</td>
                                <td className="px-3 py-1.5 text-xs text-emerald-400 text-right font-mono font-bold">{w.submits}</td>
                                <td className="px-3 py-1.5 text-xs text-purple-400 text-right font-mono">{w.views > 0 ? ((w.submits / w.views) * 100).toFixed(1) : '0'}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredAnalytics?.weekday && (
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-2">By Weekday</p>
                        <div className="space-y-1">
                          {filteredAnalytics.weekday.map((wd: any) => {
                            const mv = Math.max(...filteredAnalytics.weekday.map((x: any) => x.views), 1);
                            return (
                              <div key={wd.day} className="flex items-center gap-2">
                                <span className="text-[10px] text-zinc-400 w-8 text-right font-mono">{wd.day}</span>
                                <div className="flex-1 h-5 bg-zinc-800/50 rounded-md overflow-hidden relative">
                                  <div className="h-full rounded-md bg-sky-500/70 transition-all" style={{width:`${mv>0?Math.max((wd.views/mv)*100,wd.views>0?2:0):0}%`}} />
                                  <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white font-medium">{wd.views}v / {wd.submits}s</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {filteredAnalytics?.monthly?.length > 0 && (
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-2">By Month</p>
                        <div className="space-y-1">
                          {filteredAnalytics.monthly.map((m: any) => {
                            const mv = Math.max(...filteredAnalytics.monthly.map((x: any) => x.views), 1);
                            return (
                              <div key={m.month} className="flex items-center gap-2">
                                <span className="text-[10px] text-zinc-400 w-16 text-right font-mono">{m.month}</span>
                                <div className="flex-1 h-5 bg-zinc-800/50 rounded-md overflow-hidden relative">
                                  <div className="h-full rounded-md bg-amber-500/70 transition-all" style={{width:`${mv>0?Math.max((m.views/mv)*100,m.views>0?2:0):0}%`}} />
                                  <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white font-medium">{m.views}v / {m.submits}s</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Segment & Reason Distribution */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                  {filteredAnalytics?.segmentDistribution && Object.keys(filteredAnalytics.segmentDistribution).length > 0 && (
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                      <div className="flex items-center gap-2 mb-3"><span className="text-base">📊</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Segment Split (Events)</h3></div>
                      <div className="space-y-2">
                        {Object.entries(filteredAnalytics.segmentDistribution).sort((a:any,b:any) => b[1]-a[1]).map(([seg, count]:any) => {
                          const total = Object.values(filteredAnalytics.segmentDistribution).reduce((s:any,v:any) => s+v, 0) as number;
                          const sn: Record<string,string> = {A:'Hot Leads',B:'Skeptic',C:'Newbie'};
                          const sc: Record<string,string> = {A:'bg-emerald-500',B:'bg-amber-500',C:'bg-sky-500'};
                          return (
                            <div key={seg} className="flex items-center gap-2">
                              <span className="text-xs text-zinc-400 w-16 text-right">{sn[seg]||seg}</span>
                              <div className="flex-1 h-5 bg-zinc-800/50 rounded-md overflow-hidden relative">
                                <div className={`h-full rounded-md ${sc[seg]||'bg-zinc-500'}`} style={{width:`${total>0?Math.max((count/total)*100,2):0}%`}} />
                                <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white font-medium">{count} ({total>0?((count/total)*100).toFixed(0):0}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {filteredAnalytics?.reasonDistribution && Object.keys(filteredAnalytics.reasonDistribution).length > 0 && (
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                      <div className="flex items-center gap-2 mb-3"><span className="text-base">🔍</span><h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Pain Points (Seg A)</h3></div>
                      <div className="space-y-2">
                        {Object.entries(filteredAnalytics.reasonDistribution).sort((a:any,b:any) => b[1]-a[1]).map(([reason, count]:any) => {
                          const total = Object.values(filteredAnalytics.reasonDistribution).reduce((s:any,v:any) => s+v, 0) as number;
                          return (
                            <div key={reason} className="flex items-center gap-2">
                              <span className="text-xs text-zinc-400 w-20 text-right capitalize">{reason}</span>
                              <div className="flex-1 h-5 bg-zinc-800/50 rounded-md overflow-hidden relative">
                                <div className="h-full rounded-md bg-emerald-500" style={{width:`${total>0?Math.max((count/total)*100,2):0}%`}} />
                                <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white font-medium">{count} ({total>0?((count/total)*100).toFixed(0):0}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center text-zinc-500 py-12">No analytics data yet. Visit teaser site to start collecting.</div>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="text-center pt-4 sm:pt-6 border-t border-zinc-900/50">
          <p className="text-[10px] sm:text-xs text-zinc-700">PIILK Internal - Confidential</p>
        </footer>
      </div>
    </main>
  );
}

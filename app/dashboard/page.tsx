'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

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
}

interface ParticipantsResponse {
  success: boolean;
  data: Participant[];
  total: number;
}

/* ─────────────────────────── Component ─────────────────────────── */

export default function DashboardPage() {
  // Auth
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // Dashboard data
  const [supabaseData, setSupabaseData] = useState<DashboardData | null>(null);
  const [klaviyoData, setKlaviyoData] = useState<DashboardData | null>(null);
  const [activeSource, setActiveSource] = useState<'klaviyo' | 'supabase'>('klaviyo');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  // View mode
  const [viewMode, setViewMode] = useState<'overview' | 'participants'>('overview');

  // Participant list
  const [participants, setParticipants] = useState<{ klaviyo: Participant[]; supabase: Participant[] }>({ klaviyo: [], supabase: [] });
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

  const fetchData = async () => {
    try {
      const res = await fetch('/api/dashboard/stats');
      const result: ApiResponse = await res.json();
      if (result.success) {
        setSupabaseData(result.supabase);
        setKlaviyoData(result.klaviyo);
        setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchParticipants = useCallback(async () => {
    setParticipantsLoading(true);
    try {
      const [kRes, sRes] = await Promise.all([
        fetch('/api/dashboard/participants?source=klaviyo'),
        fetch('/api/dashboard/participants?source=supabase'),
      ]);
      const kResult: ParticipantsResponse = await kRes.json();
      const sResult: ParticipantsResponse = await sRes.json();
      setParticipants({
        klaviyo: kResult.success ? kResult.data : [],
        supabase: sResult.success ? sResult.data : [],
      });
    } catch (err) { console.error(err); }
    finally { setParticipantsLoading(false); }
  }, []);

  useEffect(() => {
    if (authenticated) { fetchData(); const iv = setInterval(fetchData, 30000); return () => clearInterval(iv); }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated && participants.klaviyo.length === 0 && participants.supabase.length === 0) {
      fetchParticipants();
    }
  }, [authenticated, fetchParticipants]);

  const currentParticipants = activeSource === 'klaviyo' ? participants.klaviyo : participants.supabase;

  /* ─── Today's signups ─── */
  const todaySignups = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    return currentParticipants.filter(p => {
      if (!p.signed_up_at) return false;
      return p.signed_up_at.slice(0, 10) === todayStr;
    }).length;
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

    // Fill gaps
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

  /* ─── Cumulative signups ─── */
  const cumulativeSignups = useMemo(() => {
    let cum = 0;
    return dailySignups.map(([day, count]) => {
      cum += count;
      return [day, cum] as [string, number];
    });
  }, [dailySignups]);

  // Unique filter options
  const uniqueReasons = useMemo(() => {
    const reasons = new Set<string>();
    currentParticipants.forEach(p => { if (p.sub_reason) reasons.add(p.sub_reason); });
    return Array.from(reasons).sort();
  }, [currentParticipants]);

  const uniqueDomains = useMemo(() => {
    const domains = new Set<string>();
    currentParticipants.forEach(p => {
      if (p.email && p.email.includes('@')) domains.add(p.email.split('@')[1].toLowerCase());
    });
    return Array.from(domains).sort();
  }, [currentParticipants]);

  const uniqueCountries = useMemo(() => {
    const s = new Set<string>();
    currentParticipants.forEach(p => { if (p.country) s.add(p.country); });
    return Array.from(s).sort();
  }, [currentParticipants]);

  const uniqueCities = useMemo(() => {
    const s = new Set<string>();
    currentParticipants.forEach(p => { if (p.city) s.add(p.city); });
    return Array.from(s).sort();
  }, [currentParticipants]);

  const uniqueDevices = useMemo(() => {
    const s = new Set<string>();
    currentParticipants.forEach(p => { if (p.device_type) s.add(p.device_type); });
    return Array.from(s).sort();
  }, [currentParticipants]);

  // Tracking analytics
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
    p.forEach(x => { const u = x.utm_source || 'Direct'; utmCounts[u] = (utmCounts[u] || 0) + 1; });

    const sortMap = (map: Record<string, number>) =>
      Object.entries(map).sort((a, b) => b[1] - a[1]);

    return {
      countries: sortMap(countryCounts),
      cities: sortMap(cityCounts).slice(0, 10),
      devices: sortMap(deviceCounts),
      utmSources: sortMap(utmCounts),
      hasTrackingData: p.some(x => x.country || x.device_type || x.utm_source),
    };
  }, [currentParticipants]);

  // Filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (segmentFilter !== 'all') count++;
    if (reasonFilter !== 'all') count++;
    if (domainFilter) count++;
    if (countryFilter) count++;
    if (cityFilter) count++;
    if (deviceFilter) count++;
    if (dateFrom) count++;
    if (dateTo) count++;
    return count;
  }, [segmentFilter, reasonFilter, domainFilter, countryFilter, cityFilter, deviceFilter, dateFrom, dateTo]);

  const clearAllFilters = () => {
    setSearchQuery(''); setSegmentFilter('all'); setReasonFilter('all');
    setDomainFilter(''); setCountryFilter(''); setCityFilter('');
    setDeviceFilter(''); setDateFrom(''); setDateTo('');
  };

  /* ─── ✅ Fixed date filter logic ─── */
  const filteredParticipants = useMemo(() => {
    let list = [...currentParticipants];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.email?.toLowerCase().includes(q) ||
        p.name?.toLowerCase().includes(q) ||
        p.segment?.toLowerCase().includes(q) ||
        p.sub_reason?.toLowerCase().includes(q) ||
        p.country?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.ip_address?.includes(q)
      );
    }

    if (segmentFilter !== 'all') list = list.filter(p => p.segment === segmentFilter);
    if (reasonFilter !== 'all') list = list.filter(p => p.sub_reason === reasonFilter);
    if (domainFilter) list = list.filter(p => p.email?.toLowerCase().endsWith('@' + domainFilter.toLowerCase()));
    if (countryFilter) list = list.filter(p => p.country === countryFilter);
    if (cityFilter) list = list.filter(p => p.city === cityFilter);
    if (deviceFilter) list = list.filter(p => p.device_type === deviceFilter);

    // ✅ Fixed: Date comparison using date-only strings (YYYY-MM-DD) to avoid timezone issues
    if (dateFrom) {
      list = list.filter(p => {
        if (!p.signed_up_at) return false;
        const pDate = p.signed_up_at.slice(0, 10);
        return pDate >= dateFrom;
      });
    }
    if (dateTo) {
      list = list.filter(p => {
        if (!p.signed_up_at) return false;
        const pDate = p.signed_up_at.slice(0, 10);
        return pDate <= dateTo;
      });
    }

    list.sort((a, b) => {
      const aVal = (a[sortField] || '').toLowerCase();
      const bVal = (b[sortField] || '').toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [currentParticipants, searchQuery, segmentFilter, reasonFilter, domainFilter, countryFilter, cityFilter, deviceFilter, dateFrom, dateTo, sortField, sortDir]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  /* ─── ✅ Excel export ─── */
  const exportToCSV = () => {
    const headers = ['Email', 'Segment', 'Reason', 'Country', 'Region', 'City', 'Device', 'Language', 'Timezone', 'IP', 'Referrer', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Source', 'Signed Up'];
    const rows = filteredParticipants.map(p => [
      p.email || '', p.segment || '', p.sub_reason || '',
      p.country || '', p.region || '', p.city || '',
      p.device_type || '', p.language || '', p.timezone || '',
      p.ip_address || '', p.referrer || '',
      p.utm_source || '', p.utm_medium || '', p.utm_campaign || '',
      p.source || '', p.signed_up_at || '',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `piilk-participants-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Helpers
  const segColor = (s?: string) => {
    switch (s) {
      case 'A': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'B': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'C': return 'bg-sky-500/20 text-sky-400 border-sky-500/30';
      default: return 'bg-zinc-700/30 text-zinc-400 border-zinc-600/30';
    }
  };

  const segLabel = (s?: string) => {
    switch (s) { case 'A': return 'Switcher'; case 'B': return 'Skeptic'; case 'C': return 'Newbie'; default: return s || '—'; }
  };

  const fmtDate = (d?: string) => {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      return dt.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
        ' ' + dt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
  };

  const fmtShortDate = (d: string) => {
    const parts = d.split('-');
    return `${parts[1]}/${parts[2]}`;
  };

  const deviceIcon = (d?: string) => {
    switch (d) {
      case 'mobile': return '\u{1F4F1}';
      case 'desktop': return '\u{1F4BB}';
      case 'tablet': return '\u{1F4DF}';
      default: return '—';
    }
  };

  /* ─── Bar chart ─── */
  const BarChart = ({ data, color, total }: { data: [string, number][]; color: string; total: number }) => (
    <div className="space-y-1.5">
      {data.map(([label, count]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-[10px] sm:text-xs text-zinc-400 w-20 sm:w-24 truncate text-right shrink-0">{label}</span>
          <div className="flex-1 h-5 sm:h-6 bg-zinc-800/50 rounded-md overflow-hidden relative">
            <div className={`h-full rounded-md ${color} transition-all duration-700`}
              style={{ width: `${total > 0 ? Math.max((count / total) * 100, 2) : 0}%` }} />
            <span className="absolute inset-0 flex items-center px-2 text-[10px] sm:text-xs text-white font-medium">
              {count} <span className="text-zinc-500 ml-1">({total > 0 ? ((count / total) * 100).toFixed(0) : 0}%)</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );

  /* ─── ✅ Daily signup chart component ─── */
  const SignupChart = ({ daily, cumulative }: { daily: [string, number][]; cumulative: [string, number][] }) => {
    const [chartMode, setChartMode] = useState<'daily' | 'cumulative'>('daily');
    const chartData = chartMode === 'daily' ? daily : cumulative;

    if (chartData.length === 0) return null;

    const maxVal = Math.max(...chartData.map(d => d[1]), 1);

    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-base">{'\u{1F4C8}'}</span>
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Signup Trend</h3>
          </div>
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
            <button onClick={() => setChartMode('daily')}
              className={`px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-all ${chartMode === 'daily' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>
              Daily
            </button>
            <button onClick={() => setChartMode('cumulative')}
              className={`px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-all ${chartMode === 'cumulative' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>
              Cumulative
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="relative h-40 sm:h-52">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-5 w-8 flex flex-col justify-between text-[9px] text-zinc-600 font-mono">
            <span>{maxVal}</span>
            <span>{Math.round(maxVal / 2)}</span>
            <span>0</span>
          </div>

          {/* Grid lines */}
          <div className="absolute left-9 right-0 top-0 bottom-5">
            <div className="absolute top-0 left-0 right-0 border-t border-zinc-800/50" />
            <div className="absolute top-1/2 left-0 right-0 border-t border-zinc-800/30 border-dashed" />
            <div className="absolute bottom-0 left-0 right-0 border-t border-zinc-800/50" />
          </div>

          {/* Bars / Line */}
          <div className="absolute left-9 right-0 top-0 bottom-5 flex items-end gap-[1px]">
            {chartData.map(([day, count], i) => {
              const height = maxVal > 0 ? (count / maxVal) * 100 : 0;
              const isToday = day === new Date().toISOString().slice(0, 10);

              return (
                <div key={day} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  {/* Tooltip */}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[9px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                    {fmtShortDate(day)}: <span className="font-bold">{count}</span>
                  </div>

                  {/* Bar */}
                  <div
                    className={`w-full rounded-t-sm transition-all duration-500 ${
                      isToday
                        ? 'bg-emerald-400'
                        : chartMode === 'cumulative'
                          ? 'bg-purple-500/80 group-hover:bg-purple-400'
                          : 'bg-emerald-500/60 group-hover:bg-emerald-400'
                    }`}
                    style={{ height: `${Math.max(height, count > 0 ? 2 : 0)}%` }}
                  />

                  {/* X-axis label (show every few) */}
                  {(chartData.length <= 14 || i % Math.ceil(chartData.length / 10) === 0 || i === chartData.length - 1) && (
                    <span className={`text-[7px] sm:text-[8px] mt-1 font-mono ${isToday ? 'text-emerald-400 font-bold' : 'text-zinc-600'}`}>
                      {fmtShortDate(day)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-800/50">
          <div className="text-[10px] sm:text-xs text-zinc-500">
            Period: <span className="text-zinc-300 font-medium">{chartData.length} days</span>
          </div>
          {chartMode === 'daily' && (
            <div className="text-[10px] sm:text-xs text-zinc-500">
              Avg: <span className="text-zinc-300 font-medium">
                {(daily.reduce((s, d) => s + d[1], 0) / Math.max(daily.length, 1)).toFixed(1)}
              </span>/day
            </div>
          )}
          <div className="text-[10px] sm:text-xs text-zinc-500">
            Peak: <span className="text-emerald-400 font-medium">
              {Math.max(...daily.map(d => d[1]))}
            </span>
          </div>
        </div>
      </div>
    );
  };

  /* ─── LOGIN ─── */
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <form onSubmit={handleAuth} className="text-center max-w-sm w-full">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">PIILK</h1>
          <p className="text-zinc-600 text-sm mb-6 sm:mb-8">Internal Dashboard</p>
          <div className="space-y-3">
            <div className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-800 text-zinc-400 rounded-lg text-base text-left">armoredfresh</div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 text-white rounded-lg focus:outline-none focus:border-zinc-600 text-base" autoFocus autoComplete="current-password" />
            <label className="flex items-center gap-2 text-zinc-400 text-sm cursor-pointer justify-start px-1">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer" />
              <span>Remember Password</span>
            </label>
            <button type="submit" className="w-full px-6 py-3 bg-white text-black rounded-lg font-semibold hover:bg-zinc-200 active:scale-[0.98] transition-all">Login</button>
          </div>
        </form>
      </div>
    );
  }

  /* ─── LOADING ─── */
  if (loading) {
    return (<div className="min-h-screen bg-black flex items-center justify-center"><div className="w-10 h-10 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin" /></div>);
  }

  const data = activeSource === 'klaviyo' ? klaviyoData : supabaseData;
  const goal = 15000;
  const progress = data ? Math.min((data.total / goal) * 100, 100) : 0;

  /* ─── MAIN ─── */
  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-black to-zinc-900 text-white">
      {/* ✅ Header with Back button */}
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-xl border-b border-zinc-900">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* ✅ Back button */}
            <button onClick={() => window.open('https://teaser.piilk.com', '_blank')}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 active:scale-95 transition-all"
              title="Go to teaser site">
              <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h1 className="text-lg sm:text-xl font-black">PIILK</h1>
            <span className="text-[10px] sm:text-xs text-zinc-600 uppercase tracking-wider hidden sm:inline">Dashboard</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-zinc-500 text-[10px] sm:text-xs font-mono">{lastUpdated}</span>
            <button onClick={() => { fetchData(); fetchParticipants(); }}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 active:scale-95">
              <svg className="w-3 h-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <button onClick={() => { localStorage.removeItem('piilk_dash'); localStorage.removeItem('piilk_saved_pw'); setAuthenticated(false); setPassword(''); setRememberMe(false); }}
              className="text-[10px] sm:text-xs text-zinc-500 hover:text-white transition-colors">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* View Mode Tabs */}
        <div className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-800 rounded-xl p-1">
          <button onClick={() => setViewMode('overview')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${viewMode === 'overview' ? 'bg-white text-black shadow-lg shadow-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}>
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Overview
          </button>
          <button onClick={() => setViewMode('participants')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${viewMode === 'participants' ? 'bg-white text-black shadow-lg shadow-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}>
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            Participants
          </button>
        </div>

        {/* Data Source Tabs */}
        <div className="flex gap-2">
          <button onClick={() => setActiveSource('klaviyo')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${activeSource === 'klaviyo' ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
            {'\u{1F4E7}'} Klaviyo{klaviyoData && <span className="ml-2 text-xs opacity-70">({klaviyoData.total})</span>}
          </button>
          <button onClick={() => setActiveSource('supabase')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${activeSource === 'supabase' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
            {'\u{1F5C4}\uFE0F'} Supabase{supabaseData && <span className="ml-2 text-xs opacity-70">({supabaseData.total})</span>}
          </button>
        </div>

        {/* ══════ OVERVIEW ══════ */}
        {viewMode === 'overview' && data ? (
          <>
            {/* Total Signups + ✅ Today */}
            <section className="relative overflow-hidden bg-gradient-to-br from-zinc-900/80 to-zinc-950 border border-zinc-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8">
              <div className={`absolute inset-0 bg-gradient-to-r ${activeSource === 'klaviyo' ? 'from-purple-500/5' : 'from-emerald-500/5'} to-transparent`} />
              <div className="relative">
                <div className="flex items-end justify-between gap-4 mb-4 sm:mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${activeSource === 'klaviyo' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {activeSource === 'klaviyo' ? 'Klaviyo' : 'Supabase'}
                      </span>
                      {/* ✅ Today badge */}
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        TODAY +{todaySignups}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest mb-1 sm:mb-2">Total Signups</p>
                    <p className="text-5xl sm:text-6xl lg:text-8xl font-black leading-none tracking-tighter bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">{data.total.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-zinc-500 text-xs sm:text-sm">Goal: {goal.toLocaleString()}</p>
                    <p className={`text-xl sm:text-2xl font-bold ${activeSource === 'klaviyo' ? 'text-purple-500' : 'text-emerald-500'}`}>{progress.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="h-1.5 sm:h-2 bg-zinc-800/50 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${activeSource === 'klaviyo' ? 'bg-gradient-to-r from-purple-600 to-purple-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`} style={{ width: `${progress}%` }} />
                </div>
                <div className="flex justify-between mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-zinc-700 font-mono"><span>0</span><span>5K</span><span>10K</span><span>15K</span></div>
              </div>
            </section>

            {/* ✅ Daily Signup Chart */}
            {dailySignups.length > 0 && (
              <SignupChart daily={dailySignups} cumulative={cumulativeSignups} />
            )}

            {/* Segments Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className="lg:col-span-2 bg-gradient-to-br from-emerald-950/40 to-zinc-900/60 border border-emerald-900/40 rounded-xl sm:rounded-2xl p-4 sm:p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 sm:w-48 h-32 sm:h-48 bg-emerald-500/10 rounded-full blur-3xl" />
                <div className="relative">
                  <div className="flex items-start justify-between mb-4 sm:mb-6">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                        <p className="text-[10px] sm:text-xs text-emerald-400 uppercase tracking-widest font-bold">Segment A</p>
                      </div>
                      <h2 className="text-lg sm:text-xl font-bold text-white">Switchers</h2>
                      <p className="text-zinc-500 text-[10px] sm:text-xs">Yes - Core Target</p>
                    </div>
                    <div className="text-right">
                      <p className="text-4xl sm:text-5xl lg:text-6xl font-black text-emerald-400">{data.segments.A.total}</p>
                      <p className="text-emerald-600 text-base sm:text-lg font-bold">{data.segments.A.percentage}%</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                    {data.segments.A.breakdown && [
                      { label: 'Residue', value: data.segments.A.breakdown.residue },
                      { label: 'Aftertaste', value: data.segments.A.breakdown.aftertaste },
                      { label: 'Heaviness', value: data.segments.A.breakdown.heaviness },
                      { label: 'Habit', value: data.segments.A.breakdown.habit },
                      { label: 'Lapsed', value: data.segments.A.breakdown.lapsed },
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
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-amber-500 rounded-full" />
                    <p className="text-[9px] sm:text-xs text-amber-500 uppercase tracking-widest font-bold">Segment B</p>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white">Skeptics</h3>
                  <p className="text-zinc-500 text-[10px] sm:text-xs mb-2 sm:mb-3">No - Unaware</p>
                  <div className="flex items-end justify-between">
                    <p className="text-3xl sm:text-4xl font-black text-amber-400">{data.segments.B.total}</p>
                    <p className="text-amber-600 text-sm sm:text-base font-bold">{data.segments.B.percentage}%</p>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-sky-950/30 to-zinc-900/50 border border-sky-900/30 rounded-xl sm:rounded-2xl p-3 sm:p-5">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-sky-500 rounded-full" />
                    <p className="text-[9px] sm:text-xs text-sky-500 uppercase tracking-widest font-bold">Segment C</p>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white">Newbies</h3>
                  <p className="text-zinc-500 text-[10px] sm:text-xs mb-2 sm:mb-3">New to Protein</p>
                  <div className="flex items-end justify-between">
                    <p className="text-3xl sm:text-4xl font-black text-sky-400">{data.segments.C.total}</p>
                    <p className="text-sky-600 text-sm sm:text-base font-bold">{data.segments.C.percentage}%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tracking Analytics */}
            {trackingAnalytics && trackingAnalytics.hasTrackingData && (
              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-sm sm:text-base font-bold text-zinc-400 uppercase tracking-widest">Audience Insights</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <span className="text-base">{'\u{1F30D}'}</span>
                      <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Country</h3>
                    </div>
                    <BarChart data={trackingAnalytics.countries} color="bg-emerald-500" total={currentParticipants.length} />
                  </div>
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <span className="text-base">{'\u{1F3D9}\uFE0F'}</span>
                      <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Top Cities</h3>
                    </div>
                    <BarChart data={trackingAnalytics.cities} color="bg-purple-500" total={currentParticipants.length} />
                  </div>
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <span className="text-base">{'\u{1F4F1}'}</span>
                      <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Device</h3>
                    </div>
                    <BarChart data={trackingAnalytics.devices} color="bg-amber-500" total={currentParticipants.length} />
                  </div>
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <span className="text-base">{'\u{1F517}'}</span>
                      <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Traffic Source</h3>
                    </div>
                    <BarChart data={trackingAnalytics.utmSources} color="bg-sky-500" total={currentParticipants.length} />
                  </div>
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
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest mb-1">Total</p>
                <p className="text-xl sm:text-2xl font-black text-white">{currentParticipants.length}</p>
              </div>
              <div className="bg-emerald-950/30 border border-emerald-900/30 rounded-xl p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-emerald-500 uppercase tracking-widest mb-1">Seg A</p>
                <p className="text-xl sm:text-2xl font-black text-emerald-400">{currentParticipants.filter(p => p.segment === 'A').length}</p>
              </div>
              <div className="bg-amber-950/30 border border-amber-900/30 rounded-xl p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-amber-500 uppercase tracking-widest mb-1">Seg B</p>
                <p className="text-xl sm:text-2xl font-black text-amber-400">{currentParticipants.filter(p => p.segment === 'B').length}</p>
              </div>
              <div className="bg-sky-950/30 border border-sky-900/30 rounded-xl p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-sky-500 uppercase tracking-widest mb-1">Seg C</p>
                <p className="text-xl sm:text-2xl font-black text-sky-400">{currentParticipants.filter(p => p.segment === 'C').length}</p>
              </div>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" placeholder="Search email, country, city, IP..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-zinc-600 placeholder-zinc-600" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
              <select value={segmentFilter} onChange={e => setSegmentFilter(e.target.value)}
                className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-zinc-600 cursor-pointer min-w-[140px]">
                <option value="all">All Segments</option>
                <option value="A">A - Switchers</option>
                <option value="B">B - Skeptics</option>
                <option value="C">C - Newbies</option>
              </select>
              <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`px-4 py-2.5 border rounded-xl text-sm flex items-center gap-2 justify-center transition-colors ${showAdvancedFilters || activeFilterCount > 0 ? 'bg-purple-600 border-purple-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                Filters
                {activeFilterCount > 0 && <span className="bg-white text-purple-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{activeFilterCount}</span>}
              </button>
              {/* ✅ Export button */}
              <button onClick={exportToCSV}
                className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 text-sm hover:bg-zinc-800 hover:text-white transition-colors flex items-center gap-2 justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export
              </button>
              <button onClick={fetchParticipants} disabled={participantsLoading}
                className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 text-sm hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-2 justify-center">
                <svg className={`w-4 h-4 ${participantsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>

            {/* Advanced Filters */}
            {showAdvancedFilters && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Advanced Filters</h3>
                  {activeFilterCount > 0 && (
                    <button onClick={clearAllFilters} className="text-xs text-purple-400 hover:text-purple-300">Clear all filters</button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Reason</label>
                    <select value={reasonFilter} onChange={e => setReasonFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-600 cursor-pointer">
                      <option value="all">All Reasons</option>
                      {uniqueReasons.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Country</label>
                    <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-600 cursor-pointer">
                      <option value="">All Countries</option>
                      {uniqueCountries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">City</label>
                    <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-600 cursor-pointer">
                      <option value="">All Cities</option>
                      {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Device</label>
                    <select value={deviceFilter} onChange={e => setDeviceFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-600 cursor-pointer">
                      <option value="">All Devices</option>
                      {uniqueDevices.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Email Domain</label>
                    <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-600 cursor-pointer">
                      <option value="">All Domains</option>
                      {uniqueDomains.map(d => <option key={d} value={d}>@{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Date From</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-600" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Date To</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-600" />
                  </div>
                </div>
              </div>
            )}

            {/* Results count */}
            <div className="flex items-center justify-between">
              <p className="text-zinc-500 text-xs sm:text-sm">
                {filteredParticipants.length === currentParticipants.length
                  ? `${currentParticipants.length} participants`
                  : `${filteredParticipants.length} of ${currentParticipants.length} participants`}
              </p>
              <p className={`text-xs px-2 py-0.5 rounded ${activeSource === 'klaviyo' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                {activeSource === 'klaviyo' ? 'Klaviyo' : 'Supabase'}
              </p>
            </div>

            {/* Table / Cards */}
            {participantsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : filteredParticipants.length === 0 ? (
              <div className="text-center py-16 text-zinc-600">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm">{searchQuery || activeFilterCount > 0 ? 'No matching participants found.' : 'No participants yet.'}</p>
                {activeFilterCount > 0 && <button onClick={clearAllFilters} className="mt-2 text-purple-400 hover:text-purple-300 text-sm">Clear all filters</button>}
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-zinc-800/80 bg-zinc-900/60">
                          <th className="px-3 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold w-10">#</th>
                          <th className="px-3 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold cursor-pointer hover:text-zinc-300 select-none" onClick={() => handleSort('email')}>
                            <span className="flex items-center gap-1">Email{sortField === 'email' && <span className="text-white">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}</span>
                          </th>
                          <th className="px-3 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold cursor-pointer hover:text-zinc-300 select-none" onClick={() => handleSort('segment')}>
                            <span className="flex items-center gap-1">Seg{sortField === 'segment' && <span className="text-white">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}</span>
                          </th>
                          <th className="px-3 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Reason</th>
                          <th className="px-3 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold cursor-pointer hover:text-zinc-300 select-none" onClick={() => handleSort('country')}>
                            <span className="flex items-center gap-1">Location{sortField === 'country' && <span className="text-white">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}</span>
                          </th>
                          <th className="px-3 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Device</th>
                          <th className="px-3 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold cursor-pointer hover:text-zinc-300 select-none" onClick={() => handleSort('signed_up_at')}>
                            <span className="flex items-center gap-1">Date{sortField === 'signed_up_at' && <span className="text-white">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}</span>
                          </th>
                          <th className="px-3 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredParticipants.map((p, i) => (
                          <tr key={p.id || i} className="border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors">
                            <td className="px-3 py-3 text-xs text-zinc-600 font-mono">{i + 1}</td>
                            <td className="px-3 py-3 text-sm text-white font-medium max-w-[180px] truncate">{p.email}</td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md border ${segColor(p.segment)}`}>{segLabel(p.segment)}</span>
                            </td>
                            <td className="px-3 py-3 text-xs text-zinc-400 max-w-[100px] truncate">{p.sub_reason || '—'}</td>
                            <td className="px-3 py-3 text-xs text-zinc-300 whitespace-nowrap">
                              {p.city && p.country ? `${p.city}, ${p.country}` : p.country || '—'}
                            </td>
                            <td className="px-3 py-3 text-sm whitespace-nowrap">{deviceIcon(p.device_type)}</td>
                            <td className="px-3 py-3 text-xs text-zinc-500 font-mono whitespace-nowrap">{fmtDate(p.signed_up_at)}</td>
                            <td className="px-3 py-3">
                              <button onClick={() => setSelectedParticipant(p)}
                                className="text-zinc-600 hover:text-white transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden space-y-2">
                  {filteredParticipants.map((p, i) => (
                    <div key={p.id || i} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-3 space-y-2"
                      onClick={() => setSelectedParticipant(p)}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{p.email}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {p.city && <span className="text-[10px] text-zinc-500">{p.city}, {p.country}</span>}
                            {p.device_type && <span className="text-xs">{deviceIcon(p.device_type)}</span>}
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md border shrink-0 ${segColor(p.segment)}`}>{segLabel(p.segment)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        {p.sub_reason && <span className="text-zinc-500 truncate mr-2">{p.sub_reason}</span>}
                        <span className="text-zinc-600 font-mono whitespace-nowrap ml-auto">{fmtDate(p.signed_up_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Detail Modal */}
        {selectedParticipant && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSelectedParticipant(null)}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-5 sm:p-6 space-y-4"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-bold text-white">{selectedParticipant.email}</p>
                  {selectedParticipant.name && <p className="text-sm text-zinc-400">{selectedParticipant.name}</p>}
                </div>
                <button onClick={() => setSelectedParticipant(null)} className="text-zinc-500 hover:text-white p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-lg border ${segColor(selectedParticipant.segment)}`}>
                  {segLabel(selectedParticipant.segment)}
                </span>
                {selectedParticipant.sub_reason && (
                  <span className="text-sm text-zinc-400">{selectedParticipant.sub_reason}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Country', value: selectedParticipant.country },
                  { label: 'Region', value: selectedParticipant.region },
                  { label: 'City', value: selectedParticipant.city },
                  { label: 'Device', value: selectedParticipant.device_type },
                  { label: 'Language', value: selectedParticipant.language },
                  { label: 'Timezone', value: selectedParticipant.timezone },
                  { label: 'IP Address', value: selectedParticipant.ip_address },
                  { label: 'Referrer', value: selectedParticipant.referrer },
                  { label: 'UTM Source', value: selectedParticipant.utm_source },
                  { label: 'UTM Medium', value: selectedParticipant.utm_medium },
                  { label: 'UTM Campaign', value: selectedParticipant.utm_campaign },
                  { label: 'Source', value: selectedParticipant.source },
                  { label: 'Signed Up', value: fmtDate(selectedParticipant.signed_up_at) },
                ].map((item) => (
                  <div key={item.label} className="bg-zinc-800/50 rounded-lg p-2.5">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">{item.label}</p>
                    <p className="text-xs text-white font-medium truncate">{item.value || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
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

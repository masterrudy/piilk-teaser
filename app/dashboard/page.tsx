'use client';

import { useState, useEffect, useMemo } from 'react';

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
}

interface ParticipantsResponse {
  success: boolean;
  data: Participant[];
  total: number;
}

/* ─────────────────────────── Component ─────────────────────── */

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

  // View mode: overview vs participants
  const [viewMode, setViewMode] = useState<'overview' | 'participants'>('overview');

  // Participant list
  const [participants, setParticipants] = useState<{ klaviyo: Participant[]; supabase: Participant[] }>({ klaviyo: [], supabase: [] });
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'signed_up_at' | 'name' | 'email' | 'segment'>('signed_up_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Saved auth
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (localStorage.getItem('piilk_dash') === 'true') {
        setAuthenticated(true);
      }
      const savedPw = localStorage.getItem('piilk_saved_pw');
      if (savedPw) {
        setPassword(savedPw);
        setRememberMe(true);
      }
    }
  }, []);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'piilk$1b') {
      setAuthenticated(true);
      localStorage.setItem('piilk_dash', 'true');
      if (rememberMe) {
        localStorage.setItem('piilk_saved_pw', password);
      } else {
        localStorage.removeItem('piilk_saved_pw');
      }
    } else {
      alert('Wrong password');
    }
  };

  /* ── Fetch dashboard stats ── */
  const fetchData = async () => {
    try {
      const res = await fetch('/api/dashboard/stats');
      const result: ApiResponse = await res.json();
      if (result.success) {
        setSupabaseData(result.supabase);
        setKlaviyoData(result.klaviyo);
        setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /* ── Fetch participant lists ── */
  const fetchParticipants = async () => {
    setParticipantsLoading(true);
    try {
      const [klaviyoRes, supabaseRes] = await Promise.all([
        fetch('/api/dashboard/participants?source=klaviyo'),
        fetch('/api/dashboard/participants?source=supabase'),
      ]);
      const klaviyoResult: ParticipantsResponse = await klaviyoRes.json();
      const supabaseResult: ParticipantsResponse = await supabaseRes.json();
      setParticipants({
        klaviyo: klaviyoResult.success ? klaviyoResult.data : [],
        supabase: supabaseResult.success ? supabaseResult.data : [],
      });
    } catch (err) {
      console.error(err);
    } finally {
      setParticipantsLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) {
      fetchData();
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [authenticated]);

  // Load participants when tab is selected
  useEffect(() => {
    if (authenticated && viewMode === 'participants' && participants.klaviyo.length === 0 && participants.supabase.length === 0) {
      fetchParticipants();
    }
  }, [authenticated, viewMode]);

  /* ── Filtered / sorted participant list ── */
  const currentParticipants = activeSource === 'klaviyo' ? participants.klaviyo : participants.supabase;

  const filteredParticipants = useMemo(() => {
    let list = [...currentParticipants];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.email?.toLowerCase().includes(q) ||
          p.name?.toLowerCase().includes(q) ||
          p.segment?.toLowerCase().includes(q) ||
          p.sub_reason?.toLowerCase().includes(q)
      );
    }

    // Segment filter
    if (segmentFilter !== 'all') {
      list = list.filter((p) => p.segment === segmentFilter);
    }

    // Sort
    list.sort((a, b) => {
      const aVal = (a[sortField] || '').toLowerCase();
      const bVal = (b[sortField] || '').toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [currentParticipants, searchQuery, segmentFilter, sortField, sortDir]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const segmentColor = (seg?: string) => {
    switch (seg) {
      case 'A': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'B': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'C': return 'bg-sky-500/20 text-sky-400 border-sky-500/30';
      default: return 'bg-zinc-700/30 text-zinc-400 border-zinc-600/30';
    }
  };

  const segmentLabel = (seg?: string) => {
    switch (seg) {
      case 'A': return 'Switcher';
      case 'B': return 'Skeptic';
      case 'C': return 'Newbie';
      default: return seg || '—';
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
        ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  /* ─────────────── LOGIN SCREEN ─────────────── */
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <form onSubmit={handleAuth} className="text-center max-w-sm w-full">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">PIILK</h1>
          <p className="text-zinc-600 text-sm mb-6 sm:mb-8">Internal Dashboard</p>
          <div className="space-y-3">
            <div className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-800 text-zinc-400 rounded-lg text-base text-left">
              armoredfresh
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 text-white rounded-lg focus:outline-none focus:border-zinc-600 text-base"
              autoFocus
              autoComplete="current-password"
            />
            <label className="flex items-center gap-2 text-zinc-400 text-sm cursor-pointer justify-start px-1">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
              />
              <span>Remember Password</span>
            </label>
            <button type="submit" className="w-full px-6 py-3 bg-white text-black rounded-lg font-semibold hover:bg-zinc-200 active:scale-[0.98] transition-all">
              Login
            </button>
          </div>
        </form>
      </div>
    );
  }

  /* ─────────────── LOADING ─────────────── */
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const data = activeSource === 'klaviyo' ? klaviyoData : supabaseData;
  const goal = 15000;
  const progress = data ? Math.min((data.total / goal) * 100, 100) : 0;

  /* ─────────────── MAIN DASHBOARD ─────────────── */
  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-black to-zinc-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-xl border-b border-zinc-900">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <h1 className="text-lg sm:text-xl font-black">PIILK</h1>
            <span className="text-[10px] sm:text-xs text-zinc-600 uppercase tracking-wider hidden sm:inline">Dashboard</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-zinc-500 text-[10px] sm:text-xs font-mono">{lastUpdated}</span>
            <button
              onClick={() => { fetchData(); if (viewMode === 'participants') fetchParticipants(); }}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 active:scale-95"
            >
              <svg className="w-3 h-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('piilk_dash');
                localStorage.removeItem('piilk_saved_pw');
                setAuthenticated(false);
                setPassword('');
                setRememberMe(false);
              }}
              className="text-[10px] sm:text-xs text-zinc-500 hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* ═══════ View Mode Tabs (Overview / Participants) ═══════ */}
        <div className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-800 rounded-xl p-1">
          <button
            onClick={() => setViewMode('overview')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              viewMode === 'overview'
                ? 'bg-white text-black shadow-lg shadow-white/5'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Overview
          </button>
          <button
            onClick={() => setViewMode('participants')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              viewMode === 'participants'
                ? 'bg-white text-black shadow-lg shadow-white/5'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Participants
          </button>
        </div>

        {/* ═══════ Data Source Tabs (Klaviyo / Supabase) ═══════ */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSource('klaviyo')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeSource === 'klaviyo'
                ? 'bg-purple-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            📧 Klaviyo
            {klaviyoData && <span className="ml-2 text-xs opacity-70">({klaviyoData.total})</span>}
          </button>
          <button
            onClick={() => setActiveSource('supabase')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeSource === 'supabase'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            🗄️ Supabase
            {supabaseData && <span className="ml-2 text-xs opacity-70">({supabaseData.total})</span>}
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/*                   OVERVIEW VIEW                       */}
        {/* ═══════════════════════════════════════════════════════ */}
        {viewMode === 'overview' && data ? (
          <>
            {/* Total Section */}
            <section className="relative overflow-hidden bg-gradient-to-br from-zinc-900/80 to-zinc-950 border border-zinc-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8">
              <div className={`absolute inset-0 bg-gradient-to-r ${activeSource === 'klaviyo' ? 'from-purple-500/5' : 'from-emerald-500/5'} to-transparent`} />
              <div className="relative">
                <div className="flex items-end justify-between gap-4 mb-4 sm:mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${activeSource === 'klaviyo' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {activeSource === 'klaviyo' ? 'Klaviyo' : 'Supabase'}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest mb-1 sm:mb-2">Total Signups</p>
                    <p className="text-5xl sm:text-6xl lg:text-8xl font-black leading-none tracking-tighter bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                      {data.total.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-zinc-500 text-xs sm:text-sm">Goal: {goal.toLocaleString()}</p>
                    <p className={`text-xl sm:text-2xl font-bold ${activeSource === 'klaviyo' ? 'text-purple-500' : 'text-emerald-500'}`}>{progress.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="h-1.5 sm:h-2 bg-zinc-800/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${activeSource === 'klaviyo' ? 'bg-gradient-to-r from-purple-600 to-purple-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-zinc-700 font-mono">
                  <span>0</span><span>5K</span><span>10K</span><span>15K</span>
                </div>
              </div>
            </section>

            {/* Segments Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
              {/* Segment A */}
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

              {/* Segments B & C */}
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
          </>
        ) : viewMode === 'overview' ? (
          <div className="text-center text-zinc-500 py-12">
            데이터를 불러올 수 없습니다.
          </div>
        ) : null}

        {/* ═══════════════════════════════════════════════════════ */}
        {/*                PARTICIPANTS VIEW                      */}
        {/* ═══════════════════════════════════════════════════════ */}
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
                <p className="text-xl sm:text-2xl font-black text-emerald-400">{currentParticipants.filter((p) => p.segment === 'A').length}</p>
              </div>
              <div className="bg-amber-950/30 border border-amber-900/30 rounded-xl p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-amber-500 uppercase tracking-widest mb-1">Seg B</p>
                <p className="text-xl sm:text-2xl font-black text-amber-400">{currentParticipants.filter((p) => p.segment === 'B').length}</p>
              </div>
              <div className="bg-sky-950/30 border border-sky-900/30 rounded-xl p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-sky-500 uppercase tracking-widest mb-1">Seg C</p>
                <p className="text-xl sm:text-2xl font-black text-sky-400">{currentParticipants.filter((p) => p.segment === 'C').length}</p>
              </div>
            </div>

            {/* Search & Filter bar */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name, email, segment..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-zinc-600 placeholder-zinc-600"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <select
                value={segmentFilter}
                onChange={(e) => setSegmentFilter(e.target.value)}
                className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer min-w-[140px]"
              >
                <option value="all">All Segments</option>
                <option value="A">A - Switchers</option>
                <option value="B">B - Skeptics</option>
                <option value="C">C - Newbies</option>
              </select>
              <button
                onClick={fetchParticipants}
                disabled={participantsLoading}
                className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 text-sm hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-2 justify-center"
              >
                <svg className={`w-4 h-4 ${participantsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>

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

            {/* ── Participant Table (Desktop) ── */}
            {participantsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : filteredParticipants.length === 0 ? (
              <div className="text-center py-16 text-zinc-600">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm">
                  {searchQuery || segmentFilter !== 'all'
                    ? 'No matching participants found.'
                    : 'No participants yet.'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-zinc-800/80 bg-zinc-900/60">
                          <th className="px-4 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold w-12">#</th>
                          <th
                            className="px-4 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold cursor-pointer hover:text-zinc-300 select-none"
                            onClick={() => handleSort('email')}
                          >
                            <span className="flex items-center gap-1">
                              Email
                              {sortField === 'email' && <span className="text-white">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                            </span>
                          </th>
                          <th
                            className="px-4 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold cursor-pointer hover:text-zinc-300 select-none"
                            onClick={() => handleSort('name')}
                          >
                            <span className="flex items-center gap-1">
                              Name
                              {sortField === 'name' && <span className="text-white">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                            </span>
                          </th>
                          <th
                            className="px-4 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold cursor-pointer hover:text-zinc-300 select-none"
                            onClick={() => handleSort('segment')}
                          >
                            <span className="flex items-center gap-1">
                              Segment
                              {sortField === 'segment' && <span className="text-white">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                            </span>
                          </th>
                          <th className="px-4 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Reason</th>
                          <th
                            className="px-4 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold cursor-pointer hover:text-zinc-300 select-none"
                            onClick={() => handleSort('signed_up_at')}
                          >
                            <span className="flex items-center gap-1">
                              Signed Up
                              {sortField === 'signed_up_at' && <span className="text-white">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredParticipants.map((p, i) => (
                          <tr
                            key={p.id || i}
                            className="border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors"
                          >
                            <td className="px-4 py-3 text-xs text-zinc-600 font-mono">{i + 1}</td>
                            <td className="px-4 py-3 text-sm text-white font-medium max-w-[200px] truncate">{p.email}</td>
                            <td className="px-4 py-3 text-sm text-zinc-300">{p.name || '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md border ${segmentColor(p.segment)}`}>
                                {segmentLabel(p.segment)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-400 max-w-[160px] truncate">{p.sub_reason || '—'}</td>
                            <td className="px-4 py-3 text-xs text-zinc-500 font-mono whitespace-nowrap">{formatDate(p.signed_up_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden space-y-2">
                  {filteredParticipants.map((p, i) => (
                    <div key={p.id || i} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{p.email}</p>
                          {p.name && <p className="text-xs text-zinc-400">{p.name}</p>}
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md border shrink-0 ${segmentColor(p.segment)}`}>
                          {segmentLabel(p.segment)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        {p.sub_reason && <span className="text-zinc-500 truncate mr-2">{p.sub_reason}</span>}
                        <span className="text-zinc-600 font-mono whitespace-nowrap ml-auto">{formatDate(p.signed_up_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
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

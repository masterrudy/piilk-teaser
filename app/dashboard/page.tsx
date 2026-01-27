'use client';

import { useState, useEffect } from 'react';

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

export default function DashboardPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [supabaseData, setSupabaseData] = useState<DashboardData | null>(null);
  const [klaviyoData, setKlaviyoData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<'klaviyo' | 'supabase'>('klaviyo');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  // 저장된 로그인 정보 불러오기
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

  useEffect(() => {
    if (authenticated) {
      fetchData();
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [authenticated]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const data = activeTab === 'klaviyo' ? klaviyoData : supabaseData;
  const goal = 15000;
  const progress = data ? Math.min((data.total / goal) * 100, 100) : 0;

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
            <button onClick={fetchData} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 active:scale-95">
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
        
        {/* 데이터 소스 탭 */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('klaviyo')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'klaviyo'
                ? 'bg-purple-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            📧 Klaviyo
            {klaviyoData && <span className="ml-2 text-xs opacity-70">({klaviyoData.total})</span>}
          </button>
          <button
            onClick={() => setActiveTab('supabase')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'supabase'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            🗄️ Supabase
            {supabaseData && <span className="ml-2 text-xs opacity-70">({supabaseData.total})</span>}
          </button>
        </div>

        {data ? (
          <>
            {/* Total Section */}
            <section className="relative overflow-hidden bg-gradient-to-br from-zinc-900/80 to-zinc-950 border border-zinc-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8">
              <div className={`absolute inset-0 bg-gradient-to-r ${activeTab === 'klaviyo' ? 'from-purple-500/5' : 'from-emerald-500/5'} to-transparent`} />
              <div className="relative">
                <div className="flex items-end justify-between gap-4 mb-4 sm:mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${activeTab === 'klaviyo' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {activeTab === 'klaviyo' ? 'Klaviyo' : 'Supabase'}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest mb-1 sm:mb-2">Total Signups</p>
                    <p className="text-5xl sm:text-6xl lg:text-8xl font-black leading-none tracking-tighter bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                      {data.total.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-zinc-500 text-xs sm:text-sm">Goal: {goal.toLocaleString()}</p>
                    <p className={`text-xl sm:text-2xl font-bold ${activeTab === 'klaviyo' ? 'text-purple-500' : 'text-emerald-500'}`}>{progress.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="h-1.5 sm:h-2 bg-zinc-800/50 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${activeTab === 'klaviyo' ? 'bg-gradient-to-r from-purple-600 to-purple-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`} 
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
        ) : (
          <div className="text-center text-zinc-500 py-12">
            데이터를 불러올 수 없습니다.
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

// ═══════════════════════════════════════════════════════════
// 📁 page.tsx 수정 가이드
// 📌 아래 내용을 app/dashboard/page.tsx에 적용하세요
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────
// STEP 1: 타입 추가 (파일 상단 Types 영역에)
// ─────────────────────────────────────────

// 기존 ParticipantsResponse interface 아래에 추가:

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

// ─────────────────────────────────────────
// STEP 2: UTM 컬러맵 추가 (QUIZ_TYPE_LABELS 아래에)
// ─────────────────────────────────────────

const UTM_SOURCE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  meta: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-500' },
  tonic: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30', dot: 'bg-pink-500' },
  '10almonds': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  Direct: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/30', dot: 'bg-zinc-500' },
};

function getUtmColor(source: string) {
  return UTM_SOURCE_COLORS[source] || { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-500' };
}

// ─────────────────────────────────────────
// STEP 3: UtmSourceStatsSection 컴포넌트 추가
// SignupChart 컴포넌트 정의 바로 아래, LOGIN 섹션 바로 위에 추가
// ─────────────────────────────────────────

  const UtmSourceStatsSection = () => {
    const [utmView, setUtmView] = useState<'today' | 'total'>('today');
    const utmStats: UtmSourceStat[] | undefined = analyticsData?.utmSourceStats?.[utmView];
    const visitorStatsData: { total: VisitorStat; today: VisitorStat } | undefined = analyticsData?.visitorStats;

    if (!utmStats && !visitorStatsData) return null;

    const currentVS = visitorStatsData?.[utmView];
    const totalVisitorsSum = utmStats?.reduce((s, u) => s + u.visitors, 0) || 0;
    const totalSubmitsSum = utmStats?.reduce((s, u) => s + u.submits, 0) || 0;

    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-5">
          <div className="flex items-center gap-2">
            <span className="text-base">{'\u{1F4E1}'}</span>
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Traffic Source Breakdown</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded border ${variant === 'main' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-purple-500/10 text-purple-400 border-purple-500/30'}`}>
              {variant === 'main' ? 'Main Teaser' : 'Quiz Type'}
            </span>
          </div>
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
            <button onClick={() => setUtmView('today')} className={`px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all ${utmView === 'today' ? 'bg-emerald-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              Today
            </button>
            <button onClick={() => setUtmView('total')} className={`px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all ${utmView === 'total' ? 'bg-purple-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              Total
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {currentVS && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-5">
            <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3">
              <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">Visitors</p>
              <p className="text-xl sm:text-2xl font-black text-white">{currentVS.visitors.toLocaleString()}</p>
            </div>
            <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3">
              <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">Sessions</p>
              <p className="text-xl sm:text-2xl font-black text-white">{currentVS.sessions.toLocaleString()}</p>
            </div>
            <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg p-3">
              <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">Events</p>
              <p className="text-xl sm:text-2xl font-black text-zinc-300">{currentVS.events.toLocaleString()}</p>
            </div>
            <div className="bg-emerald-950/30 border border-emerald-900/30 rounded-lg p-3">
              <p className="text-[9px] text-emerald-500 uppercase tracking-widest font-semibold mb-0.5">Submits</p>
              <p className="text-xl sm:text-2xl font-black text-emerald-400">{totalSubmitsSum}</p>
            </div>
          </div>
        )}

        {/* Source Cards */}
        {utmStats && utmStats.length > 0 && (
          <div className="space-y-2.5">
            {utmStats.map((utm) => {
              const colors = getUtmColor(utm.source);
              const visitorPct = totalVisitorsSum > 0 ? ((utm.visitors / totalVisitorsSum) * 100) : 0;
              return (
                <div key={utm.source} className={`${colors.bg} border ${colors.border} rounded-xl p-3 sm:p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                      <span className={`text-sm sm:text-base font-bold ${colors.text}`}>{utm.source}</span>
                      <span className="text-[10px] text-zinc-500 font-medium">{visitorPct.toFixed(1)}% of traffic</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${Number(utm.cvr) > 3 ? 'bg-emerald-500/20 text-emerald-400' : Number(utm.cvr) > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700/30 text-zinc-500'}`}>
                      CVR {utm.cvr}%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 bg-zinc-800/80 rounded-full overflow-hidden mb-3">
                    <div className={`h-full rounded-full ${colors.dot} transition-all duration-700`} style={{ width: `${Math.max(visitorPct, utm.visitors > 0 ? 2 : 0)}%` }} />
                  </div>
                  {/* Stats row */}
                  <div className="grid grid-cols-5 gap-2">
                    <div className="text-center">
                      <p className="text-sm sm:text-lg font-black text-white">{utm.visitors.toLocaleString()}</p>
                      <p className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-widest">Visitors</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm sm:text-lg font-black text-zinc-300">{utm.sessions.toLocaleString()}</p>
                      <p className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-widest">Sessions</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm sm:text-lg font-black text-zinc-400">{utm.events.toLocaleString()}</p>
                      <p className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-widest">Events</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm sm:text-lg font-black text-zinc-400">{utm.page_views.toLocaleString()}</p>
                      <p className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-widest">Views</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm sm:text-lg font-black text-emerald-400">{utm.submits}</p>
                      <p className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-widest">Submits</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(!utmStats || utmStats.length === 0) && (
          <div className="text-center text-zinc-600 py-6 text-sm">No traffic data for this period.</div>
        )}
      </div>
    );
  };


import React, { useState, useMemo } from 'react';
import { StrategyStats, OVERHEAT_THRESHOLD } from '../types';

interface Props {
  strategies: StrategyStats[];
  pinnedIds: Set<string>;
  onSelectStrategy: (s: StrategyStats) => void;
  onTogglePin: (id: string) => void;
}

const StrategyDashboard: React.FC<Props> = ({ strategies, pinnedIds, onSelectStrategy, onTogglePin }) => {
  const [viewMode, setViewMode] = useState<'matrix' | 'table'>('matrix');
  const [sortField, setSortField] = useState<keyof StrategyStats>('totalProfit');
  const [sortAsc, setSortAsc] = useState(false);
  
  // Stats
  const totalStrategies = strategies.length;
  const profitableStrategies = strategies.filter(s => s.totalProfit > 0).length;
  const aggregateProfit = strategies.reduce((acc, curr) => acc + curr.totalProfit, 0);

  // Global Streak Distribution (Real-time count of strategies in streaks)
  const streakDistribution = useMemo(() => {
    const dist = {
        wins: {} as Record<number, number>,
        losses: {} as Record<number, number>
    };
    // Initialize buckets
    for(let i=1; i<=15; i++) {
        dist.wins[i] = 0;
        dist.losses[i] = 0;
    }

    strategies.forEach(s => {
        const val = s.currentStreak;
        if (val > 0) {
            const k = val > 15 ? 15 : val;
            dist.wins[k] = (dist.wins[k] || 0) + 1;
        } else if (val < 0) {
            const abs = Math.abs(val);
            const k = abs > 15 ? 15 : abs;
            dist.losses[k] = (dist.losses[k] || 0) + 1;
        }
    });
    return dist;
  }, [strategies]);

  // Global Historical Streak Counts
  const historicalStreakCounts = useMemo(() => {
    const counts = {
        wins: {} as Record<number, number>,
        losses: {} as Record<number, number>
    };

    strategies.forEach(s => {
        Object.entries(s.streakCounts.win).forEach(([lenStr, count]) => {
            const len = parseInt(lenStr);
            if (!isNaN(len)) {
                counts.wins[len] = (counts.wins[len] || 0) + (count as number);
            }
        });
        Object.entries(s.streakCounts.loss).forEach(([lenStr, count]) => {
            const len = parseInt(lenStr);
            if (!isNaN(len)) {
                counts.losses[len] = (counts.losses[len] || 0) + (count as number);
            }
        });
    });

    return counts;
  }, [strategies]);

  // Post-Streak Survival Stats
  const survivalData = useMemo(() => {
    let totalEvents = 0;
    let totalPeriods = 0;
    const periodDist: Record<string, number> = {
        '0-5': 0,
        '6-10': 0,
        '11-20': 0,
        '20+': 0
    };

    strategies.forEach(s => {
        totalEvents += s.survivalStats.count;
        s.survivalStats.periods.forEach(p => {
            totalPeriods += p;
            if (p <= 5) periodDist['0-5']++;
            else if (p <= 10) periodDist['6-10']++;
            else if (p <= 20) periodDist['11-20']++;
            else periodDist['20+']++;
        });
    });

    return {
        avg: totalEvents > 0 ? (totalPeriods / totalEvents).toFixed(1) : '0.0',
        totalEvents,
        dist: periodDist
    };
  }, [strategies]);

  // Sorting and Splitting Logic
  const { pinnedList, normalList } = useMemo(() => {
    const sorted = [...strategies].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    const pinned: StrategyStats[] = [];
    const normal: StrategyStats[] = [];

    sorted.forEach(s => {
        if (pinnedIds.has(s.config.id)) {
            pinned.push(s);
        } else {
            normal.push(s);
        }
    });

    return { pinnedList: pinned, normalList: normal };
  }, [strategies, sortField, sortAsc, pinnedIds]);

  const displayList = useMemo(() => {
      return [...pinnedList, ...normalList.slice(0, 500)];
  }, [pinnedList, normalList]);

  const getCellColor = (stat: StrategyStats) => {
    if (stat.currentStreak >= OVERHEAT_THRESHOLD) return 'bg-purple-600 animate-pulse border-purple-400 shadow-[0_0_15px_rgba(147,51,234,0.5)]';
    if (stat.currentStreak >= 4) return 'bg-emerald-600 border-emerald-500';
    if (stat.currentStreak <= -5) return 'bg-rose-900 border-rose-700';
    if (stat.totalProfit > 0) return 'bg-slate-700 border-slate-600 hover:bg-slate-600';
    return 'bg-slate-800 border-slate-700 opacity-60';
  };

  const PinIcon = ({ filled }: { filled: boolean }) => (
    <svg className={`w-3 h-3 ${filled ? 'text-yellow-400' : 'text-slate-500 hover:text-white'}`} fill={filled ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );

  return (
    <div className="space-y-6">
      {/* Aggregate Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg relative overflow-hidden">
           <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500 blur-[50px] opacity-20"></div>
           <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold">监控策略总数</p>
           <p className="text-3xl font-bold text-white mt-1">{totalStrategies.toLocaleString()}</p>
           <div className="mt-2 text-xs text-slate-500">
             <span className="text-emerald-400">{profitableStrategies.toLocaleString()}</span> 个盈利策略
           </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg relative overflow-hidden">
           <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500 blur-[50px] opacity-20"></div>
           <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold">组合总盈亏</p>
           <p className={`text-3xl font-bold mt-1 ${aggregateProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
             {aggregateProfit.toLocaleString()}
           </p>
           <div className="mt-2 text-xs text-slate-500">所有策略净值总和</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg flex flex-col justify-center">
           <div className="flex justify-between items-center mb-2">
             <label className="text-slate-400 text-xs uppercase font-semibold">排序依据</label>
             <div className="flex gap-1 bg-slate-950 p-1 rounded-lg">
                <button onClick={() => setViewMode('matrix')} className={`p-1.5 rounded ${viewMode === 'matrix' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 10h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 16h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4z"/></svg>
                </button>
                <button onClick={() => setViewMode('table')} className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
                </button>
             </div>
           </div>
           <select 
             className="bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 w-full outline-none focus:border-indigo-500"
             value={sortField}
             onChange={(e) => setSortField(e.target.value as keyof StrategyStats)}
           >
             <option value="totalProfit">按 累计盈亏</option>
             <option value="winRate">按 胜率</option>
             <option value="currentStreak">按 当前连红/连黑</option>
             <option value="maxWinStreak">按 历史最大连红</option>
             <option value="maxLoseStreak">按 历史最大连黑</option>
             <option value="maxDrawdown">按 最大回撤</option>
           </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Global Streak Stats Container */}
        <div className="space-y-6">
             {/* Current Status Distribution */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
                <h3 className="text-slate-400 text-xs font-bold mb-3 uppercase flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                    全策略 当前状态分布 (策略数)
                </h3>
                <div className="grid grid-cols-1 gap-4">
                    <div>
                        <div className="flex justify-between items-end mb-2 border-b border-slate-800 pb-1">
                            <span className="text-xs text-emerald-500 font-bold uppercase">当前连红</span>
                        </div>
                        <div className="grid grid-cols-8 gap-1">
                            {[3,4,5,6,7,8,9,10,11,12,13,14,15].map(n => (
                                <div key={n} className="bg-slate-950 border border-slate-800 rounded p-1 text-center">
                                    <div className="text-[9px] text-slate-500">{n}</div>
                                    <div className={`text-xs font-bold ${n >= 8 ? 'text-purple-400 animate-pulse' : 'text-emerald-400'}`}>
                                        {streakDistribution.wins[n] || 0}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between items-end mb-2 border-b border-slate-800 pb-1">
                            <span className="text-xs text-rose-500 font-bold uppercase">当前连黑</span>
                        </div>
                        <div className="grid grid-cols-8 gap-1">
                            {[5,6,7,8,9,10,11,12,13,14,15].map(n => (
                                <div key={n} className="bg-slate-950 border border-slate-800 rounded p-1 text-center">
                                    <div className="text-[9px] text-slate-500">{n}</div>
                                    <div className="text-xs font-bold text-rose-400">
                                        {streakDistribution.losses[n] || 0}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Post-Streak Survival Analysis (NEW) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
                 <h3 className="text-slate-400 text-xs font-bold mb-3 uppercase flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                    连红断裂后生存分析 (连红≥9后断)
                </h3>
                <div className="flex items-center justify-between bg-slate-950 p-3 rounded-lg mb-4">
                     <div>
                         <p className="text-xs text-slate-500 uppercase">历史发生总次数</p>
                         <p className="text-2xl font-bold text-white">{survivalData.totalEvents.toLocaleString()}</p>
                     </div>
                     <div className="text-right">
                         <p className="text-xs text-slate-500 uppercase">亏损至1000平均期数</p>
                         <p className="text-2xl font-bold text-blue-400">{survivalData.avg} <span className="text-xs text-slate-500">期</span></p>
                     </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    <div className="bg-slate-950 p-2 rounded border border-slate-800/50 text-center">
                        <div className="text-[10px] text-slate-500">0-5期</div>
                        <div className="font-bold text-slate-200">{survivalData.dist['0-5']}</div>
                    </div>
                    <div className="bg-slate-950 p-2 rounded border border-slate-800/50 text-center">
                        <div className="text-[10px] text-slate-500">6-10期</div>
                        <div className="font-bold text-slate-200">{survivalData.dist['6-10']}</div>
                    </div>
                    <div className="bg-slate-950 p-2 rounded border border-slate-800/50 text-center">
                        <div className="text-[10px] text-slate-500">11-20期</div>
                        <div className="font-bold text-slate-200">{survivalData.dist['11-20']}</div>
                    </div>
                    <div className="bg-slate-950 p-2 rounded border border-slate-800/50 text-center">
                        <div className="text-[10px] text-slate-500">20期以上</div>
                        <div className="font-bold text-slate-200">{survivalData.dist['20+']}</div>
                    </div>
                </div>
            </div>
        </div>

        {/* Global Historical Streak Frequency */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
            <h3 className="text-slate-400 text-xs font-bold mb-3 uppercase flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
                全策略 历史连红/连黑 总次数统计
            </h3>
            <div className="grid grid-cols-2 gap-4 h-[380px]">
                {/* Historical Win Frequency */}
                <div className="overflow-y-auto custom-scrollbar pr-1">
                    <div className="flex justify-between items-end mb-2 border-b border-slate-800 pb-1 sticky top-0 bg-slate-900 z-10">
                        <span className="text-xs text-emerald-500 font-bold uppercase">历史连红次数</span>
                    </div>
                    <div className="space-y-1">
                        {Object.entries(historicalStreakCounts.wins)
                            .sort((a,b) => Number(b[0]) - Number(a[0]))
                            .filter(([len]) => Number(len) >= 5) 
                            .map(([len, count]) => (
                            <div key={len} className="flex justify-between items-center text-xs px-2 py-1 bg-slate-950 rounded">
                                <span className="text-slate-400 font-mono">连红 {len}</span>
                                <span className="text-emerald-400 font-bold">{count.toLocaleString()} 次</span>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Historical Loss Frequency */}
                <div className="overflow-y-auto custom-scrollbar pr-1">
                    <div className="flex justify-between items-end mb-2 border-b border-slate-800 pb-1 sticky top-0 bg-slate-900 z-10">
                        <span className="text-xs text-rose-500 font-bold uppercase">历史连黑次数</span>
                    </div>
                    <div className="space-y-1">
                        {Object.entries(historicalStreakCounts.losses)
                            .sort((a,b) => Number(b[0]) - Number(a[0]))
                            .filter(([len]) => Number(len) >= 8) 
                            .map(([len, count]) => (
                            <div key={len} className="flex justify-between items-center text-xs px-2 py-1 bg-slate-950 rounded">
                                <span className="text-slate-400 font-mono">连黑 {len}</span>
                                <span className="text-rose-400 font-bold">{count.toLocaleString()} 次</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-between items-center px-2">
        <div className="flex gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div> <span>过热 (8连红+)</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-600"></div> <span>连红中</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-900"></div> <span>连黑中</span></div>
            {pinnedList.length > 0 && <div className="flex items-center gap-1 text-yellow-500 font-bold ml-2">★ 已收藏 {pinnedList.length} 个</div>}
        </div>
        <div className="text-xs text-slate-600 italic">
            仅显示前 500 个普通策略 (已收藏策略优先显示)
        </div>
      </div>

      {/* Matrix View */}
      {viewMode === 'matrix' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
            {displayList.map((stat) => {
              const isPinned = pinnedIds.has(stat.config.id);
              return (
                <div key={stat.config.id} className="relative group">
                    <button
                        onClick={(e) => { e.stopPropagation(); onTogglePin(stat.config.id); }}
                        className="absolute top-1 right-1 z-20 p-1 rounded-full bg-black/40 hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100 data-[pinned=true]:opacity-100"
                        data-pinned={isPinned}
                    >
                        <PinIcon filled={isPinned} />
                    </button>
                    <button
                        onClick={() => onSelectStrategy(stat)}
                        className={`w-full flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-200 hover:scale-105 hover:z-10 relative ${getCellColor(stat)} ${isPinned ? 'ring-2 ring-yellow-500/50 z-10' : ''}`}
                        title={stat.config.name}
                    >
                        <span className="text-[10px] font-mono text-slate-300 opacity-80 truncate w-full text-center group-hover:opacity-100">
                            {stat.config.name}
                        </span>
                        <span className="text-sm font-bold text-white my-0.5">
                        {stat.winRate.toFixed(0)}%
                        </span>
                        <span className={`text-[9px] px-1.5 rounded-full font-mono ${stat.currentStreak > 0 ? 'bg-black/30 text-emerald-300' : 'bg-black/30 text-rose-300'}`}>
                        {stat.currentStreak > 0 ? `红${stat.currentStreak}` : `黑${Math.abs(stat.currentStreak)}`}
                        </span>
                    </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-slate-300">
              <thead className="bg-slate-950">
                <tr>
                  <th className="px-6 py-3 w-10"></th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">策略名称</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">累计盈亏</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">胜率</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">当前状态</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">最大回撤</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {displayList.slice(0, 100).map((stat) => {
                   const isPinned = pinnedIds.has(stat.config.id);
                   return (
                    <tr key={stat.config.id} className={`hover:bg-slate-800 transition-colors ${isPinned ? 'bg-indigo-900/10' : ''}`}>
                        <td className="px-6 py-4">
                            <button onClick={() => onTogglePin(stat.config.id)}>
                                <PinIcon filled={isPinned} />
                            </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-white">{stat.config.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{stat.config.id}</div>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-bold ${stat.totalProfit > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stat.totalProfit.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        {stat.winRate.toFixed(2)}%
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                            stat.currentStreak > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                            {stat.currentStreak > 0 ? `红 ${stat.currentStreak}` : `黑 ${Math.abs(stat.currentStreak)}`}
                        </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-rose-400">
                        -{stat.maxDrawdown.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button 
                            onClick={() => onSelectStrategy(stat)}
                            className="text-indigo-400 hover:text-indigo-300 border border-indigo-900 bg-indigo-500/10 px-3 py-1 rounded transition-colors"
                        >
                            详情
                        </button>
                        </td>
                    </tr>
                   );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default StrategyDashboard;

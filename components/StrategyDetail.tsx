import React, { useState, useMemo, useEffect, useRef } from 'react';
import { StrategyStats, DrawData, PeriodStat, WIN_PROFIT, LOSE_COST } from '../types';
import { getReferenceBase, generateHistory } from '../services/strategyService';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Brush, Cell
} from 'recharts';

interface Props {
  strategy: StrategyStats;
  allDraws: DrawData[];
  isPinned?: boolean;
  onTogglePin?: () => void;
  onClose: () => void;
}

const POS_NAMES = ['万', '千', '百', '十', '个'];

// Helper for streak aggregation
interface StreakSegment {
    startIssue: string;
    endIssue: string;
    type: 'win' | 'loss';
    count: number;
    winVal: number; // Positive value for Win Bar
    loseVal: number; // Negative value for Lose Bar
}

const StrategyDetail: React.FC<Props> = ({ strategy, allDraws, isPinned, onTogglePin, onClose }) => {
  const [selectedYear, setSelectedYear] = useState<string>(strategy.annualStats[strategy.annualStats.length - 1]?.year || '');
  const [history, setHistory] = useState<PeriodStat[]>([]);
  const [pendingScrollIssue, setPendingScrollIssue] = useState<string | null>(null);

  // Range Analysis State
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeResult, setRangeResult] = useState<{profit: number, wins: number, losses: number, count: number} | null>(null);

  // Generate full history on mount
  useEffect(() => {
      setTimeout(() => {
          const h = generateHistory(strategy.config, allDraws);
          setHistory(h);
      }, 10);
  }, [strategy.config, allDraws]);

  // Optimized Streak Data: Aggregate into segments
  // Filter: Win >= 6, Loss >= 12
  const streakSegments = useMemo(() => {
      if (history.length === 0) return [];
      
      const segments: StreakSegment[] = [];
      let currentStart = history[0].issue;
      let currentType = history[0].isWin ? 'win' : 'loss';
      let currentCount = 1;

      for (let i = 1; i < history.length; i++) {
          const h = history[i];
          const type = h.isWin ? 'win' : 'loss';
          
          if (type === currentType) {
              currentCount++;
          } else {
              segments.push({
                  startIssue: currentStart,
                  endIssue: history[i-1].issue,
                  type: currentType as 'win'|'loss',
                  count: currentCount,
                  winVal: currentType === 'win' ? currentCount : 0,
                  loseVal: currentType === 'loss' ? -currentCount : 0
              });
              currentStart = h.issue;
              currentType = type;
              currentCount = 1;
          }
      }
      segments.push({
          startIssue: currentStart,
          endIssue: history[history.length-1].issue,
          type: currentType as 'win'|'loss',
          count: currentCount,
          winVal: currentType === 'win' ? currentCount : 0,
          loseVal: currentType === 'loss' ? -currentCount : 0
      });
      
      return segments.filter(s => (s.type === 'win' && s.count >= 6) || (s.type === 'loss' && s.count >= 12));
  }, [history]);

  // Calculate Next Period Reference
  const nextPrediction = useMemo(() => {
      if (allDraws.length === 0) return null;
      
      // Lookback Logic: To predict Issue N, we need Source Issue N - Lookback
      // Current Last Draw is index L-1 (Issue 2024100).
      // Next Issue is Issue 2024101 (Index L).
      // Source for Next Issue is Index L - Lookback.
      
      const nextIndex = allDraws.length;
      const lookback = strategy.config.lookback || 1;
      const sourceIndex = nextIndex - lookback;
      
      if (sourceIndex < 0 || sourceIndex >= allDraws.length) return null;

      const sourceDraw = allDraws[sourceIndex];
      const lastDraw = allDraws[allDraws.length - 1]; // Used for ID display only
      const nextIssue = isNaN(Number(lastDraw.issue)) ? "下一期" : String(Number(lastDraw.issue) + 1);
      
      const refA = getReferenceBase(sourceDraw.numbers, strategy.config);
      const refB = (refA + 5) % 10;
      
      return {
          sourceIssue: sourceDraw.issue,
          sourceNumbers: sourceDraw.numbers,
          targetIssue: nextIssue,
          refs: [refA, refB].sort((a, b) => a - b)
      };
  }, [allDraws, strategy.config]);

  // Calculate detailed row data for the selected year
  const yearlyDetails = useMemo(() => {
    if (!selectedYear) return [];
    
    const details = [];
    const targetIndices = strategy.config.targetIndices;
    const lookback = strategy.config.lookback || 1;
    
    // Iterate draws starting from lookback
    for (let i = lookback; i < allDraws.length; i++) {
        const draw = allDraws[i];
        const issueStr = draw.issue || '';
        
        if (issueStr.startsWith(selectedYear)) {
            const sourceDraw = allDraws[i - lookback];
            
            const refA = getReferenceBase(sourceDraw.numbers, strategy.config);
            const refB = (refA + 5) % 10;
            
            let matchCount = 0;
            const targetResults = targetIndices.map(idx => {
                const num = draw.numbers[idx];
                const isMatch = (num === refA || num === refB);
                if (isMatch) matchCount++;
                return { index: idx, num, isMatch };
            });

            const isWin = matchCount === 1;
            const profit = isWin ? WIN_PROFIT : LOSE_COST;

            details.push({
                issue: draw.issue,
                numbers: draw.numbers,
                sourceIssue: sourceDraw.issue,
                sourceNumbers: sourceDraw.numbers,
                refArray: [refA, refB].sort((a,b)=>a-b),
                targetResults,
                isWin,
                profit
            });
        }
    }
    return details.reverse();
  }, [selectedYear, allDraws, strategy]);

  // Range Analysis Calculation
  const handleRangeAnalyze = () => {
      if (!rangeStart || !rangeEnd || history.length === 0) return;
      
      // Filter inclusive
      const filtered = history.filter(h => h.issue >= rangeStart && h.issue <= rangeEnd);
      if (filtered.length === 0) {
          setRangeResult(null);
          return;
      }
      
      let profit = 0;
      let wins = 0;
      filtered.forEach(h => {
          profit += h.profit;
          if (h.isWin) wins++;
      });
      
      setRangeResult({
          profit,
          wins,
          losses: filtered.length - wins,
          count: filtered.length
      });
  };

  // Handle Chart Click: Set Year -> Wait Render -> Scroll
  const handleStreakChartClick = (data: any) => {
      if (data && data.activePayload && data.activePayload[0]) {
          const segment = data.activePayload[0].payload as StreakSegment;
          const issue = segment.startIssue;
          const year = issue.substring(0, 4);
          
          setPendingScrollIssue(issue);
          
          if (year !== selectedYear) {
              setSelectedYear(year);
          }
      }
  };

  // Effect to perform scroll after render/year change
  useEffect(() => {
      if (pendingScrollIssue) {
          const element = document.getElementById(`row-${pendingScrollIssue}`);
          if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              element.style.backgroundColor = 'rgba(99, 102, 241, 0.4)'; // Indigo highlight
              element.style.transition = 'background-color 0.5s';
              setTimeout(() => { element.style.backgroundColor = ''; }, 1500);
              setPendingScrollIssue(null);
          }
      }
  }, [pendingScrollIssue, yearlyDetails]);

  // Custom Tooltip for Streak Chart
  const StreakTooltip = ({ active, payload }: any) => {
      if (active && payload && payload.length) {
          const data = payload[0].payload as StreakSegment;
          const isWin = data.type === 'win';
          return (
              <div className="bg-slate-900 border border-slate-700 p-3 rounded shadow-xl text-xs z-50">
                  <p className={`font-bold text-base mb-1 ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isWin ? '连红' : '连黑'} {data.count} 期
                  </p>
                  <div className="space-y-1 text-slate-300">
                      <p>开始: <span className="font-mono text-white">{data.startIssue}</span></p>
                      <p>结束: <span className="font-mono text-white">{data.endIssue}</span></p>
                  </div>
                  <p className="text-indigo-400 mt-2 italic text-[10px]">点击跳转至详情 &rarr;</p>
              </div>
          );
      }
      return null;
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900 shrink-0">
          <div className="flex items-center gap-4">
             <div className={`w-3 h-10 rounded-full ${strategy.totalProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
             <div>
                <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-white tracking-tight">{strategy.config.name}</h2>
                    {onTogglePin && (
                        <button 
                            onClick={onTogglePin}
                            className={`p-1.5 rounded-lg border transition-colors ${isPinned 
                                ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' 
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                            title={isPinned ? "取消收藏" : "收藏策略"}
                        >
                            <svg className="w-5 h-5" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                        </button>
                    )}
                </div>
                <div className="flex gap-3 text-xs font-mono text-slate-400 mt-1">
                    <span className="bg-slate-800 px-2 py-0.5 rounded">ID: {strategy.config.id}</span>
                    <span className="bg-slate-800 px-2 py-0.5 rounded">判定位置: {strategy.config.targetIndices.map(i => POS_NAMES[i]).join('')}</span>
                </div>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-slate-800 p-2 rounded-full transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
            
            {/* Left Column: Stats & Charts */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 border-r border-slate-800">
                
                {/* Next Period Prediction Card */}
                {nextPrediction && (
                    <div className="bg-gradient-to-r from-indigo-900/40 to-slate-900 border border-indigo-500/30 p-5 rounded-xl shadow-lg relative overflow-hidden">
                        <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-500 blur-[60px] opacity-20"></div>
                        <h3 className="text-indigo-300 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                            下期策略参考 (实时计算)
                        </h3>
                        <div className="flex items-end justify-between">
                            <div>
                                <div className="text-sm text-slate-400 mb-1">
                                    基于 <span className="font-mono text-white">{nextPrediction.sourceIssue}</span> 期开奖 
                                    <span className="ml-2 font-mono text-slate-500 tracking-widest">{nextPrediction.sourceNumbers.join(' ')}</span>
                                </div>
                                <div className="text-2xl text-white font-bold">
                                    第 <span className="text-emerald-400 font-mono">{nextPrediction.targetIssue}</span> 期参考号:
                                </div>
                            </div>
                            <div className="flex gap-3">
                                {nextPrediction.refs.map((num, i) => (
                                    <div key={i} className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-indigo-500/40 border border-indigo-400/50">
                                        {num}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                        <p className="text-slate-500 text-xs uppercase">累计净盈亏</p>
                        <p className={`text-2xl font-bold ${strategy.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {strategy.totalProfit > 0 ? '+' : ''}{strategy.totalProfit.toLocaleString()}
                        </p>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                        <p className="text-slate-500 text-xs uppercase">当前连红/连黑</p>
                        <p className={`text-2xl font-bold ${strategy.currentStreak > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {strategy.currentStreak > 0 ? `连红 ${strategy.currentStreak}` : `连黑 ${Math.abs(strategy.currentStreak)}`}
                        </p>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                        <p className="text-slate-500 text-xs uppercase">历史最大连红</p>
                        <p className="text-2xl font-bold text-emerald-500">{strategy.maxWinStreak} 期</p>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                        <p className="text-slate-500 text-xs uppercase">历史最大连黑</p>
                        <p className="text-2xl font-bold text-rose-500">{strategy.maxLoseStreak} 期</p>
                    </div>
                </div>

                {/* Range Analysis Tool (NEW) */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                   <h3 className="text-slate-400 text-xs font-bold mb-3 uppercase">区间盈亏统计</h3>
                   <div className="flex gap-2 mb-3">
                       <input 
                         type="text" 
                         placeholder="开始期号 (如 2024001)" 
                         value={rangeStart} 
                         onChange={e => setRangeStart(e.target.value)}
                         className="bg-slate-950 border border-slate-700 text-white text-sm rounded px-3 py-2 w-full focus:border-indigo-500 outline-none"
                       />
                       <span className="text-slate-500 self-center">-</span>
                       <input 
                         type="text" 
                         placeholder="结束期号 (如 2024100)" 
                         value={rangeEnd} 
                         onChange={e => setRangeEnd(e.target.value)}
                         className="bg-slate-950 border border-slate-700 text-white text-sm rounded px-3 py-2 w-full focus:border-indigo-500 outline-none"
                       />
                       <button 
                         onClick={handleRangeAnalyze}
                         className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm font-bold whitespace-nowrap"
                       >
                         计算
                       </button>
                   </div>
                   {rangeResult && (
                       <div className="grid grid-cols-4 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800/50">
                           <div className="text-center">
                               <p className="text-xs text-slate-500">区间总期数</p>
                               <p className="text-white font-bold">{rangeResult.count}</p>
                           </div>
                           <div className="text-center">
                               <p className="text-xs text-slate-500">区间盈亏</p>
                               <p className={`font-bold ${rangeResult.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                   {rangeResult.profit > 0 ? '+' : ''}{rangeResult.profit}
                               </p>
                           </div>
                           <div className="text-center">
                               <p className="text-xs text-slate-500">中奖次数</p>
                               <p className="text-emerald-400 font-bold">{rangeResult.wins}</p>
                           </div>
                           <div className="text-center">
                               <p className="text-xs text-slate-500">未中次数</p>
                               <p className="text-rose-400 font-bold">{rangeResult.losses}</p>
                           </div>
                       </div>
                   )}
                </div>

                {/* Streak Distribution Statistics (NEW) */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <h3 className="text-slate-400 text-xs font-bold mb-3 uppercase">连红/连黑 次数统计</h3>
                    <div className="grid grid-cols-2 gap-6">
                        {/* Win Streaks */}
                        <div>
                            <div className="flex justify-between text-xs text-slate-500 mb-2 border-b border-slate-800 pb-1">
                                <span>连红长度</span>
                                <span>出现次数</span>
                            </div>
                            <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                                {Object.entries(strategy.streakCounts.win)
                                    .sort((a, b) => Number(b[0]) - Number(a[0])) // Sort desc by length
                                    .map(([len, count]) => (
                                        <div key={len} className="flex justify-between text-sm">
                                            <span className="text-emerald-400 font-mono">连红 {len} 期</span>
                                            <span className="text-white font-bold">{count} 次</span>
                                        </div>
                                    ))
                                }
                                {Object.keys(strategy.streakCounts.win).length === 0 && <p className="text-slate-600 text-xs text-center py-2">暂无数据</p>}
                            </div>
                        </div>
                        {/* Lose Streaks */}
                        <div>
                            <div className="flex justify-between text-xs text-slate-500 mb-2 border-b border-slate-800 pb-1">
                                <span>连黑长度</span>
                                <span>出现次数</span>
                            </div>
                            <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                                {Object.entries(strategy.streakCounts.loss)
                                    .sort((a, b) => Number(b[0]) - Number(a[0])) // Sort desc by length
                                    .map(([len, count]) => (
                                        <div key={len} className="flex justify-between text-sm">
                                            <span className="text-rose-400 font-mono">连黑 {len} 期</span>
                                            <span className="text-white font-bold">{count} 次</span>
                                        </div>
                                    ))
                                }
                                {Object.keys(strategy.streakCounts.loss).length === 0 && <p className="text-slate-600 text-xs text-center py-2">暂无数据</p>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Streak Chart */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 h-56">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-slate-400 text-xs font-bold uppercase">历史连红(≥6) / 连黑(≥12) 分布</h3>
                        <div className="flex gap-3 text-[10px] text-slate-500">
                             <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-sm"></span> 连红波段</span>
                             <span className="flex items-center gap-1"><span className="w-2 h-2 bg-rose-500 rounded-sm"></span> 连黑波段</span>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                         {streakSegments.length > 0 ? (
                            <BarChart 
                                data={streakSegments} 
                                onClick={handleStreakChartClick}
                                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                                barCategoryGap={1}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                                <ReferenceLine y={0} stroke="#475569" />
                                <Tooltip content={<StreakTooltip />} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                                <Bar dataKey="winVal" fill="#10b981" isAnimationActive={false} />
                                <Bar dataKey="loseVal" fill="#f43f5e" isAnimationActive={false} />
                                <Brush 
                                    dataKey="startIssue" 
                                    height={20} 
                                    stroke="#6366f1" 
                                    fill="#1e293b"
                                    tickFormatter={() => ''}
                                    startIndex={Math.max(0, streakSegments.length - 100)} 
                                />
                            </BarChart>
                         ) : (
                            <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                                暂无符合条件的长连红/连黑记录
                            </div>
                         )}
                    </ResponsiveContainer>
                </div>

                {/* Equity Curve */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 h-48">
                    <h3 className="text-slate-400 text-xs font-bold mb-2 uppercase">资金曲线 (累计盈亏)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        {history.length > 0 ? (
                            <LineChart data={history.filter((_, i) => i % Math.ceil(history.length / 200) === 0)}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                                <ReferenceLine y={0} stroke="#475569" />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                                    formatter={(value: number) => [value.toLocaleString(), '累计盈亏']}
                                    labelFormatter={() => ''}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="cumulativeProfit" 
                                    stroke="#6366f1" 
                                    strokeWidth={2} 
                                    dot={false} 
                                />
                            </LineChart>
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-500 text-xs">加载中...</div>
                        )}
                    </ResponsiveContainer>
                </div>

                {/* Annual Performance */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 h-48">
                    <h3 className="text-slate-400 text-xs font-bold mb-2 uppercase">年度盈亏 (点击柱状图查看详情)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={strategy.annualStats} onClick={(data) => {
                            if (data && data.activePayload && data.activePayload[0]) {
                                setSelectedYear(data.activePayload[0].payload.year);
                            }
                        }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                        <XAxis dataKey="year" stroke="#64748b" fontSize={10} />
                        <Tooltip 
                            cursor={{fill: 'rgba(255,255,255,0.05)'}}
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                            formatter={(value: number) => [value.toLocaleString(), '净盈亏']}
                        />
                        <ReferenceLine y={0} stroke="#475569" />
                        <Bar dataKey="profit" maxBarSize={40}>
                            {strategy.annualStats.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#10b981' : '#f43f5e'} cursor="pointer" />
                            ))}
                        </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Right Column: Detailed Table */}
            <div className="flex-1 flex flex-col h-full bg-slate-925">
                <div className="p-4 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
                    <h3 className="text-white font-bold">{selectedYear} 年每期详情</h3>
                    <select 
                        value={selectedYear} 
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-white text-sm rounded px-2 py-1"
                    >
                        {strategy.annualStats.map(s => (
                            <option key={s.year} value={s.year}>{s.year}年 ({s.profit > 0 ? '+' : ''}{s.profit})</option>
                        ))}
                    </select>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                    <table className="min-w-full divide-y divide-slate-800 text-sm">
                        <thead className="bg-slate-950 sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">期号</th>
                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">本期参考 (Ref)</th>
                                <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">开奖号码 (Open)</th>
                                <th className="px-3 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">盈亏结果</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 bg-slate-900">
                            {yearlyDetails.map((row) => (
                                <tr key={row.issue} id={`row-${row.issue}`} className="hover:bg-slate-800 transition-colors duration-200">
                                    <td className="px-3 py-3 text-slate-300 font-mono whitespace-nowrap">
                                        {row.issue}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                        <span className="text-indigo-300 font-bold font-mono tracking-widest bg-indigo-900/30 px-2 py-1 rounded">
                                            [{row.refArray.join(',')}]
                                        </span>
                                        <div className="text-[10px] text-slate-600 mt-1">
                                            源: {row.sourceIssue} ({row.sourceNumbers.join('')})
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                        <div className="flex justify-center gap-1">
                                            {row.numbers.map((n, idx) => {
                                                const target = row.targetResults.find(t => t.index === idx);
                                                if (target) {
                                                    return (
                                                        <span key={idx} className={`w-6 h-6 flex items-center justify-center rounded font-bold border ${
                                                            target.isMatch 
                                                                ? 'bg-emerald-600 border-emerald-500 text-white' // Hit
                                                                : 'bg-slate-800 border-slate-600 text-slate-400' // Target but Miss
                                                        }`} title={`判定位: ${POS_NAMES[idx]}`}>
                                                            {n}
                                                        </span>
                                                    );
                                                } else {
                                                    return <span key={idx} className="w-6 h-6 flex items-center justify-center text-slate-700">{n}</span>;
                                                }
                                            })}
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-right whitespace-nowrap">
                                        <div className={`font-bold ${row.isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {row.isWin ? '中奖' : '未中'}
                                        </div>
                                        <div className={`text-xs ${row.profit > 0 ? 'text-emerald-600' : 'text-rose-700'}`}>
                                            {row.profit > 0 ? '+' : ''}{row.profit}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {yearlyDetails.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                                        请选择年份查看详细数据
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default StrategyDetail;
import React, { useState, useEffect } from 'react';
import { DrawData, StrategyStats } from './types';
import { parseCSV, runAnalysisWorker } from './services/strategyService';
import FileUpload from './components/FileUpload';
import StrategyDashboard from './components/StrategyDashboard';
import StrategyDetail from './components/StrategyDetail';
import ManualInput from './components/ManualInput';

function App() {
  const [draws, setDraws] = useState<DrawData[]>([]);
  const [results, setResults] = useState<StrategyStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyStats | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  
  // Pinned Logic
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem('p5_pinned_strategies');
    if (saved) {
      try {
        setPinnedIds(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error("Failed to load pinned strategies");
      }
    }
  }, []);

  const togglePin = (id: string) => {
    const newSet = new Set(pinnedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setPinnedIds(newSet);
    localStorage.setItem('p5_pinned_strategies', JSON.stringify(Array.from(newSet)));
  };

  const runAnalysis = async (currentDraws: DrawData[]) => {
    setLoading(true);
    // Use the Web Worker implementation to avoid UI blocking
    try {
        const stats = await runAnalysisWorker(currentDraws);
        setResults(stats);
    } catch (e) {
        console.error("Worker Analysis Failed:", e);
        alert("策略分析计算失败，请检查数据格式。");
    } finally {
        setLoading(false);
    }
  };

  const handleDataLoaded = (csvContent: string) => {
    try {
        const parsedDraws = parseCSV(csvContent);
        if (parsedDraws.length === 0) {
          alert("未发现有效数据");
          return;
        }
        setDraws(parsedDraws);
        runAnalysis(parsedDraws);
    } catch (e) {
        console.error(e);
        alert("文件解析失败");
    }
  };

  const handleAddDraw = (issue: string, numbers: number[]) => {
      const newDraw: DrawData = {
          issue,
          date: new Date().getFullYear().toString(),
          numbers
      };
      
      const updatedDraws = [...draws, newDraw].sort((a, b) => a.issue.localeCompare(b.issue));
      setDraws(updatedDraws);
      setShowManualInput(false);
      
      runAnalysis(updatedDraws);
      
      if (selectedStrategy) {
          setSelectedStrategy(null); 
      }
  };

  return (
    <div className="min-h-screen font-sans text-slate-200 selection:bg-indigo-500 selection:text-white">
      
      {/* Top Bar */}
      <div className="bg-slate-950 border-b border-slate-900 py-3 px-6 flex justify-between items-center sticky top-0 z-40 backdrop-blur-md bg-opacity-80">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">P5</div>
            <h1 className="text-lg font-bold text-white tracking-tight">排列五策略回测系统 <span className="text-slate-500 font-normal text-xs ml-2">专业版</span></h1>
        </div>
        <div className="text-xs text-slate-500 hidden sm:block">
            历史统计分析工具 · 不作任何预测
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        
        {results.length === 0 ? (
          <div className="max-w-xl mx-auto mt-20">
            <FileUpload onDataLoaded={handleDataLoaded} isLoading={loading} />
            
            {loading && (
               <div className="mt-8 text-center space-y-3">
                 <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-indigo-500 border-t-transparent"></div>
                 <p className="text-slate-400 animate-pulse">正在后台加速计算 200,000+ 个策略模型...</p>
                 <p className="text-xs text-slate-600">采用 Web Worker 多线程技术，请稍候</p>
               </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Control Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
               <div className="flex items-center space-x-6 text-sm mb-4 sm:mb-0">
                 <div>
                   <span className="text-slate-500 block text-xs uppercase font-semibold">开始期号</span>
                   <span className="font-mono text-white">{draws[0]?.issue}</span>
                 </div>
                 <div>
                   <span className="text-slate-500 block text-xs uppercase font-semibold">最新期号</span>
                   <span className="font-mono text-white">{draws[draws.length - 1]?.issue}</span>
                 </div>
                 <div>
                   <span className="text-slate-500 block text-xs uppercase font-semibold">总期数</span>
                   <span className="font-mono text-indigo-400">{draws.length}</span>
                 </div>
               </div>
               
               <div className="flex gap-3">
                   <button 
                     onClick={() => setShowManualInput(true)}
                     className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                   >
                     <span>+</span> 手动录入开奖
                   </button>
                   <button 
                     onClick={() => { setResults([]); setDraws([]); }}
                     className="px-4 py-2 bg-slate-800 hover:bg-rose-900/30 hover:text-rose-400 text-slate-400 text-sm font-medium rounded-lg transition-colors border border-transparent hover:border-rose-900"
                   >
                     重置数据
                   </button>
               </div>
            </div>

            {loading ? (
                <div className="text-center py-20">
                    <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-indigo-500 border-t-transparent mb-4"></div>
                    <p className="text-slate-400">正在重新计算策略数据...</p>
                    <p className="text-xs text-slate-600 mt-2">后台线程运行中，界面保持响应</p>
                </div>
            ) : (
                <StrategyDashboard 
                  strategies={results} 
                  pinnedIds={pinnedIds}
                  onSelectStrategy={setSelectedStrategy} 
                  onTogglePin={togglePin}
                />
            )}
          </div>
        )}

        {selectedStrategy && (
          <StrategyDetail 
            strategy={selectedStrategy} 
            allDraws={draws}
            isPinned={pinnedIds.has(selectedStrategy.config.id)}
            onTogglePin={() => togglePin(selectedStrategy.config.id)}
            onClose={() => setSelectedStrategy(null)} 
          />
        )}

        {showManualInput && (
            <ManualInput 
                lastIssue={draws.length > 0 ? draws[draws.length - 1].issue : ''}
                onAdd={handleAddDraw}
                onCancel={() => setShowManualInput(false)}
            />
        )}
      </main>
    </div>
  );
}

export default App;
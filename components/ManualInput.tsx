import React, { useState } from 'react';

interface Props {
  lastIssue: string;
  onAdd: (issue: string, numbers: number[]) => void;
  onCancel: () => void;
}

const ManualInput: React.FC<Props> = ({ lastIssue, onAdd, onCancel }) => {
  // Try to auto-increment the issue number
  const nextIssue = isNaN(Number(lastIssue)) ? '' : String(Number(lastIssue) + 1);
  
  const [issue, setIssue] = useState(nextIssue);
  const [numStr, setNumStr] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue.trim()) {
        setError('请输入期号');
        return;
    }
    // Clean numbers
    const cleanNums = numStr.replace(/\D/g, '');
    if (cleanNums.length !== 5) {
        setError('请输入 5 位开奖号码');
        return;
    }
    const numbers = cleanNums.split('').map(Number);
    onAdd(issue, numbers);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
        <h2 className="text-xl font-bold text-white mb-4">手动添加最新开奖</h2>
        <div className="mb-4 text-xs text-slate-500">
            录入最新一期开奖号码后，系统将自动重新计算所有策略的盈亏指标。
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm text-slate-400 mb-1">期号 (Issue)</label>
                <input 
                    type="text" 
                    value={issue}
                    onChange={e => setIssue(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="例如 2026019"
                />
            </div>
            <div>
                <label className="block text-sm text-slate-400 mb-1">开奖号码 (5位)</label>
                <input 
                    type="text" 
                    value={numStr}
                    onChange={e => { setNumStr(e.target.value); setError(''); }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono text-lg tracking-widest outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="例如 12345"
                    maxLength={10}
                />
            </div>
            
            {error && <p className="text-rose-500 text-sm bg-rose-500/10 p-2 rounded">{error}</p>}

            <div className="flex gap-3 pt-2">
                <button 
                    type="button" 
                    onClick={onCancel}
                    className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                    取消
                </button>
                <button 
                    type="submit"
                    className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-emerald-900/20"
                >
                    确认添加
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default ManualInput;

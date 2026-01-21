import React, { useRef } from 'react';

interface Props {
  onDataLoaded: (content: string) => void;
  isLoading: boolean;
}

const FileUpload: React.FC<Props> = ({ onDataLoaded, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        onDataLoaded(event.target.result as string);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="bg-slate-900 p-10 rounded-2xl shadow-xl border border-slate-800 text-center">
      <div className="space-y-6">
        <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
        </div>
        <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">导入历史数据</h2>
            <p className="text-slate-400 text-sm mt-2">请上传 排列五(P5) 历史开奖数据的 CSV 文件。</p>
        </div>
        
        <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-500 font-mono text-left space-y-1">
            <p className="font-bold mb-1 text-slate-400">支持格式示例:</p>
            <p>2024001, 1 2 3 4 5</p>
            <p>2024001.0, 12345</p>
        </div>

        <div className="flex justify-center">
          <input
            type="file"
            accept=".csv,.txt"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            id="csv-upload"
            disabled={isLoading}
          />
          <label
            htmlFor="csv-upload"
            className={`px-8 py-3 rounded-xl font-bold text-white transition-all transform hover:scale-105 cursor-pointer shadow-lg shadow-indigo-500/20 ${
              isLoading 
                ? 'bg-slate-700 cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {isLoading ? '正在分析...' : '选择文件'}
          </label>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;

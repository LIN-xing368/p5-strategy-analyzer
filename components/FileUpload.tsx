import React, { useRef } from 'react';

interface Props {
  onDataLoaded: (content: string) => void;
  isLoading: boolean;
  customClass?: string;
}

const FileUpload: React.FC<Props> = ({ onDataLoaded, isLoading, customClass }) => {
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

  const defaultClass = "px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 text-sm font-medium rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-600";

  return (
    <>
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
        className={`${customClass || defaultClass} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isLoading ? '加载中...' : (customClass ? '导入 CSV 文件' : '导入CSV')}
      </label>
    </>
  );
};

export default FileUpload;
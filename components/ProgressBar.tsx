import React from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
  task: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ current, total, task }) => {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="max-w-3xl mx-auto my-8 p-4 bg-gray-800/50 border border-gray-700 rounded-lg shadow-lg fade-in">
      <div className="flex justify-between items-center mb-2">
        <p className="text-sm font-medium text-gray-200">{task}</p>
        <p className="text-sm font-semibold text-amber-300">{current} / {total}</p>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2.5 relative overflow-hidden">
        <div
          className="bg-gradient-to-r from-amber-500 to-orange-500 h-2.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        ></div>
         <div
            className="absolute top-0 left-0 h-full rounded-full w-full bg-gradient-to-r from-transparent via-amber-300/40 to-transparent animate-flow"
            style={{
                animation: 'flow 2.5s linear infinite',
                backgroundSize: '200% 100%'
            }}
        />
      </div>
      <style>{`
        @keyframes flow {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
};

export default ProgressBar;
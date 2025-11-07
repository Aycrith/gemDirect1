import React from 'react';
import { marked } from 'marked';

interface FeedbackCardProps {
  title: string;
  content: string | null;
  isLoading: boolean;
}

const SkeletonLoader: React.FC = () => (
    <div className="space-y-3 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-3/4"></div>
        <div className="h-4 bg-gray-700 rounded w-full"></div>
        <div className="h-4 bg-gray-700 rounded w-5/6"></div>
        <div className="h-4 bg-gray-700 rounded w-1/2"></div>
        <div className="h-4 bg-gray-700 rounded w-full mt-4"></div>
        <div className="h-4 bg-gray-700 rounded w-2/3"></div>
    </div>
);

const FeedbackCard: React.FC<FeedbackCardProps> = ({ title, content, isLoading }) => {
    
    const createMarkup = (markdown: string) => {
        const rawMarkup = marked(markdown);
        return { __html: rawMarkup };
    };
    
  return (
    <div className="bg-gray-900/40 backdrop-blur-sm ring-1 ring-gray-700/80 rounded-lg shadow-lg p-6 h-full">
      <h2 className="text-xl font-bold text-indigo-400 mb-4">{title}</h2>
      <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-gray-300 prose-p:text-gray-300 prose-ul:text-gray-300 prose-strong:text-white">
        {isLoading ? (
          <SkeletonLoader />
        ) : content ? (
            <div dangerouslySetInnerHTML={createMarkup(content)} />
        ) : (
          <p className="text-gray-500 italic">Click "Analyze Cinematic Action" to generate content.</p>
        )}
      </div>
    </div>
  );
};

export default React.memo(FeedbackCard);
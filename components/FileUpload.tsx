import React, { useState, useCallback } from 'react';
import UploadCloudIcon from './icons/UploadCloudIcon';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      if (file && file.type.startsWith('video/')) {
        onFileSelect(file);
      } else {
        alert('Please select a valid video file.');
      }
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFile(e.dataTransfer.files);
  }, [onFileSelect]);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files);
  };

  const openFileDialog = () => {
    document.getElementById('file-input')?.click();
  };

  const borderStyle = isDragging 
    ? 'border-amber-500 bg-gray-800/50 scale-105 shadow-2xl shadow-amber-500/30' 
    : 'border-gray-700 hover:border-gray-600 bg-gray-800/20';

  return (
    <div 
        className={`relative w-full mx-auto border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-300 ${borderStyle}`}
        style={{
            backgroundSize: isDragging ? '32px 32px' : '16px 16px',
            backgroundImage: isDragging 
                ? `linear-gradient(45deg, #283148 25%, transparent 25%), linear-gradient(-45deg, #283148 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #283148 75%), linear-gradient(-45deg, transparent 75%, #283148 75%)`
                : 'none',
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={openFileDialog}
        role="button"
        aria-label="Upload video file"
        tabIndex={0}
    >
      <input
        id="file-input"
        type="file"
        className="hidden"
        accept="video/mp4,video/webm,video/quicktime,video/mov"
        onChange={handleFileChange}
      />
      <div className="flex flex-col items-center justify-center space-y-4">
        <UploadCloudIcon className={`w-12 h-12 transition-colors duration-300 ${isDragging ? 'text-amber-400' : 'text-gray-500'}`} />
        <p className="text-lg font-semibold text-gray-200">Drag & drop your video here</p>
        <p className="text-gray-400">or click to browse files</p>
        <p className="text-xs text-gray-500 mt-2">MP4, WebM, MOV</p>
      </div>
    </div>
  );
};

export default React.memo(FileUpload);
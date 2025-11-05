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
      if (file.type.startsWith('video/')) {
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

  return (
    <div 
        className={`w-full mx-auto border-2 border-dashed rounded-lg p-8 sm:p-12 text-center cursor-pointer transition-all duration-300 ${isDragging ? 'border-indigo-400 bg-gray-800' : 'border-gray-700 hover:border-gray-600'}`}
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
        <UploadCloudIcon className="w-12 h-12 text-gray-500" />
        <p className="text-lg font-semibold text-gray-300">Drag & drop your video here</p>
        <p className="text-gray-500">or click to browse files</p>
        <p className="text-xs text-gray-600 mt-2">MP4, WebM, MOV</p>
      </div>
    </div>
  );
};

export default React.memo(FileUpload);

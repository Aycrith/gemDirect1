import React from 'react';

interface VideoPlayerProps {
  src: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src }) => {
  return (
    <div className="w-full max-w-4xl mx-auto bg-black rounded-lg overflow-hidden shadow-2xl shadow-indigo-500/20 border border-gray-700">
      <video className="w-full aspect-video" controls autoPlay loop muted>
        <source src={src} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default React.memo(VideoPlayer);

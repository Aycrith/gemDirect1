import React from 'react';

interface ThematicLoaderProps {
  text: string;
}

const ThematicLoader: React.FC<ThematicLoaderProps> = ({ text }) => {
  return (
    <div className="flex items-center justify-center gap-3 text-white font-semibold">
        <div className="w-8 h-8">
            <svg viewBox="0 0 100 100" className="w-full h-full">
                {/* Clapperboard bottom part */}
                <g style={{ transformOrigin: '20px 85px', animation: 'clap-bottom 1.2s ease-in-out infinite' }}>
                    <path d="M10 40 L10 90 L90 90 L90 40 Z" fill="#2d3748" />
                    <rect x="15" y="45" width="70" height="40" fill="#1a202c" />
                    <text x="50" y="65" textAnchor="middle" fill="#e2e8f0" fontSize="14" fontWeight="bold">PROD</text>
                    <text x="50" y="80" textAnchor="middle" fill="#e2e8f0" fontSize="14" fontWeight="bold">GEMINI</text>
                </g>
                {/* Clapperboard top part */}
                <g style={{ transformOrigin: '17px 35px', animation: 'clap-top 1.2s ease-in-out infinite' }}>
                    <path d="M10 10 L15 35 L90 25 L85 10 Z" fill="#cbd5e0"/>
                    <path d="M17 12 L22 33 L32 31 L27 12 Z" fill="#1a202c"/>
                    <path d="M34 12 L39 31 L49 29 L44 12 Z" fill="#1a202c"/>
                    <path d="M51 12 L56 29 L66 27 L61 12 Z" fill="#1a202c"/>
                    <path d="M68 12 L73 27 L83 25 L78 12 Z" fill="#1a202c"/>
                </g>
            </svg>
        </div>
        <span>{text}</span>
    </div>
  );
};

export default ThematicLoader;
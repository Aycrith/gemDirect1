import React from 'react';

interface ArrowUpIconProps {
    className?: string;
}

const ArrowUpIcon: React.FC<ArrowUpIconProps> = ({ className = 'w-6 h-6' }) => (
    <svg
        className={className}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 10l7-7m0 0l7 7m-7-7v18"
        />
    </svg>
);

export default ArrowUpIcon;

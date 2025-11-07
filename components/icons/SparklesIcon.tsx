
import React from 'react';

const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M12 3L14.34 8.66L20 11L14.34 13.34L12 19L9.66 13.34L4 11L9.66 8.66L12 3Z" />
    <path d="M5 3L6 5" />
    <path d="M19 21L18 19" />
    <path d="M3 19L5 18" />
    <path d="M21 5L19 6" />
    <path d="M9 3L10 5" />
    <path d="M15 21L14 19" />
    <path d="M3 9L5 10" />
    <path d="M21 15L19 14" />
  </svg>
);

export default SparklesIcon;

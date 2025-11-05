import React from 'react';

const TransitionsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w.org/2000/svg"
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
    <rect x="2" y="7" width="20" height="10" rx="2" ry="2" />
    <path d="M7 2v20" />
    <path d="M17 2v20" />
  </svg>
);

export default TransitionsIcon;

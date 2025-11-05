import React from 'react';

const TimelineIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
    <path d="M4 4h16v16H4z" />
    <path d="M8 4v16" />
    <path d="M16 4v16" />
    <path d="M4 8h16" />
    <path d="M4 16h16" />
  </svg>
);

export default TimelineIcon;
import React from 'react';

const PencilRulerIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
    <path d="m15 5 4 4" />
    <path d="M13 7 8 12l5 5" />
    <path d="m8 22 4-4" />
    <path d="M17 3 3.5 16.5a2.12 2.12 0 0 0 0 3L5 21l3-3L19.5 6.5a2.12 2.12 0 0 0-3-3L15 5Z" />
  </svg>
);

export default PencilRulerIcon;

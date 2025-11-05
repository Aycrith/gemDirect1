import React from 'react';

const VfxIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
    <path d="M5 3v4" />
    <path d="M19 17v4" />
    <path d="M3 5h4" />
    <path d="M17 19h4" />
    <path d="M12 3v4" />
    <path d="M12 17v4" />
    <path d="M10 5h4" />
    <path d="M10 19h4" />
    <path d="m3 10 4 4" />
    <path d="m17 10 4 4" />
    <path d="m3 14 4-4" />
    <path d="m17 14 4-4" />
  </svg>
);

export default VfxIcon;

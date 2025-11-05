import React from 'react';

const LightingIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
    <path d="M12 2v3" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 2.12 2.12" />
    <path d="m16.95 16.95 2.12 2.12" />
    <path d="M2 12h3" />
    <path d="M19 12h3" />
    <path d="m4.93 19.07 2.12-2.12" />
    <path d="m16.95 7.05 2.12-2.12" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);

export default LightingIcon;

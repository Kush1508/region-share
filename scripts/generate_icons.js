import fs from 'fs';
import path from 'path';

// Generate SVG icons and write PNGs or SVGs
const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1e2f"/>
      <stop offset="100%" stop-color="#0f111a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#6366f1"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Rounded Background -->
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>

  <!-- Screen Frame Outline -->
  <rect x="20" y="24" width="88" height="64" rx="8" fill="none" stroke="#334155" stroke-width="3"/>

  <!-- Crop Corner Handles -->
  <path d="M 34 50 L 34 40 L 44 40" fill="none" stroke="url(#accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 94 50 L 94 40 L 84 40" fill="none" stroke="url(#accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 34 66 L 34 76 L 44 76" fill="none" stroke="url(#accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 94 66 L 94 76 L 84 76" fill="none" stroke="url(#accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Cropped Region Box -->
  <rect x="40" y="44" width="48" height="28" rx="4" fill="#38bdf8" fill-opacity="0.15" stroke="url(#accent)" stroke-width="2.5" stroke-dasharray="4 2" filter="url(#glow)"/>

  <!-- Play / Stream Indicator inside region -->
  <polygon points="61,53 61,63 71,58" fill="#38bdf8"/>

  <!-- Stand / Base of Screen -->
  <path d="M 52 88 L 76 88 L 82 100 L 46 100 Z" fill="#475569" rx="2"/>
  <rect x="42" y="100" width="44" height="4" rx="2" fill="#64748b"/>
</svg>
`;

const iconsDir = path.resolve('icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgIcon.trim());
console.log('SVG icon generated.');

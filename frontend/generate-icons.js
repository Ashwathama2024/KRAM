// Run: node generate-icons.js
// Generates placeholder PNG icons for PWA
import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';

const sizes = [192, 512];
mkdirSync('./public/icons', { recursive: true });

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1e40af';
  const r = size * 0.18;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.fill();

  // Letter
  ctx.fillStyle = 'white';
  ctx.font = `bold ${size * 0.55}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('D', size / 2, size / 2 + size * 0.05);

  writeFileSync(`./public/icons/icon-${size}.png`, canvas.toBuffer('image/png'));
  console.log(`Created icon-${size}.png`);
}

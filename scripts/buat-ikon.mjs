// Membuat ikon PWA (sekali jalan): node scripts/buat-ikon.mjs
import sharp from 'sharp';
const svg = (pad) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#e00000"/><text x="256" y="${256 + 8}" text-anchor="middle" dominant-baseline="central" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${pad ? 250 : 300}" fill="#fff">S</text></svg>`);
for (const [name, size, pad] of [['icon-192', 192, false], ['icon-512', 512, false], ['icon-maskable-512', 512, true], ['apple-touch-icon', 180, false]]) {
  await sharp(svg(pad)).resize(size, size).png().toFile(`public/icons/${name}.png`);
}
console.log('ikon dibuat di public/icons');

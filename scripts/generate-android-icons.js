const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '..', 'assets', 'icon.svg');
const outBase = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const sizes = [
  {name: 'mipmap-mdpi', size: 48},
  {name: 'mipmap-hdpi', size: 72},
  {name: 'mipmap-xhdpi', size: 96},
  {name: 'mipmap-xxhdpi', size: 144},
  {name: 'mipmap-xxxhdpi', size: 192},
  {name: 'playstore', size: 512},
  {name: 'playstore-large', size: 1024}
];

async function run() {
  if (!fs.existsSync(svgPath)) {
    console.error('SVG icon not found at', svgPath);
    process.exit(1);
  }

  for (const s of sizes) {
    const dir = s.name.startsWith('mipmap') ? path.join(outBase, s.name) : path.join(outBase, 'mipmap-xxxhdpi');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, `ic_launcher_${s.size}.png`);
    await sharp(svgPath)
      .resize(s.size, s.size)
      .png()
      .toFile(outPath);
    console.log('Wrote', outPath);
  }
  console.log('All icons generated. You may want to replace Android manifest/adaptive icon resources manually if needed.');
}

run().catch(err => { console.error(err); process.exit(1); });
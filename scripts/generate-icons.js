/**
 * Generates PWA icon PNGs in all required sizes from public/resources/favicon.png.
 * Run once with: node scripts/generate-icons.js
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SRC = path.join(__dirname, '..', 'public', 'resources', 'favicon.png');
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

async function main() {
    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    for (const size of SIZES) {
        const dest = path.join(OUT_DIR, `icon-${size}.png`);
        await sharp(SRC)
            .resize(size, size, { fit: 'contain', background: { r: 23, g: 162, b: 184, alpha: 1 } })
            .png()
            .toFile(dest);
        console.log(`Generated ${dest}`);
    }

    // maskable icon: icon fills the safe zone (slightly padded)
    const maskableDest = path.join(OUT_DIR, 'icon-512-maskable.png');
    const padding = Math.round(512 * 0.1);
    await sharp(SRC)
        .resize(512 - padding * 2, 512 - padding * 2, { fit: 'contain', background: { r: 23, g: 162, b: 184, alpha: 0 } })
        .extend({ top: padding, bottom: padding, left: padding, right: padding, background: { r: 23, g: 162, b: 184, alpha: 1 } })
        .png()
        .toFile(maskableDest);
    console.log(`Generated ${maskableDest}`);

    console.log('All icons generated successfully.');
}

main().catch(err => { console.error(err); process.exit(1); });

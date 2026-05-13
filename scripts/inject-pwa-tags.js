/**
 * Injects PWA meta tags and the pwa.js script into all app HTML pages.
 * Run once with: node scripts/inject-pwa-tags.js
 * Safe to re-run — skips files already patched.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// HTML files to patch (exclude demo subdirectory)
const HTML_FILES = [
    'index.html',
    'login.html',
    'forms-manage.html',
    'forms-view.html',
    'live-forms.html',
    'surveys-manage.html',
    'surveys-view.html',
    'surveys-tracking.html',
    'surveys-results.html',
    'live-surveys.html',
    'members.html',
    'skills.html',
    'users.html',
    'profile.html',
    'templates.html',
    'third-parties.html',
    'reports.html',
    'statistics.html',
    'training-planner.html',
    'event-log.html',
    'system-tools.html',
];

const PWA_META = `    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#17A2B8">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="OpReady">
    <link rel="apple-touch-icon" href="/icons/icon-192.png">`;

const PWA_SCRIPT = '    <script src="/js/pwa.js"></script>';

// Marker we use to detect already-patched files
const PATCH_MARKER = 'href="/manifest.json"';

let patched = 0;
let skipped = 0;

for (const filename of HTML_FILES) {
    const filepath = path.join(PUBLIC_DIR, filename);

    if (!fs.existsSync(filepath)) {
        console.warn(`  SKIP (not found): ${filename}`);
        skipped++;
        continue;
    }

    let content = fs.readFileSync(filepath, 'utf8');

    if (content.includes(PATCH_MARKER)) {
        console.log(`  SKIP (already patched): ${filename}`);
        skipped++;
        continue;
    }

    // 1. Inject meta tags after the favicon <link> line
    const faviconPattern = /(<link\s+rel="icon"[^>]*favicon\.ico[^>]*>)/i;
    if (faviconPattern.test(content)) {
        content = content.replace(faviconPattern, `$1\n${PWA_META}`);
    } else {
        // Fallback: inject after <meta name="viewport">
        const vpPattern = /(<meta\s+name="viewport"[^>]*>)/i;
        content = content.replace(vpPattern, `$1\n${PWA_META}`);
    }

    // 2. Inject pwa.js script before </body>
    if (!content.includes('/js/pwa.js')) {
        content = content.replace(/(\s*<\/body>)/, `\n${PWA_SCRIPT}\n$1`);
    }

    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`  PATCHED: ${filename}`);
    patched++;
}

console.log(`\nDone — ${patched} patched, ${skipped} skipped.`);

/**
 * Playwright walkthrough of the pdf-report extraction plugin, against a
 * disposable server running EXTRACTION_PLUGIN=pdf-report on a scratch copy of
 * demo.db. Uses only the fictional sample report (see sample-report.js) and
 * the demo database's fictional members.
 *
 * Flow: empty Skills Data Source page â†’ upload the sample report â†’ dashboard
 * refresh (automatic name matching runs) â†’ name matching (manual match of the
 * ambiguous name) â†’ older report confirmation â†’ history â†’ reports â†’ statistics
 * â†’ phone views.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('@playwright/test');

async function safe(label, fn) {
    try {
        return await fn();
    } catch (e) {
        console.warn(`[guide:pdf-report] Skipped "${label}": ${e.message.split('\n')[0]}`);
        return undefined;
    }
}

// The dashboard pops up "pending reviews" when the demo data has submitted forms â€”
// close it the way a user would before interacting with the page.
async function dismissPendingReviews(page) {
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
        const m = document.getElementById('pendingReviewsModal');
        if (m && m.style.display === 'block' && typeof closeModal === 'function') closeModal('pendingReviewsModal');
    });
}

// Screenshot one element without the page's floating buttons (back, help,
// scroll-to-top) overlapping its edges; full-page shots keep them.
const FLOATING = '#globalHelpBtn, .back-btn, #scrollTopBtn';
async function elementShot(page, locator, file) {
    // A stylesheet rule, not inline styles: the page's own scroll handler re-shows
    // the scroll-to-top button when the screenshot scrolls the element into view.
    await page.evaluate((sel) => {
        const style = document.createElement('style');
        style.id = 'guide-hide-floating';
        style.textContent = `${sel} { display: none !important; }`;
        document.head.appendChild(style);
    }, FLOATING);
    try {
        await locator.screenshot({ path: file });
    } finally {
        await page.evaluate(() => document.getElementById('guide-hide-floating')?.remove());
    }
}

async function login(context, baseUrl, username, password) {
    const res = await context.request.post(`${baseUrl}/login`, { data: { username, password } });
    if (!res.ok()) throw new Error(`Login failed (${res.status()})`);
}

/**
 * @returns {Promise<{ shots: Record<string, string>, data: object }>}
 */
async function capturePdfReportScreenshots({ baseUrl, username, password, outDir, samplePdf, olderSamplePdf }) {
    fs.mkdirSync(outDir, { recursive: true });
    const shots = {};
    const data = {};
    const shot = (key) => {
        shots[key] = path.join(outDir, `${key}.png`);
        return shots[key];
    };

    const browser = await chromium.launch();
    try {
        // â”€â”€ Desktop (admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await login(desktop, baseUrl, username, password);
        const page = await desktop.newPage();

        // 1. Empty Skills Data Source page
        await page.goto(`${baseUrl}/data-source.html`);
        await page.waitForSelector('#currentReport .ds-grid');
        await page.waitForTimeout(400);
        await page.screenshot({ path: shot('ds-empty') });

        // 2. Upload the sample report
        await page.setInputFiles('#reportFile', samplePdf);
        await elementShot(page, page.locator('.system-card', { has: page.locator('#dropZone') }), shot('ds-upload-chosen'));
        await page.click('#uploadBtn');
        await page.waitForSelector('.ds-badge.current', { timeout: 30000 });
        await page.waitForSelector('#namesTable tbody tr');
        await page.waitForTimeout(600);
        await page.screenshot({ path: shot('ds-after-upload') });
        await elementShot(page, page.locator('.system-card', { has: page.locator('#currentReport') }), shot('ds-current'));
        await elementShot(page, page.locator('#namesCard'), shot('ds-names-before-refresh'));

        // 3. Dashboard â€” loading skill data runs the plugin (automatic matching happens here)
        await page.goto(`${baseUrl}/`);
        await dismissPendingReviews(page);
        await page.fill('#daysInput', '200');
        await page.dispatchEvent('#daysInput', 'input');
        await page.dispatchEvent('#daysInput', 'change');
        await page.click('#viewBtn');
        await page.waitForSelector('td.date-cell', { timeout: 60000 });
        await page.waitForSelector('#reportCreatedLabel', { state: 'visible' });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(800);
        await page.screenshot({ path: shot('dash-top') });
        await safe('dashboard rows', async () => {
            const rows = page.locator('#tableContainer');
            await rows.scrollIntoViewIfNeeded();
            await page.waitForTimeout(400);
            await page.screenshot({ path: shot('dash-rows') });
        });
        data.dashboardBanner = await page.locator('#unmatchedNamesBanner').innerText().catch(() => '');
        data.reportCreatedLabel = await page.locator('#reportCreatedLabel').innerText().catch(() => '');

        // 4. Name matching after the refresh, then match the ambiguous name by hand
        await page.goto(`${baseUrl}/data-source.html`);
        await page.waitForSelector('#namesTable tbody tr td .ds-actions');
        await page.waitForTimeout(400);
        await elementShot(page, page.locator('#namesCard'), shot('ds-names'));
        data.namesSummary = (await page.locator('#namesSummary').innerText()).replace(/\s+/g, ' ');

        await safe('manual match', async () => {
            const reviewRow = page.locator('#namesTable tbody tr', { has: page.locator('.ds-badge', { hasText: /needs review/i }) }).first();
            await reviewRow.locator('button', { hasText: 'Match' }).click();
            await page.waitForSelector('#matchModal[style*="block"]');
            const firstSuggested = await page.locator('#matchMember optgroup[label="Possible matches"] option').first().getAttribute('value');
            await page.selectOption('#matchMember', firstSuggested);
            await page.waitForTimeout(300);
            await page.screenshot({ path: shot('ds-match-modal') });
            await page.click('#matchSaveBtn');
            await page.waitForTimeout(1500);
            await elementShot(page, page.locator('#namesCard'), shot('ds-names-after-match'));
        });

        // 5. An older report needs confirmation (cancelled â€” the current report stays)
        await safe('older report', async () => {
            await page.setInputFiles('#reportFile', olderSamplePdf);
            await page.click('#uploadBtn');
            await page.waitForSelector('#customConfirmModal', { state: 'visible', timeout: 15000 });
            await page.waitForTimeout(300);
            await page.screenshot({ path: shot('ds-older-confirm') });
            await page.click('#btnConfirmCancel');
            await page.waitForTimeout(500);
        });

        // 6. Same file again â†’ "nothing changed"
        await safe('identical upload', async () => {
            await page.setInputFiles('#reportFile', samplePdf);
            await page.click('#uploadBtn');
            await page.waitForTimeout(1200);
            await page.screenshot({ path: shot('ds-identical') });
        });

        await safe('history', async () => {
            await page.reload();
            await page.waitForSelector('#historyTable tbody tr td .ds-actions');
            await elementShot(page, page.locator('.system-card', { has: page.locator('#historyTable') }), shot('ds-history'));
        });

        // 7. Reports
        const runReport = async (type, days) => {
            await page.goto(`${baseUrl}/reports.html`);
            await page.selectOption('#reportSelect', type);
            await page.waitForTimeout(500);
            if (days !== undefined && await page.locator('#param_days').count()) await page.fill('#param_days', String(days));
            await page.click('button:has-text("Run Report")');
            await page.waitForSelector('.rpt-header', { timeout: 60000 });
            await page.locator('.rpt-header').first().scrollIntoViewIfNeeded();
            await page.waitForTimeout(600);
        };
        await safe('compliance matrix', async () => {
            await runReport('compliance-matrix', 90);
            await page.screenshot({ path: shot('rpt-matrix') });
        });
        await safe('by member', async () => {
            await runReport('by-member', 200);
            await page.screenshot({ path: shot('rpt-by-member') });
        });
        await safe('critical overdue', async () => {
            await runReport('critical-overdue');
            await page.screenshot({ path: shot('rpt-critical') });
        });

        // 8. Statistics
        await safe('statistics', async () => {
            await page.goto(`${baseUrl}/statistics.html`);
            await page.selectOption('select:has(option[value="compliance-overview"])', 'compliance-overview');
            await page.click('button:has-text("Refresh Data")');
            await page.waitForSelector('.rpt-header', { timeout: 60000 });
            await page.waitForTimeout(1200);
            await page.screenshot({ path: shot('stats') });
        });

        // 9. Event log
        await safe('event log', async () => {
            await page.goto(`${baseUrl}/event-log.html`);
            await page.waitForTimeout(2500);
            await page.screenshot({ path: shot('event-log') });
        });
        await desktop.close();

        // â”€â”€ Phone â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const phone = await browser.newContext({ ...devices['iPhone 13'] });
        await login(phone, baseUrl, username, password);
        const mobile = await phone.newPage();
        await safe('phone dashboard', async () => {
            await mobile.goto(`${baseUrl}/`);
            await dismissPendingReviews(mobile);
            await mobile.click('#viewBtn');
            await mobile.waitForSelector('#reportCreatedLabel', { state: 'visible', timeout: 60000 });
            await mobile.waitForTimeout(1500);
            await mobile.locator('#unmatchedNamesBanner').scrollIntoViewIfNeeded();
            await mobile.waitForTimeout(500);
            await mobile.screenshot({ path: shot('m-dashboard') });
        });
        await safe('phone data source', async () => {
            await mobile.goto(`${baseUrl}/data-source.html`);
            await mobile.waitForSelector('#namesTable .bt-cards .table-card');
            await mobile.locator('#namesCard').scrollIntoViewIfNeeded();
            await mobile.waitForTimeout(500);
            await mobile.screenshot({ path: shot('m-names') });
        });
        await phone.close();
    } finally {
        await browser.close();
    }

    for (const [key, file] of Object.entries(shots)) {
        if (!fs.existsSync(file)) delete shots[key];
    }
    return { shots, data };
}

module.exports = { capturePdfReportScreenshots };

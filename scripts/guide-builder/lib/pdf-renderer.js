/**
 * Renders a fully-assembled HTML guide document to PDF using Playwright's
 * own print pipeline — no PDF library dependency needed. Screenshots are
 * embedded as base64 data URIs by guide-html.js, so the document is fully
 * self-contained and needs no file:// access.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

async function renderPdf({ html, outputPath, title }) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '16mm', left: '16mm', right: '16mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%; font-size:8px; color:#888; padding:0 16mm; display:flex; justify-content:space-between;">
          <span>${title ? title.replace(/"/g, '&quot;') : 'OpReady'}</span>
          <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
    });
  } finally {
    await browser.close();
  }
}

module.exports = { renderPdf };

// services/scraper.js
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const config = require('../config');

const getTime = () => new Date().toLocaleTimeString(config.locale, { timeZone: config.timezone });

let cachedData = null;
let lastScrapeTime = 0;

async function getOIData(url, intervalMinutes = 0, proxyUrl = null, logger = console.log) {
    // 1. Check Cache
    if (cachedData && lastScrapeTime > 0 && intervalMinutes > 0) {
        const now = Date.now();
        const cacheAgeMs = now - lastScrapeTime;
        const maxAgeMs = intervalMinutes * 60 * 1000;
        if (cacheAgeMs < maxAgeMs) {
            logger(`[Scraper] 🟢 Using cached data (Age: ${Math.round(cacheAgeMs / 1000)}s / Limit: ${intervalMinutes * 60}s)`);
            return cachedData;
        }
    }
    const axiosConfig = {
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
        }
    };

    // --- PROXY LOGIC ---
    if (proxyUrl) {
        try {
            const agent = new HttpsProxyAgent(proxyUrl);
            axiosConfig.httpsAgent = agent;
            axiosConfig.proxy = false;
            logger(`[Scraper] Using Proxy Agent: ${proxyUrl.replace(/:[^:]*@/, ':***@')}`);
        } catch (e) {
            logger(`[Scraper] Failed to configure Proxy Agent: ${e.message}`);
        }
    } else {
        axiosConfig.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }

    // 2. Scrape Data
    try {
        logger(`[${getTime()}] [Scraper] 🟠 Cache invalid or disabled. Scraping live data from URL...`);
        const response = await axios.get(url, axiosConfig);

        if (!response.data) {
            logger(`[Scraper] Warning: Empty response from server.`);
            return [];
        }

        const $ = cheerio.load(response.data);
        const osmStatusTable = $('tbody');

        if (osmStatusTable.length === 0) {
            logger(`[Scraper] Warning: No <tbody> found in page. Check URL or page structure.`);
            return [];
        }

        let scrapedData = [];
        osmStatusTable.find('tr').each((i, row) => {
            const cols = [];
            $(row).find('td').each((j, col) => cols.push($(col).text().trim()));

            if (cols.length >= 3) {
                scrapedData.push({ name: cols[0], skill: cols[1], dueDate: cols[2] });
            }
        });

        logger(`[Scraper] Successfully parsed ${scrapedData.length} records.`);

        // [NEW] Log all records to console
        if (scrapedData.length > 0) {
            logger('[Scraper] --- Extracted Data Start ---');
            scrapedData.forEach((record, index) => {
                //        logger(`   ${index + 1}. ${JSON.stringify(record)}`);
            });
            logger('[Scraper] --- Extracted Data End ---');
        }

        if (scrapedData.length > 0) {
            cachedData = scrapedData;
            lastScrapeTime = Date.now();
        }
        return scrapedData;

    } catch (error) {
        logger(`[${getTime()}] [Scraper] Request Failed: ${error.message}`);
        if (error.response) logger(`[Scraper] Status: ${error.response.status}`);
        throw error;
    }
}

module.exports = { getOIData };
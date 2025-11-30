const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const { URL } = require('url'); 

const getTime = () => new Date().toLocaleTimeString();

let cachedData = null;
let lastScrapeTime = 0;

async function getOIData(url, intervalMinutes = 0, proxyUrl = null, logger = console.log) {
    // 1. Check Cache
    if (cachedData && lastScrapeTime > 0 && intervalMinutes > 0) {
        const now = Date.now();
        const cacheAgeMs = now - lastScrapeTime;
        const maxAgeMs = intervalMinutes * 60 * 1000;

        if (cacheAgeMs < maxAgeMs) {
            const ageMinutes = Math.round(cacheAgeMs / 60000);
            logger(`[${getTime()}] [Scraper] Returning cached data (${ageMinutes} min old). Next scrape in ${intervalMinutes - ageMinutes} min.`);
            return cachedData;
        } else {
            logger(`[${getTime()}] [Scraper] Cache expired (${Math.round(cacheAgeMs / 60000)} min old). Re-scraping...`);
        }
    } else {
        if (intervalMinutes > 0) {
            logger(`[${getTime()}] [Scraper] No cache found. Scraping...`);
        } else {
            logger(`[${getTime()}] [Scraper] Scraping data (Cache disabled)...`);
        }
    }

    // --- CHANGED: Removed httpsAgent conflict ---
    const axiosConfig = {
        // httpsAgent: new https.Agent({ rejectUnauthorized: false }), // REMOVED: This breaks proxy tunneling
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    };

    // ADD PROXY LOGIC
    if (proxyUrl) {
        try {
            const proxyObj = new URL(proxyUrl);
            axiosConfig.proxy = {
                protocol: proxyObj.protocol.replace(':', ''),
                host: proxyObj.hostname,
                port: parseInt(proxyObj.port), // Ensure port is a number
            };
            if (proxyObj.username && proxyObj.password) {
                axiosConfig.proxy.auth = {
                    username: decodeURIComponent(proxyObj.username),
                    password: decodeURIComponent(proxyObj.password)
                };
            }
            logger(`[Scraper] Using Proxy: ${proxyObj.hostname}:${proxyObj.port}`);
        } catch (e) {
            logger(`[Scraper] Invalid Proxy URL provided: ${e.message}`);
        }
    } else {
        // Optional: Only use the insecure agent if NO proxy is used (for local dev)
        axiosConfig.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }

    // 2. Scrape Data
    try {
        logger(`[${getTime()}] [Scraper] DEBUG: Starting Request to ${url}`);

        const startTime = Date.now();
        const response = await axios.get(url, axiosConfig); 

        const duration = Date.now() - startTime;
        logger(`[${getTime()}] [Scraper] DEBUG: Response received in ${duration}ms. Status: ${response.status}`);

        if (!response.data) {
            logger(`[${getTime()}] [Scraper] WARNING: Response body is empty.`);
            return [];
        }

        // ... rest of the parsing logic ...
        const $ = cheerio.load(response.data);
        const osmStatusTable = $('tbody');

        if (osmStatusTable.length === 0) {
            logger(`[${getTime()}] [Scraper] WARNING: Could not find 'tbody' element.`);
            return [];
        }

        let scrapedData = [];
        let malformedRows = 0;

        osmStatusTable.find('tr').each((i, row) => {
            const cols = [];
            $(row).find('td').each((j, col) => {
                cols.push($(col).text().trim());
            });

            if (cols.length >= 3) {
                scrapedData.push({ name: cols[0], skill: cols[1], dueDate: cols[2] });
            } else if (cols.length > 0) {
                malformedRows++;
            }
        });

        if (scrapedData.length > 0) {
            cachedData = scrapedData;
            lastScrapeTime = Date.now();
        }

        return scrapedData;

    } catch (error) {
        logger(`[${getTime()}] [Scraper] ERROR: Request Failed.`);
        logger(`[${getTime()}] [Scraper] Error Message: ${error.message}`);
        throw error;
    }
}

module.exports = { getOIData };
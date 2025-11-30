const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const { URL } = require('url'); // Native Node module

// Helper for timestamps
const getTime = () => new Date().toLocaleTimeString();

// --- CACHE STATE ---
let cachedData = null;
let lastScrapeTime = 0;

/**
 * Scrapes the OSM Dashboard.
 * @param {string} url - The URL to scrape.
 * @param {number} [intervalMinutes=0] - Cache validity in minutes. 0 to disable cache.
 * @param {function} [logger=console.log] - Logger function.
 */
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
    // Build Axios Config
    const axiosConfig = {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
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
                port: proxyObj.port,
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
    }
    // 2. Scrape Data
    try {
        logger(`[${getTime()}] [Scraper] DEBUG: Starting Request to ${url}`);

        const startTime = Date.now();
        const response = await axios.get(url, axiosConfig); // Pass the config here

        const duration = Date.now() - startTime;
        logger(`[${getTime()}] [Scraper] DEBUG: Response received in ${duration}ms. Status: ${response.status}`);

        if (!response.data) {
            logger(`[${getTime()}] [Scraper] WARNING: Response body is empty.`);
            return [];
        }

        logger(`[${getTime()}] [Scraper] DEBUG: Parsing HTML content (${response.data.length} bytes)...`);

        const $ = cheerio.load(response.data);
        const osmStatusTable = $('tbody');

        logger(`[${getTime()}] [Scraper] DEBUG: Found ${osmStatusTable.length} 'tbody' elements.`);

        if (osmStatusTable.length === 0) {
            logger(`[${getTime()}] [Scraper] WARNING: Could not find 'tbody' element. Dashboard layout may have changed or page is a Login/Block screen.`);
            // Optional: Log a snippet of the page to see if it's an error page
            // logger(`[${getTime()}] [Scraper] DEBUG: Page Preview: ${response.data.substring(0, 200)}`);
            return [];
        }

        let scrapedData = [];
        let malformedRows = 0;
        let totalRows = 0;

        osmStatusTable.find('tr').each((i, row) => {
            totalRows++;
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

        logger(`[${getTime()}] [Scraper] DEBUG: Processed ${totalRows} table rows.`);

        if (scrapedData.length === 0) {
            logger(`[${getTime()}] [Scraper] WARNING: 0 records retrieved. Check selectors or if dashboard is empty.`);
        } else {
            logger(`[${getTime()}] [Scraper] Data successfully retrieved (${scrapedData.length} records).`);

            // 3. Update Cache (Only on success)
            cachedData = scrapedData;
            lastScrapeTime = Date.now();
        }

        if (malformedRows > 0) {
            logger(`[${getTime()}] [Scraper] WARNING: Skipped ${malformedRows} malformed rows (insufficient columns).`);
        }

        return scrapedData;

    } catch (error) {
        logger(`[${getTime()}] [Scraper] ERROR: Request Failed.`);
        logger(`[${getTime()}] [Scraper] Error Message: ${error.message}`);

        if (error.code) {
            logger(`[${getTime()}] [Scraper] Error Code: ${error.code}`); // e.g., ETIMEDOUT, ECONNREFUSED
        }

        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            logger(`[${getTime()}] [Scraper] HTTP Status: ${error.response.status}`);
            logger(`[${getTime()}] [Scraper] Response Headers: ${JSON.stringify(error.response.headers)}`);
        } else if (error.request) {
            // The request was made but no response was received
            logger(`[${getTime()}] [Scraper] No response received from server.`);
        }

        throw error; // Do not update cache on error
    }
}

module.exports = { getOIData };
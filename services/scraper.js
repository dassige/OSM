const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

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
async function getOIData(url, intervalMinutes = 0, logger = console.log) {
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

    // 2. Scrape Data
    try {
        const response = await axios.get(url, { 
            httpsAgent: new https.Agent({ rejectUnauthorized: false }) 
        });
        const $ = cheerio.load(response.data);
        const osmStatusTable = $('tbody');

        if (osmStatusTable.length === 0) {
             logger(`[${getTime()}] [Scraper] WARNING: Could not find 'tbody' element. Dashboard layout may have changed.`);
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
        logger(`[${getTime()}] [Scraper] Error: ${error.message}`);
        throw error; // Do not update cache on error
    }
}

module.exports = { getOIData };
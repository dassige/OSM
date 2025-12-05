// services/scraper.js
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs').promises;
const { HttpsProxyAgent } = require('https-proxy-agent');
const config = require('../config');

const getTime = () => new Date().toLocaleTimeString(config.locale, { timeZone: config.timezone });

let cachedData = null;
let lastScrapeTime = 0;

// Helper to format JS Date object back to YYYY-MM-DD
function formatDateToISO(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

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

    // 2. Fetch Data (Network or Local File)
    let responseData = "";

    try {
        if (config.appMode === 'demo') {
            logger(`[${getTime()}] [Scraper] 🟢 DEMO MODE: Reading local dashboard file...`);
            responseData = await fs.readFile(url, 'utf8');
        } else {
            logger(`[${getTime()}] [Scraper] 🟠 Cache invalid or disabled. Scraping live data from URL...`);
            
            const axiosConfig = {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            };

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

            const response = await axios.get(url, axiosConfig);
            responseData = response.data;
        }

        if (!responseData) {
            logger(`[Scraper] Warning: Empty response.`);
            return [];
        }

        // 3. Parse Data
        const $ = cheerio.load(responseData);
        const osmStatusTable = $('tbody');

        if (osmStatusTable.length === 0) {
            logger(`[Scraper] Warning: No <tbody> found in page.`);
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

        // 4. [DEMO MODE] Dynamic Date Adjustment
        if (config.appMode === 'demo') {
            // Attempt to find the reference date in the footer div
            // We look for the div with the specific blue background color from the static file
            const footerText = $('div[style*="background:#000099"]').text().trim();
            
            if (footerText) {
                const referenceDate = new Date(footerText);
                
                if (!isNaN(referenceDate.getTime())) {
                    logger(`[Scraper] 🗓️ Demo Reference Date found: ${formatDateToISO(referenceDate)}`);
                    
                    const today = new Date();
                    // Reset time to midnight for clean calculations
                    today.setHours(0,0,0,0);
                    referenceDate.setHours(0,0,0,0);

                    scrapedData = scrapedData.map(record => {
                        const originalDueDate = new Date(record.dueDate);
                        if (isNaN(originalDueDate.getTime())) return record;

                        // Calculate difference: (Skill Date) - (Reference Date)
                        const timeDiff = originalDueDate.getTime() - referenceDate.getTime();
                        
                        // Apply difference to Today
                        const newDueDate = new Date(today.getTime() + timeDiff);
                        
                        return {
                            ...record,
                            dueDate: formatDateToISO(newDueDate)
                        };
                    });
                    logger(`[Scraper] 🔄 Adjusted ${scrapedData.length} dates relative to today.`);
                } else {
                    logger(`[Scraper] ⚠️ Found footer text but could not parse date: "${footerText}"`);
                }
            } else {
                logger(`[Scraper] ⚠️ Could not locate reference date in static HTML. Dates remain unchanged.`);
            }
        }

        logger(`[Scraper] Successfully parsed ${scrapedData.length} records.`);

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
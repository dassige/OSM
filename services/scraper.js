const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
//
const { HttpsProxyAgent } = require('https-proxy-agent'); // Import the new library

const getTime = () => new Date().toLocaleTimeString();

let cachedData = null;
let lastScrapeTime = 0;

async function getOIData(url, intervalMinutes = 0, proxyUrl = null, logger = console.log) {
    // 1. Check Cache
    if (cachedData && lastScrapeTime > 0 && intervalMinutes > 0) {
        // ... (Cache logic remains the same)
        const now = Date.now();
        const cacheAgeMs = now - lastScrapeTime;
        const maxAgeMs = intervalMinutes * 60 * 1000;
        if (cacheAgeMs < maxAgeMs) return cachedData;
    }

    const axiosConfig = {
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    };

    // ---  PROXY LOGIC ---
    if (proxyUrl) {
        try {
            // Create a dedicated proxy agent
            // This handles auth parsing and the CONNECT tunnel automatically
            const agent = new HttpsProxyAgent(proxyUrl);
            
            // Assign the agent to axios
            axiosConfig.httpsAgent = agent;
            
            // CRITICAL: Disable axios's native proxy handling so it doesn't conflict with the agent
            axiosConfig.proxy = false; 
            
            logger(`[Scraper] Using Proxy Agent: ${proxyUrl.replace(/:[^:]*@/, ':***@')}`); // Log masked URL
        } catch (e) {
            logger(`[Scraper] Failed to configure Proxy Agent: ${e.message}`);
        }
    } else {
        // Only use the insecure agent if NO proxy is used (optional, for local dev)
        axiosConfig.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }

    // 2. Scrape Data
    try {
        logger(`[${getTime()}] [Scraper] Starting Request to ${url}`);
        const response = await axios.get(url, axiosConfig);
        
        // ... (Rest of the parsing logic remains the same)
        if (!response.data) return [];
        const $ = cheerio.load(response.data);
        const osmStatusTable = $('tbody');
        if (osmStatusTable.length === 0) return [];

        let scrapedData = [];
        osmStatusTable.find('tr').each((i, row) => {
            const cols = [];
            $(row).find('td').each((j, col) => cols.push($(col).text().trim()));
            if (cols.length >= 3) {
                scrapedData.push({ name: cols[0], skill: cols[1], dueDate: cols[2] });
            }
        });

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
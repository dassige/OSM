const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

// Helper for timestamps
const getTime = () => new Date().toLocaleTimeString();

async function getOIData(url, logger = console.log) {
    logger(`[${getTime()}] [Scraper] Retrieving OI Data from dashboard...`);
    try {
        const response = await axios.get(url, { 
            httpsAgent: new https.Agent({ rejectUnauthorized: false }) 
        });
        const $ = cheerio.load(response.data);
        const osmStatusTable = $('tbody');

        let scrapedData = [];
        
        osmStatusTable.find('tr').each((i, row) => {
            const cols = [];
            $(row).find('td').each((j, col) => {
                cols.push($(col).text().trim());
            });
            if (cols.length > 0) {
                // Assuming format: [Name, Skill, DueDate] based on original parser
                scrapedData.push({ name: cols[0], skill: cols[1], dueDate: cols[2] });
            }
        });

        logger(`[${getTime()}] [Scraper] Data successfully retrieved (${scrapedData.length} records).`);
        return scrapedData;
    } catch (error) {
        logger(`[${getTime()}] [Scraper] Error: ${error.message}`);
        throw error;
    }
}

module.exports = { getOIData };
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

        // Validation 1: Check if the table body exists
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

            // Validation 2: Row Integrity
            // We expect at least 3 columns: [Name, Skill, DueDate]
            // We ignore empty rows (cols.length === 0) often found in scraping
            if (cols.length >= 3) {
                scrapedData.push({ name: cols[0], skill: cols[1], dueDate: cols[2] });
            } else if (cols.length > 0) {
                 // Only count as malformed if it has some data but not enough
                 malformedRows++;
            }
        });

        // Validation 3: Check for "Silent Failure" (No data found despite 200 OK)
        if (scrapedData.length === 0) {
             logger(`[${getTime()}] [Scraper] WARNING: 0 records retrieved. Check selectors or if dashboard is empty.`);
        } else {
             logger(`[${getTime()}] [Scraper] Data successfully retrieved (${scrapedData.length} records).`);
        }

        if (malformedRows > 0) {
            logger(`[${getTime()}] [Scraper] WARNING: Skipped ${malformedRows} malformed rows (insufficient columns).`);
        }

        return scrapedData;

    } catch (error) {
        logger(`[${getTime()}] [Scraper] Error: ${error.message}`);
        throw error;
    }
}

module.exports = { getOIData };
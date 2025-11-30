// services/proxy-manager.js
const axios = require('axios');
const https = require('https');

// Default source if not provided in .env
const DEFAULT_SOURCE = "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=NZ&ssl=all&anonymity=all";

async function findWorkingNZProxy(logger = console.log, customSource = null) {
    const sourceUrl = customSource || DEFAULT_SOURCE;
    logger(`[ProxyManager] 📡 Fetching NZ proxy list from source...`);
    logger(`[ProxyManager] 🔗 Source URL: ${sourceUrl}`);

    try {
        const response = await axios.get(sourceUrl);
        const rawList = response.data.trim().split('\n');
        
        const proxyList = rawList
            .map(p => p.trim())
            .filter(p => p && p.includes(':'));

        if (proxyList.length === 0) {
            logger(`[ProxyManager] ⚠️  No proxies returned from API.`);
            return null;
        }

        logger(`[ProxyManager] 📝 Parsed ${proxyList.length} candidates. Starting connectivity tests...`);

        for (let i = 0; i < proxyList.length; i++) {
            const proxyAddr = proxyList[i];
            const proxyUrl = `http://${proxyAddr}`;
            
            logger(`[ProxyManager] 🔍 [${i+1}/${proxyList.length}] Testing: ${proxyAddr} ...`);
            
            const isAlive = await verifyProxy(proxyUrl);
            
            if (isAlive) {
                logger(`[ProxyManager] ✅ SUCCESS! Candidate passed verification.`);
                return proxyUrl;
            } else {
                // Optional: log failure if you want very verbose logs
                // logger(`[ProxyManager] ❌ Failed.`); 
            }
        }
        
        logger(`[ProxyManager] 🚫 Exhausted all ${proxyList.length} candidates. None worked.`);
        return null;

    } catch (error) {
        logger(`[ProxyManager] 💥 Error during fetch: ${error.message}`);
        return null;
    }
}

async function verifyProxy(proxyUrl) {
    try {
        const { URL } = require('url');
        const pUrl = new URL(proxyUrl);
        const agent = new https.Agent({ rejectUnauthorized: false });
        
        const start = Date.now();
        await axios.get("https://www.dashboardlive.nz/index.php", {
            timeout: 5000,
            httpsAgent: agent,
            proxy: {
                protocol: 'http',
                host: pUrl.hostname,
                port: pUrl.port
            }
        });
        const duration = Date.now() - start;
        // console.log(`   -> Latency: ${duration}ms`); // Uncomment for latency stats
        return true;
    } catch (e) {
        // console.log(`   -> Error: ${e.message}`); // Uncomment for verbose error reasons
        return false;
    }
}

module.exports = { findWorkingNZProxy };
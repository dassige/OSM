// services/proxy-manager.js
const axios = require('axios');
// const https = require('https'); // Not needed if we remove the agent

const DEFAULT_SOURCE = "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=NZ&ssl=all&anonymity=all";

async function findWorkingNZProxy(logger = console.log, customSource = null) {
    const sourceUrl = customSource || DEFAULT_SOURCE;
    logger(`[ProxyManager] 📡 Fetching NZ proxy list from source...`);

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
        
        // --- CHANGED: Removed manual httpsAgent ---
        // The previous agent was preventing the proxy from tunneling correctly.
        
        const start = Date.now();
        await axios.get("https://www.dashboardlive.nz/index.php", {
            timeout: 5000,
            proxy: {
                protocol: 'http',
                host: pUrl.hostname,
                port: parseInt(pUrl.port) // Ensure port is a number
            }
        });
        const duration = Date.now() - start;
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = { findWorkingNZProxy };
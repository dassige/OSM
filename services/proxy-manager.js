const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const DEFAULT_SOURCE = "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=NZ&ssl=all&anonymity=all";

let activeProxy = null; // Store state here

// Add getters and setters
function getActiveProxy() {
    return activeProxy;
}

function setActiveProxy(proxyUrl) {
    activeProxy = proxyUrl;
}
async function findWorkingNZProxy(logger = console.log, customSource = null) {
    // ... (This function remains mostly the same, ensuring it passes the URL to verifyProxy)
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
        const agent = new HttpsProxyAgent(proxyUrl);
        
        const start = Date.now();
        await axios.get("https://www.dashboardlive.nz/index.php", {
            timeout: 5000,
            httpsAgent: agent, // Use the agent
            proxy: false       // Disable native proxy
        });
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = { 
    findWorkingNZProxy, 
    getActiveProxy, 
    setActiveProxy 
};
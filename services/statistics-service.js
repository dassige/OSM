// services/statistics-service.js
const { getOIData } = require('./scraper');
const db = require('./db');
const config = require('../config');
const { isExpiring, isExpired } = require('./member-manager');

// [NEW] Helper for formatted timestamp
function getGeneratedTimestamp() {
    return new Date().toLocaleString(config.locale || 'en-NZ', {
        timeZone: config.timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

async function getComplianceOverview(userId) {
    const dbMembers = await db.getMembers();
    const dbSkills = await db.getSkills();
    
    // [DYNAMIC] Fetch preference saved from the home page dashboard
    const daysThreshold = await db.getUserPreference(userId, 'daysToExpiry') || 30;

    const scrapeData = await getOIData(config.url, config.scrapingInterval);
    
    const activeMembers = dbMembers.filter(m => m.enabled);
    const trackedSkillNames = new Set(dbSkills.filter(s => s.enabled).map(s => s.name));

    let compliantCount = 0;
    let nonCompliantCount = 0;
    let criticalExpiring = 0;
    let standardExpiring = 0;

    activeMembers.forEach(member => {
        const memberSkills = scrapeData.filter(s => s.name === member.name && trackedSkillNames.has(s.skill));
        const expiring = memberSkills.filter(s => isExpiring(s.dueDate, daysThreshold) || isExpired(s.dueDate));

        if (expiring.length > 0) {
            nonCompliantCount++;
            expiring.forEach(s => {
                const skillConfig = dbSkills.find(ds => ds.name === s.skill);
                if (skillConfig?.critical_skill) criticalExpiring++;
                else standardExpiring++;
            });
        } else {
            compliantCount++;
        }
    });

    return {
        compliance: { compliant: compliantCount, nonCompliant: nonCompliantCount },
        skillDistribution: { critical: criticalExpiring, standard: standardExpiring },
        meta: { 
            threshold: daysThreshold, 
            totalMembers: activeMembers.length,
            generated: getGeneratedTimestamp() // [NEW] Added timestamp
        }
    };
}

module.exports = { getComplianceOverview };
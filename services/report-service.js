// services/report-service.js
const { getOIData } = require('./scraper');
const db = require('./db');
const config = require('../config');
const { isExpiring, isExpired } = require('./member-manager');

// Helper: Strip rank (e.g. "QFF Skywalker" -> "Skywalker")
function getNameWithoutRank(fullName) {
    if (!fullName) return "";
    const parts = fullName.split(' ');
    if (parts.length > 1) {
        return parts.slice(1).join(' ');
    }
    return fullName;
}

// Helper: Format "Generated" date consistently using App Locale
function getGeneratedDate() {
    return new Date().toLocaleDateString(config.locale || 'en-NZ', { 
        timeZone: config.timezone,
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

// Core Data Fetching Logic
async function getFreshData(userId, proxyUrl) {
    console.log(`[ReportService] 🚀 Starting data fetch for User ID: ${userId}`);

    // 1. Get Configs & Preferences
    const dbMembers = await db.getMembers();
    const dbSkills = await db.getSkills();
    
    // Fetch 'daysToExpiry' preference (Default to 30)
    let daysThreshold = 30;
    try {
        const pref = await db.getUserPreference(userId, 'daysToExpiry');
        if (pref) {
            daysThreshold = parseInt(pref);
            console.log(`[ReportService] ⚙️ User Preference Loaded: Days to Expiry = ${daysThreshold}`);
        } else {
            console.log(`[ReportService] ⚠️ No User Preference found. Using default: ${daysThreshold} days.`);
        }
    } catch (e) { 
        console.error("[ReportService] ❌ Error fetching preferences:", e.message); 
    }

    // 2. Get Live/Cached Scrape Data
    console.log(`[ReportService] 📡 Fetching Scrape Data (Interval: ${config.scrapingInterval}m)...`);
    // Pass the proxyUrl from the controller
    const scrapeData = await getOIData(config.url, config.scrapingInterval, proxyUrl);
    
    if (!scrapeData || scrapeData.length === 0) {
        console.error(`[ReportService] 🛑 CRITICAL: Scraper returned 0 records.`);
        throw new Error("Scraper returned no data. Please check connection.");
    }
    console.log(`[ReportService] ✅ Scraper returned ${scrapeData.length} raw records.`);

    // 3. Merge & Filter
    const activeMembers = dbMembers.filter(m => m.enabled);
    const enabledSkills = dbSkills.filter(s => s.enabled);
    
    console.log(`[ReportService] 🔍 Filtering against ${activeMembers.length} active members and ${enabledSkills.length} tracked skills.`);

    const reportData = [];
    let matchCount = 0;

    activeMembers.forEach(member => {
        const memberSkills = scrapeData.filter(s => s.name === member.name);
        
        memberSkills.forEach(s => {
            const skillConfig = enabledSkills.find(dbS => dbS.name === s.skill);
            if (!skillConfig) return; // Skip untracked skills

            // Check expiry logic
            const isDue = isExpiring(s.dueDate, daysThreshold) || isExpired(s.dueDate);
            
            if (isDue) {
                matchCount++;
                reportData.push({
                    member: member.name,
                    sortName: getNameWithoutRank(member.name),
                    skill: s.skill,
                    dueDate: s.dueDate,
                    isCritical: !!skillConfig.critical_skill
                });
            }
        });
    });

    console.log(`[ReportService] 🏁 Report Generation Complete. Found ${matchCount} expiring items.`);
    return { reportData, daysThreshold };
}

// Report: Group by Member
async function getGroupedByMember(userId, proxyUrl) {
    console.log(`[ReportService] Generating 'By Member' Report...`);
    const { reportData, daysThreshold } = await getFreshData(userId, proxyUrl);
    
    const grouped = {};
    reportData.forEach(item => {
        if (!grouped[item.member]) {
            grouped[item.member] = {
                name: item.member,
                sortName: item.sortName,
                skills: []
            };
        }
        grouped[item.member].skills.push(item);
    });

    const sortedMembers = Object.values(grouped).sort((a, b) => 
        a.sortName.localeCompare(b.sortName)
    );

    sortedMembers.forEach(m => {
        m.skills.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    });

    return {
        items: sortedMembers,
        meta: {
            filterDays: daysThreshold,
            generated: getGeneratedDate()
        }
    };
}

// Report: Group by Skill
async function getGroupedBySkill(userId, proxyUrl) {
    console.log(`[ReportService] Generating 'By Skill' Report...`);
    const { reportData, daysThreshold } = await getFreshData(userId, proxyUrl);

    const grouped = {};
    reportData.forEach(item => {
        if (!grouped[item.skill]) {
            grouped[item.skill] = {
                name: item.skill,
                members: []
            };
        }
        grouped[item.skill].members.push(item);
    });

    const sortedSkills = Object.values(grouped).sort((a, b) => 
        a.name.localeCompare(b.name)
    );

    sortedSkills.forEach(s => {
        s.members.sort((a, b) => a.sortName.localeCompare(b.sortName));
    });

    return {
        items: sortedSkills,
        meta: {
            filterDays: daysThreshold,
            generated: getGeneratedDate()
        }
    };
}

module.exports = {
    getGroupedByMember,
    getGroupedBySkill
};
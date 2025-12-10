const { getOIData } = require('./scraper');
const db = require('./db');
const config = require('../config');
const { isExpiring, isExpired } = require('./member-manager');

function getNameWithoutRank(fullName) {
    if (!fullName) return "";
    const parts = fullName.split(' ');
    if (parts.length > 1) {
        return parts.slice(1).join(' ');
    }
    return fullName;
}

// [UPDATED] Now accepts proxyUrl
async function getFreshData(userId, proxyUrl) {
    // 1. Get Configs & Preferences
    const dbMembers = await db.getMembers();
    const dbSkills = await db.getSkills();
    
    // Fetch 'daysToExpiry' preference (Default to 30)
    let daysThreshold = 30;
    try {
        const pref = await db.getUserPreference(userId, 'daysToExpiry');
        if (pref) daysThreshold = parseInt(pref);
    } catch (e) { console.error("Error fetching pref:", e); }

    // 2. Get Live/Cached Scrape Data
    // [UPDATED] Pass the proxyUrl here
    const scrapeData = await getOIData(config.url, config.scrapingInterval, proxyUrl);

    // 3. Merge & Filter
    const activeMembers = dbMembers.filter(m => m.enabled);
    const enabledSkills = dbSkills.filter(s => s.enabled);

    const reportData = [];

    activeMembers.forEach(member => {
        const memberSkills = scrapeData.filter(s => s.name === member.name);
        
        memberSkills.forEach(s => {
            const skillConfig = enabledSkills.find(dbS => dbS.name === s.skill);
            if (!skillConfig) return; // Skip untracked skills

            const isDue = isExpiring(s.dueDate, daysThreshold) || isExpired(s.dueDate);
            
            if (isDue) {
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

    return { reportData, daysThreshold };
}

// [UPDATED] Pass proxyUrl down
async function getGroupedByMember(userId, proxyUrl) {
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
            generated: new Date().toLocaleDateString()
        }
    };
}

async function getGroupedBySkill(userId, proxyUrl) {
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
            generated: new Date().toLocaleDateString()
        }
    };
}

module.exports = {
    getGroupedByMember,
    getGroupedBySkill
};
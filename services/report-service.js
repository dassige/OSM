// services/report-service.js
const { getOIData } = require('./scraper');
const db = require('./db');
const config = require('../config');
const { isExpiring, isExpired } = require('./member-manager');

// ... (keep getNameWithoutRank and getFreshData functions as they are) ...

// Helper to format the "Generated" date consistently
function getGeneratedDate() {
    return new Date().toLocaleDateString(config.locale, { 
        timeZone: config.timezone,
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

//  Pass proxyUrl down
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
            generated: getGeneratedDate() // [UPDATED] Use helper
        }
    };
}

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
            generated: getGeneratedDate() // [UPDATED] Use helper
        }
    };
}

module.exports = {
    getGroupedByMember,
    getGroupedBySkill
};
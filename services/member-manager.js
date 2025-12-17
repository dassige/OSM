// services/member-manager.js
const config = require('../config');

function parseDate(dateStr) {
    if (!dateStr) return null;
    const cleanStr = dateStr.trim();
    if (cleanStr.toLowerCase().includes('expired')) { return new Date('1970-01-01'); }
    const dmy = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dmy) {
        const day = parseInt(dmy[1], 10);
        const month = parseInt(dmy[2], 10) - 1; 
        let year = parseInt(dmy[3], 10);
        if (year < 100) year += 2000;
        const date = new Date(year, month, day);
        if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) { return date; }
    }
    const fallback = new Date(cleanStr);
    return isNaN(fallback.getTime()) ? null : fallback;
}

function isExpired(dueDateStr) {
    const date = parseDate(dueDateStr);
    if (!date) return false;
    const nowString = new Date().toLocaleString('en-US', { timeZone: config.timezone });
    const today = new Date(nowString);
    today.setHours(0, 0, 0, 0);
    return date < today;
}

function isExpiring(dueDateStr, daysThreshold) {
    const skillExpiryDate = parseDate(dueDateStr);
    if (!skillExpiryDate) return false;
    const nowString = new Date().toLocaleString('en-US', { timeZone: config.timezone });
    const thresholdDate = new Date(nowString);
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
    return skillExpiryDate <= thresholdDate;
}

function processMemberSkills(members, scrapedData, skillsConfig, daysThreshold, trainingMap = {}, liveFormsMap = {}) {
    const activeMembers = members.filter(m => m.enabled);
    
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

    const processedMembers = activeMembers.map(member => {
        const memberRawSkills = scrapedData.filter(item => item.name === member.name);

        const expiringSkills = memberRawSkills.filter(skill => {
            if (isExpiring(skill.dueDate, daysThreshold) || isExpired(skill.dueDate)) {
                const config = skillsConfig.find(c => c.name === skill.skill);
                if (config && config.enabled) {
                    skill.skillId = config.id;
                    if (config.url_type === 'internal') {
                        skill.url = `${appBaseUrl}/forms-view.html?id=${config.url}`;
                        
                        // [NEW] Lookup Live Form Status
                        // Key format matches what we build in server.js
                        const key = `${member.id}_${config.id}`;
                        skill.liveFormStatus = liveFormsMap[key] || null;

                    } else {
                        skill.url = config.url;
                    }

                    skill.isCritical = config.critical_skill;
                    
                    const dates = trainingMap[skill.skill] || [];
                    skill.nextPlannedDates = dates.length > 0 ? dates.join(', ') : 'None planned';
                    
                    return true;
                }
            }
            return false;
        });

        return {
            ...member,
            expiringSkills: expiringSkills
        };
    });

    return processedMembers;
}
module.exports = { processMemberSkills, isExpired, isExpiring, parseDate };
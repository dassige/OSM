// services/member-manager.js
const config = require('../config'); // Import config for timezone

// [NEW] Robust Date Parser (Handles NZ Format & 'Expired' text)
function parseDate(dateStr) {
    if (!dateStr) return null;
    const cleanStr = dateStr.trim();

    // 1. Handle explicit "Expired" text
    if (cleanStr.toLowerCase().includes('expired')) {
        return new Date('1970-01-01'); // Treat as long expired
    }

    // 2. Try NZ format DD/MM/YYYY or DD-MM-YYYY
    // Regex allows 1 or 2 digits for day/month, and 2 or 4 for year
    const dmy = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dmy) {
        const day = parseInt(dmy[1], 10);
        const month = parseInt(dmy[2], 10) - 1; // JS months are 0-11
        let year = parseInt(dmy[3], 10);
        
        // Handle 2-digit years (e.g., 23 -> 2023)
        if (year < 100) year += 2000;

        const date = new Date(year, month, day);
        
        // Validation check
        if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
            return date;
        }
    }

    // 3. Fallback to standard parser (ISO, US format, etc.)
    const fallback = new Date(cleanStr);
    return isNaN(fallback.getTime()) ? null : fallback;
}

// [NEW] Check if a date is strictly in the past
function isExpired(dueDateStr) {
    const date = parseDate(dueDateStr);
    if (!date) return false;

    // Get "Today" in the configured Timezone (strip time)
    const nowString = new Date().toLocaleString('en-US', { timeZone: config.timezone });
    const today = new Date(nowString);
    today.setHours(0, 0, 0, 0);

    return date < today;
}

// [UPDATED] Helper to calculate date difference (Expiring soon OR Expired)
function isExpiring(dueDateStr, daysThreshold) {
    const skillExpiryDate = parseDate(dueDateStr);
    if (!skillExpiryDate) return false;

    // Get "Today" in the configured Timezone
    const nowString = new Date().toLocaleString('en-US', { timeZone: config.timezone });
    const thresholdDate = new Date(nowString);

    // Add Threshold Days
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
    
    // Logic: Returns true for Past dates AND Future dates within threshold
    return skillExpiryDate <= thresholdDate;
}

/**
 * Maps raw scraped data to members and identifies expiring skills.
 * @returns {Array} List of members with their 'expiringSkills' array populated.
 */
function processMemberSkills(members, scrapedData, skillsConfig, daysThreshold) {
    const processedMembers = members.map(member => {
        // 1. Find all raw skills for this member
        const memberRawSkills = scrapedData.filter(item => item.name === member.name);

        // 2. Filter for actionable expiring skills
        const expiringSkills = memberRawSkills.filter(skill => {
            if (isExpiring(skill.dueDate, daysThreshold) || isExpired(skill.dueDate)) {
                // Check if this skill exists in our config (is it actionable?)
                const config = skillsConfig.find(c => c.name === skill.skill);
                if (config) {
                    // Enrich data with URL and Critical status
                    skill.url = config.url;
                    skill.isCritical = config.critical_skill;
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

module.exports = { processMemberSkills, isExpired, parseDate };
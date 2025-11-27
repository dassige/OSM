// Helper to calculate date difference
function isExpiring(dueDateStr, daysThreshold) {
    const skillExpiryDate = new Date(dueDateStr);
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
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
            if (isExpiring(skill.dueDate, daysThreshold)) {
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

        // 3. Return a clean object (avoid mutating the global 'members' directly if possible)
        return {
            ...member,
            expiringSkills: expiringSkills
        };
    });

    return processedMembers;
}

module.exports = { processMemberSkills };
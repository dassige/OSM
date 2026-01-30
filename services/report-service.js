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

// Helper: Format "Generated" date consistently
function getGeneratedDate() {
    return new Date().toLocaleDateString(config.locale || 'en-NZ', { 
        timeZone: config.timezone,
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
}

// Helper: Rank Priority for Sorting
function getRankPriority(name) {
    const n = name.toUpperCase();
    if (n.startsWith('CFO')) return 1;
    if (n.startsWith('DCFO')) return 2;
    if (n.startsWith('SSO')) return 3;
    if (n.startsWith('SO')) return 4;
    if (n.startsWith('SFF')) return 5;
    if (n.startsWith('QFF')) return 6;
    if (n.startsWith('FF')) return 7;
    if (n.startsWith('RFF')) return 8;
    if (n.startsWith('R')) return 9; // Recruit
    return 99; // Civilians / Others
}

// --- CORE DATA FETCHING ---
async function getFreshData(userId, proxyUrl, daysOverride) {
    const dbMembers = await db.getMembers();
    const dbSkills = await db.getSkills();
    
    // Determine Threshold (Override -> Pref -> Default 30)
    let daysThreshold = 30;
    if (daysOverride !== undefined && !isNaN(daysOverride)) {
        daysThreshold = daysOverride;
    } else {
        try {
            const pref = await db.getUserPreference(userId, 'daysToExpiry');
            if (pref) daysThreshold = parseInt(pref);
        } catch (e) {}
    }

    const scrapeData = await getOIData(config.url, config.scrapingInterval, proxyUrl);
    const activeMembers = dbMembers.filter(m => m.enabled);
    const enabledSkills = dbSkills.filter(s => s.enabled);
    
    const reportData = [];

    activeMembers.forEach(member => {
        const memberSkills = scrapeData.filter(s => s.name === member.name);
        
        memberSkills.forEach(s => {
            const skillConfig = enabledSkills.find(dbS => dbS.name === s.skill);
            if (!skillConfig) return; 

            // Check expiry logic using the resolved threshold
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

// --- REPORT FUNCTIONS ---

// 1. Group by Member
async function getGroupedByMember(userId, proxyUrl, days) {
    const { reportData, daysThreshold } = await getFreshData(userId, proxyUrl, days);
    
    const grouped = {};
    reportData.forEach(item => {
        if (!grouped[item.member]) {
            grouped[item.member] = { name: item.member, sortName: item.sortName, skills: [] };
        }
        grouped[item.member].skills.push(item);
    });

    // Sort Members: Rank -> Name
    const sortedMembers = Object.values(grouped).sort((a, b) => {
        const rankA = getRankPriority(a.name);
        const rankB = getRankPriority(b.name);
        
        if (rankA !== rankB) return rankA - rankB; // Rank priority
        return a.sortName.localeCompare(b.sortName); // Alphabetical fallback
    });

    // Sort Skills within Member: Due Date Ascending
    sortedMembers.forEach(m => {
        m.skills.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    });

    return {
        items: sortedMembers,
        meta: { filterDays: daysThreshold, generated: getGeneratedDate() }
    };
}

// 2. Group by Skill
async function getGroupedBySkill(userId, proxyUrl, days) {
    const { reportData, daysThreshold } = await getFreshData(userId, proxyUrl, days);

    const grouped = {};
    reportData.forEach(item => {
        if (!grouped[item.skill]) {
            grouped[item.skill] = { name: item.skill, members: [] };
        }
        grouped[item.skill].members.push(item);
    });

    // 1. Sort Skills Alphabetically
    const sortedSkills = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));
    
    // 2. Sort Members within Skill: Rank -> Name
    sortedSkills.forEach(s => {
        s.members.sort((a, b) => {
            const rankA = getRankPriority(a.member);
            const rankB = getRankPriority(b.member);
            
            if (rankA !== rankB) return rankA - rankB; // Rank priority
            return a.sortName.localeCompare(b.sortName); // Alphabetical fallback
        });
    });

    return {
        items: sortedSkills,
        meta: { filterDays: daysThreshold, generated: getGeneratedDate() }
    };
}

// 3. Planned Sessions
async function getPlannedSessions(userId, proxyUrl) {
    const { reportData, daysThreshold } = await getFreshData(userId, proxyUrl);
    const futureSessions = await db.getAllFutureTrainingSessions();
    const groupedByDate = {};

    futureSessions.sort((a, b) => new Date(a.date) - new Date(b.date));

    futureSessions.forEach(session => {
        if (!groupedByDate[session.date]) groupedByDate[session.date] = [];

        const relevantMembers = reportData
            .filter(item => item.skill === session.skill_name)
            .map(item => ({
                name: item.member,
                dueDate: item.dueDate,
                isCritical: item.isCritical
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        groupedByDate[session.date].push({
            skill: session.skill_name,
            members: relevantMembers
        });
    });

    return {
        items: Object.keys(groupedByDate).sort().map(d => ({ date: d, sessions: groupedByDate[d] })),
        meta: { filterDays: daysThreshold, generated: getGeneratedDate() }
    };
}

// 4. Critical Overdue
async function getCriticalOverdue(userId, proxyUrl, days) {
    const { reportData, daysThreshold } = await getFreshData(userId, proxyUrl, days);
    
    // Strict Filter: Critical AND Expired (date < today)
    const criticalItems = reportData.filter(item => item.isCritical && isExpired(item.dueDate));

    const grouped = {};
    criticalItems.forEach(item => {
        if (!grouped[item.member]) grouped[item.member] = { name: item.member, skills: [] };
        grouped[item.member].skills.push(item);
    });

    return {
        items: Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name)),
        meta: { generated: getGeneratedDate(), filterDays: daysThreshold }
    };
}

// 5. Compliance Matrix
async function getComplianceMatrix(userId, proxyUrl, days) {
    const dbMembers = await db.getMembers();
    const dbSkills = await db.getSkills();
    const scrapeData = await getOIData(config.url, config.scrapingInterval, proxyUrl);

    // Threshold Logic
    let daysThreshold = 30;
    if (days !== undefined && !isNaN(days)) {
        daysThreshold = days;
    } else {
        try { const pref = await db.getUserPreference(userId, 'daysToExpiry'); if (pref) daysThreshold = parseInt(pref); } catch(e){}
    }
    
    // Sort Members by Rank
    const activeMembers = dbMembers.filter(m => m.enabled).sort((a, b) => {
        const rankA = getRankPriority(a.name);
        const rankB = getRankPriority(b.name);
        if (rankA !== rankB) return rankA - rankB; 
        return a.name.localeCompare(b.name); 
    });

    const trackedSkills = dbSkills.filter(s => s.enabled).sort((a, b) => a.name.localeCompare(b.name));

    const matrix = activeMembers.map(member => {
        const memberRawSkills = scrapeData.filter(s => s.name === member.name);
        const skillStatuses = trackedSkills.map(skill => {
            const found = memberRawSkills.find(s => s.skill === skill.name);
            let status = 'missing'; 
            let date = '-';
            if (found) {
                date = found.dueDate;
                if (isExpired(date)) status = 'expired';
                else if (isExpiring(date, daysThreshold)) status = 'expiring'; 
                else status = 'ok';
            }
            return { id: skill.id, name: skill.name, status, date };
        });
        return { member: member.name, skills: skillStatuses };
    });

    return {
        headers: trackedSkills.map(s => s.name),
        rows: matrix,
        meta: { generated: getGeneratedDate(), threshold: daysThreshold }
    };
}

// 6. Verification History
async function getVerificationHistory(days = 30) {
    const database = await db.initDB();
    const rows = await database.all(`
        SELECT lf.*, m.name as member_name, s.name as skill_name 
        FROM live_forms lf
        LEFT JOIN members m ON lf.member_id = m.id
        LEFT JOIN skills s ON lf.skill_id = s.id
        WHERE lf.form_status IN ('accepted', 'rejected') 
        AND lf.form_reviewed_datetime >= datetime('now', '-' || ? || ' days')
        ORDER BY lf.form_reviewed_datetime DESC
    `, days);

    return { items: rows, meta: { generated: getGeneratedDate(), days: days } };
}

// 7. Training Attendance (Wrapper)
async function getTrainingAttendance(userId, proxyUrl) {
    return await getPlannedSessions(userId, proxyUrl); 
}

module.exports = {
    getGroupedByMember,
    getGroupedBySkill,
    getPlannedSessions,
    getCriticalOverdue,
    getComplianceMatrix,
    getVerificationHistory,
    getTrainingAttendance
};
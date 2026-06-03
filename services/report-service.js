// services/report-service.js
const extractionEngine = require('./extraction-engine');
const db = require('./db');
const config = require('../config');
const { isExpiring, isExpired } = require('./member-manager');

// Strips the rank prefix (e.g. "QFF") from a name so it can be sorted alphabetically by surname
function getNameWithoutRank(fullName) {
    if (!fullName) return "";
    const parts = fullName.split(' ');
    if (parts.length > 1) {
        return parts.slice(1).join(' ');
    }
    return fullName;
}

function getGeneratedDate() {
    return new Date().toLocaleDateString(config.locale || 'en-NZ', { 
        timeZone: config.timezone,
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
}

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
    if (n.startsWith('R')) return 9; // Recruit (must be checked after RFF)
    return 99; // Civilians / Others
}

async function getFreshData(userId, proxyUrl, daysOverride) {
    const dbMembers = await db.getMembers();
    const dbSkills = await db.getSkills();
    
    // Priority: explicit days param → saved user preference → hard-coded default (30)
    let daysThreshold = 30;
    if (daysOverride !== undefined && !isNaN(daysOverride)) {
        daysThreshold = daysOverride;
    } else {
        try {
            const pref = await db.getUserPreference(userId, 'daysToExpiry');
            if (pref) daysThreshold = parseInt(pref);
        } catch (e) {}
    }

    const scrapeData = await extractionEngine.extractData({ proxyUrl });
    const activeMembers = dbMembers.filter(m => m.enabled);
    const enabledSkills = dbSkills.filter(s => s.enabled);
    
    const reportData = [];

    activeMembers.forEach(member => {
        const memberSkills = scrapeData.filter(s => s.name === member.name);
        
        memberSkills.forEach(s => {
            const skillConfig = enabledSkills.find(dbS => dbS.name === s.skill);
            if (!skillConfig) return; 

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

async function getGroupedByMember(userId, proxyUrl, days) {
    const { reportData, daysThreshold } = await getFreshData(userId, proxyUrl, days);
    
    const grouped = {};
    reportData.forEach(item => {
        if (!grouped[item.member]) {
            grouped[item.member] = { name: item.member, sortName: item.sortName, skills: [] };
        }
        grouped[item.member].skills.push(item);
    });

    const sortedMembers = Object.values(grouped).sort((a, b) => {
        const rankA = getRankPriority(a.name);
        const rankB = getRankPriority(b.name);
        
        if (rankA !== rankB) return rankA - rankB; // Rank priority
        return a.sortName.localeCompare(b.sortName); // Alphabetical fallback
    });

    sortedMembers.forEach(m => {
        m.skills.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    });

    return {
        items: sortedMembers,
        meta: { filterDays: daysThreshold, generated: getGeneratedDate() }
    };
}

async function getGroupedBySkill(userId, proxyUrl, days) {
    const { reportData, daysThreshold } = await getFreshData(userId, proxyUrl, days);

    const grouped = {};
    reportData.forEach(item => {
        if (!grouped[item.skill]) {
            grouped[item.skill] = { name: item.skill, members: [] };
        }
        grouped[item.skill].members.push(item);
    });

    const sortedSkills = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));
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

async function getComplianceMatrix(userId, proxyUrl, days) {
    const dbMembers = await db.getMembers();
    const dbSkills = await db.getSkills();
    const scrapeData = await extractionEngine.extractData({ proxyUrl });

    // Priority: explicit days param → saved user preference → hard-coded default (30)
    let daysThreshold = 30;
    if (days !== undefined && !isNaN(days)) {
        daysThreshold = days;
    } else {
        try { const pref = await db.getUserPreference(userId, 'daysToExpiry'); if (pref) daysThreshold = parseInt(pref); } catch(e){}
    }
    
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

// Alias: training attendance uses the same grouped-by-date structure as planned sessions
async function getTrainingAttendance(userId, proxyUrl) {
    return await getPlannedSessions(userId, proxyUrl);
}

async function getSurveyParticipation() {
    const database = await db.initDB();
    const rows = await database.all(`
        SELECT
            sl.id,
            sl.name,
            sl.published_at,
            sl.is_archived,
            sl.is_anonymous,
            COUNT(st.id) as total_sent,
            SUM(CASE WHEN st.status = 'submitted' THEN 1 ELSE 0 END) as total_submitted
        FROM survey_live sl
        LEFT JOIN survey_tracking st ON sl.id = st.survey_live_id
        GROUP BY sl.id
        ORDER BY sl.published_at DESC
    `);
    return { items: rows, meta: { generated: getGeneratedDate() } };
}

async function getSurveyResponseLog(days = 30) {
    const database = await db.initDB();
    // Use survey_tracking (not survey_responses) so member identity is always available,
    // even for anonymous surveys where survey_responses.member_id is intentionally NULL.
    const rows = await database.all(`
        SELECT
            st.completed_at as submitted_at,
            sl.name as survey_name,
            sl.is_anonymous,
            m.name as member_name
        FROM survey_tracking st
        JOIN survey_live sl ON st.survey_live_id = sl.id
        JOIN members m ON st.member_id = m.id
        WHERE st.status = 'submitted'
        AND st.completed_at >= datetime('now', '-' || ? || ' days')
        ORDER BY st.completed_at DESC
    `, [days]);
    return { items: rows, meta: { generated: getGeneratedDate(), days } };
}

module.exports = {
    getGroupedByMember,
    getGroupedBySkill,
    getPlannedSessions,
    getCriticalOverdue,
    getComplianceMatrix,
    getVerificationHistory,
    getTrainingAttendance,
    getSurveyParticipation,
    getSurveyResponseLog
};
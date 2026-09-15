// services/report-service.js
const extractionEngine = require('./extraction-engine');
const db = require('./db');
const config = require('../config');
const { isExpiring, isExpired } = require('./member-manager');
const { getRankPriority, formatMemberName } = require('./rank-config');

function getGeneratedDate() {
    return new Date().toLocaleDateString(config.locale || 'en-NZ', {
        timeZone: config.timezone,
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

// Build display name from structured DB fields, falling back to raw name
function getMemberDisplayName(member) {
    return formatMemberName(member.rank, member.last_name, member.first_name, member.name);
}

// Sort key for alphabetical-by-surname ordering (last_name when available, else name-without-rank)
function getSortName(member) {
    if (member.last_name) return member.last_name.trim().toLowerCase();
    const parts = (member.name || '').split(' ');
    return (parts.length > 1 ? parts.slice(1).join(' ') : member.name || '').toLowerCase();
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
                    member: getMemberDisplayName(member),
                    sortName: getSortName(member),
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
        if (rankA !== rankB) return rankA - rankB;
        return a.sortName.localeCompare(b.sortName);
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
            if (rankA !== rankB) return rankA - rankB;
            return a.sortName.localeCompare(b.sortName);
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
        const rankA = getRankPriority(a.rank || a.name);
        const rankB = getRankPriority(b.rank || b.name);
        if (rankA !== rankB) return rankA - rankB;
        return getSortName(a).localeCompare(getSortName(b));
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
        return { member: getMemberDisplayName(member), skills: skillStatuses };
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
        SELECT lf.*, m.name as member_name,
               m.rank as member_rank, m.first_name as member_first_name, m.last_name as member_last_name,
               s.name as skill_name
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
            m.name as member_name,
            m.rank as member_rank, m.first_name as member_first_name, m.last_name as member_last_name
        FROM survey_tracking st
        JOIN survey_live sl ON st.survey_live_id = sl.id
        JOIN members m ON st.member_id = m.id
        WHERE st.status = 'submitted'
        AND st.completed_at >= datetime('now', '-' || ? || ' days')
        ORDER BY st.completed_at DESC
    `, [days]);
    return { items: rows, meta: { generated: getGeneratedDate(), days } };
}

// A question is "correct" when the submitted value matches correctAnswer —
// checkboxes compare as an unordered set, everything else as an exact value.
// submitted_data is a flat { questionId: value } map for both Score-based and
// Timed games (Timed live answers are flattened to this shape once the game
// finishes), so one comparison covers both.
function isAnswerCorrect(question, submitted) {
    if (submitted === undefined || submitted === null || submitted === '') return { answered: false, correct: false };
    if (Array.isArray(question.correctAnswer)) {
        const subArr = Array.isArray(submitted) ? submitted : [submitted];
        const correctArr = question.correctAnswer;
        const same = correctArr.length === subArr.length && correctArr.every((v) => subArr.includes(v));
        return { answered: true, correct: same };
    }
    return { answered: true, correct: submitted === question.correctAnswer };
}

async function getQuizPerformance(days = 90) {
    const database = await db.initDB();

    const games = await database.all(`SELECT id, name, game_type, enabled, questions FROM quiz_games ORDER BY name ASC`);

    const individualStats = await database.all(`
        SELECT qs.game_id as gameId,
               COUNT(DISTINCT qs.id) as sessions,
               COUNT(qp.id) as totalInvited,
               SUM(CASE WHEN qp.status = 'submitted' THEN 1 ELSE 0 END) as totalSubmitted,
               SUM(CASE WHEN qp.status = 'submitted' THEN qp.achieved_score ELSE 0 END) as scoreSum,
               SUM(CASE WHEN qp.status = 'submitted' THEN qp.max_score ELSE 0 END) as maxScoreSum,
               MAX(CASE WHEN qp.status = 'submitted' AND qp.max_score > 0 THEN qp.achieved_score * 100.0 / qp.max_score END) as bestPct,
               MIN(CASE WHEN qp.status = 'submitted' AND qp.max_score > 0 THEN qp.achieved_score * 100.0 / qp.max_score END) as worstPct
        FROM quiz_sessions qs
        LEFT JOIN quiz_players qp ON qp.session_id = qs.id
        WHERE qs.created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY qs.game_id
    `, [days]);

    const teamStats = await database.all(`
        SELECT qts.game_id as gameId,
               COUNT(DISTINCT qts.id) as sessions,
               COUNT(qt.id) as totalInvited,
               SUM(CASE WHEN qt.status = 'submitted' THEN 1 ELSE 0 END) as totalSubmitted,
               SUM(CASE WHEN qt.status = 'submitted' THEN qt.achieved_score ELSE 0 END) as scoreSum,
               SUM(CASE WHEN qt.status = 'submitted' THEN qt.max_score ELSE 0 END) as maxScoreSum,
               MAX(CASE WHEN qt.status = 'submitted' AND qt.max_score > 0 THEN qt.achieved_score * 100.0 / qt.max_score END) as bestPct,
               MIN(CASE WHEN qt.status = 'submitted' AND qt.max_score > 0 THEN qt.achieved_score * 100.0 / qt.max_score END) as worstPct
        FROM quiz_team_sessions qts
        LEFT JOIN quiz_teams qt ON qt.team_session_id = qts.id
        WHERE qts.created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY qts.game_id
    `, [days]);

    const individualSubmissions = await database.all(`
        SELECT qs.game_id as gameId, qp.submitted_data as submittedData
        FROM quiz_players qp
        JOIN quiz_sessions qs ON qp.session_id = qs.id
        WHERE qp.status = 'submitted' AND qs.created_at >= datetime('now', '-' || ? || ' days')
    `, [days]);

    const teamSubmissions = await database.all(`
        SELECT qts.game_id as gameId, qt.submitted_data as submittedData
        FROM quiz_teams qt
        JOIN quiz_team_sessions qts ON qt.team_session_id = qts.id
        WHERE qt.status = 'submitted' AND qts.created_at >= datetime('now', '-' || ? || ' days')
    `, [days]);

    const statsByGame = new Map();
    function ensureStats(gameId) {
        if (!statsByGame.has(gameId)) {
            statsByGame.set(gameId, {
                sessions: 0, totalInvited: 0, totalSubmitted: 0,
                scoreSum: 0, maxScoreSum: 0, bestPct: null, worstPct: null,
            });
        }
        return statsByGame.get(gameId);
    }
    for (const row of [...individualStats, ...teamStats]) {
        const s = ensureStats(row.gameId);
        s.sessions += row.sessions || 0;
        s.totalInvited += row.totalInvited || 0;
        s.totalSubmitted += row.totalSubmitted || 0;
        s.scoreSum += row.scoreSum || 0;
        s.maxScoreSum += row.maxScoreSum || 0;
        if (row.bestPct != null) s.bestPct = s.bestPct == null ? row.bestPct : Math.max(s.bestPct, row.bestPct);
        if (row.worstPct != null) s.worstPct = s.worstPct == null ? row.worstPct : Math.min(s.worstPct, row.worstPct);
    }

    const submissionsByGame = new Map();
    for (const row of [...individualSubmissions, ...teamSubmissions]) {
        if (!submissionsByGame.has(row.gameId)) submissionsByGame.set(row.gameId, []);
        let parsed;
        try { parsed = JSON.parse(row.submittedData || '{}'); } catch (e) { parsed = {}; }
        submissionsByGame.get(row.gameId).push(parsed);
    }

    const items = [];
    for (const game of games) {
        const stats = statsByGame.get(game.id);
        if (!stats || stats.sessions === 0) continue;

        let questions = [];
        try { questions = JSON.parse(game.questions || '[]'); } catch (e) { questions = []; }
        const submissions = submissionsByGame.get(game.id) || [];

        const questionStats = questions
            .filter((q) => q.type !== 'text_multi')
            .map((q) => {
                let answered = 0;
                let correct = 0;
                for (const submittedData of submissions) {
                    const { answered: wasAnswered, correct: wasCorrect } = isAnswerCorrect(q, submittedData[q.id]);
                    if (wasAnswered) {
                        answered += 1;
                        if (wasCorrect) correct += 1;
                    }
                }
                return { id: q.id, description: q.description, answered, correct };
            })
            .filter((q) => q.answered > 0);

        const worstQuestions = questionStats
            .map((q) => ({ ...q, correctRate: q.correct / q.answered }))
            .sort((a, b) => a.correctRate - b.correctRate)
            .slice(0, 3)
            .map((q) => ({
                description: q.description,
                correctCount: q.correct,
                answeredCount: q.answered,
                correctPct: Math.round(q.correctRate * 100),
            }));

        items.push({
            gameId: game.id,
            gameName: game.name,
            gameType: game.game_type,
            enabled: !!game.enabled,
            sessions: stats.sessions,
            totalInvited: stats.totalInvited,
            totalSubmitted: stats.totalSubmitted,
            totalPending: stats.totalInvited - stats.totalSubmitted,
            avgScorePct: stats.maxScoreSum > 0 ? Math.round((stats.scoreSum / stats.maxScoreSum) * 100) : null,
            bestScorePct: stats.bestPct != null ? Math.round(stats.bestPct) : null,
            worstScorePct: stats.worstPct != null ? Math.round(stats.worstPct) : null,
            worstQuestions,
        });
    }

    items.sort((a, b) => b.totalSubmitted - a.totalSubmitted);

    return { items, meta: { generated: getGeneratedDate(), days } };
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
    getSurveyResponseLog,
    getQuizPerformance,
};
// services/report-service.js
const { getOIData } = require("./scraper");
const db = require("./db");
const config = require("../config");
const { isExpiring, isExpired } = require("./member-manager");

// Helper: Strip rank (e.g. "QFF Skywalker" -> "Skywalker")
function getNameWithoutRank(fullName) {
  if (!fullName) return "";
  const parts = fullName.split(" ");
  if (parts.length > 1) {
    return parts.slice(1).join(" ");
  }
  return fullName;
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
    if (n.startsWith('R')) return 9; // Recruit
    return 99; // Civilians / Others
}
// Helper: Format "Generated" date consistently using App Locale
function getGeneratedDate() {
  return new Date().toLocaleDateString(config.locale || "en-NZ", {
    timeZone: config.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
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
    const pref = await db.getUserPreference(userId, "daysToExpiry");
    if (pref) {
      daysThreshold = parseInt(pref);
      console.log(
        `[ReportService] ⚙️ User Preference Loaded: Days to Expiry = ${daysThreshold}`,
      );
    } else {
      console.log(
        `[ReportService] ⚠️ No User Preference found. Using default: ${daysThreshold} days.`,
      );
    }
  } catch (e) {
    console.error("[ReportService] ❌ Error fetching preferences:", e.message);
  }

  // 2. Get Live/Cached Scrape Data
  console.log(
    `[ReportService] 📡 Fetching Scrape Data (Interval: ${config.scrapingInterval}m)...`,
  );
  // Pass the proxyUrl from the controller
  const scrapeData = await getOIData(
    config.url,
    config.scrapingInterval,
    proxyUrl,
  );

  if (!scrapeData || scrapeData.length === 0) {
    console.error(`[ReportService] 🛑 CRITICAL: Scraper returned 0 records.`);
    throw new Error("Scraper returned no data. Please check connection.");
  }
  console.log(
    `[ReportService] ✅ Scraper returned ${scrapeData.length} raw records.`,
  );

  // 3. Merge & Filter
  const activeMembers = dbMembers.filter((m) => m.enabled);
  const enabledSkills = dbSkills.filter((s) => s.enabled);

  console.log(
    `[ReportService] 🔍 Filtering against ${activeMembers.length} active members and ${enabledSkills.length} tracked skills.`,
  );

  const reportData = [];
  let matchCount = 0;

  activeMembers.forEach((member) => {
    const memberSkills = scrapeData.filter((s) => s.name === member.name);

    memberSkills.forEach((s) => {
      const skillConfig = enabledSkills.find((dbS) => dbS.name === s.skill);
      if (!skillConfig) return; // Skip untracked skills

      // Check expiry logic
      const isDue =
        isExpiring(s.dueDate, daysThreshold) || isExpired(s.dueDate);

      if (isDue) {
        matchCount++;
        reportData.push({
          member: member.name,
          sortName: getNameWithoutRank(member.name),
          skill: s.skill,
          dueDate: s.dueDate,
          isCritical: !!skillConfig.critical_skill,
        });
      }
    });
  });

  console.log(
    `[ReportService] 🏁 Report Generation Complete. Found ${matchCount} expiring items.`,
  );
  return { reportData, daysThreshold };
}

// Report: Group by Member
async function getGroupedByMember(userId, proxyUrl) {
  console.log(`[ReportService] Generating 'By Member' Report...`);
  const { reportData, daysThreshold } = await getFreshData(userId, proxyUrl);

  const grouped = {};
  reportData.forEach((item) => {
    if (!grouped[item.member]) {
      grouped[item.member] = {
        name: item.member,
        sortName: item.sortName,
        skills: [],
      };
    }
    grouped[item.member].skills.push(item);
  });

  const sortedMembers = Object.values(grouped).sort((a, b) =>
    a.sortName.localeCompare(b.sortName),
  );

  sortedMembers.forEach((m) => {
    m.skills.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  });

  return {
    items: sortedMembers,
    meta: {
      filterDays: daysThreshold,
      generated: getGeneratedDate(),
    },
  };
}

// Report: Group by Skill
async function getGroupedBySkill(userId, proxyUrl) {
  console.log(`[ReportService] Generating 'By Skill' Report...`);
  const { reportData, daysThreshold } = await getFreshData(userId, proxyUrl);

  const grouped = {};
  reportData.forEach((item) => {
    if (!grouped[item.skill]) {
      grouped[item.skill] = {
        name: item.skill,
        members: [],
      };
    }
    grouped[item.skill].members.push(item);
  });

  const sortedSkills = Object.values(grouped).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  sortedSkills.forEach((s) => {
    s.members.sort((a, b) => a.sortName.localeCompare(b.sortName));
  });

  return {
    items: sortedSkills,
    meta: {
      filterDays: daysThreshold,
      generated: getGeneratedDate(),
    },
  };
}
//  Report: Planned Sessions (Future Training + Members)
async function getPlannedSessions(userId, proxyUrl) {
  console.log(`[ReportService] Generating 'Planned Sessions' Report...`);

  // 1. Get Live Expiring Data (Members + Skills)
  const { reportData, daysThreshold } = await getFreshData(userId, proxyUrl);

  // 2. Get Future Training Sessions from DB
  const futureSessions = await db.getAllFutureTrainingSessions();

  // 3. Group Sessions by Date
  // Structure: { "2025-12-01": [ { skill: "Pumps", members: [] } ] }
  const groupedByDate = {};

  // Sort sessions by date just in case
  futureSessions.sort((a, b) => new Date(a.date) - new Date(b.date));

  futureSessions.forEach((session) => {
    const dateKey = session.date;
    if (!groupedByDate[dateKey]) {
      groupedByDate[dateKey] = [];
    }

    // Find members who need this specific skill
    // We filter the live 'reportData' for matches
    const relevantMembers = reportData
      .filter((item) => item.skill === session.skill_name)
      .map((item) => ({
        name: item.member,
        dueDate: item.dueDate,
        isCritical: item.isCritical,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    groupedByDate[dateKey].push({
      skill: session.skill_name,
      members: relevantMembers,
    });
  });

  // Convert object to array for easier rendering
  const sortedDates = Object.keys(groupedByDate).sort();
  const reportItems = sortedDates.map((date) => ({
    date: date,
    sessions: groupedByDate[date],
  }));

  return {
    items: reportItems,
    meta: {
      filterDays: daysThreshold,
      generated: getGeneratedDate(),
    },
  };
}

// CRITICAL SKILLS OVERDUE
async function getCriticalOverdue(userId, proxyUrl) {
  console.log(`[ReportService] Generating 'Critical Overdue' Report...`);
  const { reportData, daysThreshold } = await getFreshData(userId, proxyUrl);

  // Filter: Critical AND Expired (date < today)
  // Note: isExpired is imported from member-manager.js
  const criticalItems = reportData.filter(
    (item) => item.isCritical && isExpired(item.dueDate),
  );

  // Group by Member for cleaner display
  const grouped = {};
  criticalItems.forEach((item) => {
    if (!grouped[item.member]) {
      grouped[item.member] = { name: item.member, skills: [] };
    }
    grouped[item.member].skills.push(item);
  });

  return {
    items: Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name)),
    meta: { generated: getGeneratedDate() },
  };
}

// MEMBER COMPLIANCE MATRIX
async function getComplianceMatrix(userId, proxyUrl) {
    console.log(`[ReportService] Generating 'Compliance Matrix'...`);
    
    const dbMembers = await db.getMembers();
    const dbSkills = await db.getSkills();
    const scrapeData = await getOIData(config.url, config.scrapingInterval, proxyUrl);

    // [NEW] Fetch User Preference for Threshold (Default to 30 if not set)
    let daysThreshold = 30;
    try {
        const pref = await db.getUserPreference(userId, 'daysToExpiry');
        if (pref) daysThreshold = parseInt(pref);
        console.log(`[ReportService] Using threshold: ${daysThreshold} days`);
    } catch (e) { 
        console.error("Error fetching prefs:", e); 
    }
    
    // Sorting: Rank -> Name
    const activeMembers = dbMembers
        .filter(m => m.enabled)
        .sort((a, b) => {
            const rankA = getRankPriority(a.name);
            const rankB = getRankPriority(b.name);
            if (rankA !== rankB) return rankA - rankB; 
            return a.name.localeCompare(b.name); 
        });

    const trackedSkills = dbSkills
        .filter(s => s.enabled)
        .sort((a, b) => a.name.localeCompare(b.name));

    const matrix = activeMembers.map(member => {
        const memberRawSkills = scrapeData.filter(s => s.name === member.name);
        
        const skillStatuses = trackedSkills.map(skill => {
            const found = memberRawSkills.find(s => s.skill === skill.name);
            let status = 'missing'; 
            let date = '-';

            if (found) {
                date = found.dueDate;
                if (isExpired(date)) status = 'expired';
                // [UPDATED] Use dynamic threshold variable
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
        meta: { 
            generated: getGeneratedDate(),
            threshold: daysThreshold // [NEW] Pass threshold to frontend
        }
    };
}


// VERIFICATION HISTORY (30 Days)
async function getVerificationHistory() {
  console.log(`[ReportService] Generating 'Verification History' Report...`);
  const database = await db.initDB();

  // Fetch Accepted/Rejected from last 30 days
  const rows = await database.all(`
        SELECT lf.*, m.name as member_name, s.name as skill_name 
        FROM live_forms lf
        LEFT JOIN members m ON lf.member_id = m.id
        LEFT JOIN skills s ON lf.skill_id = s.id
        WHERE lf.form_status IN ('accepted', 'rejected') 
        AND lf.form_reviewed_datetime >= datetime('now', '-30 days')
        ORDER BY lf.form_reviewed_datetime DESC
    `);

  return {
    items: rows,
    meta: { generated: getGeneratedDate() },
  };
}

// TRAINING ATTENDANCE SHEET (Printable)
async function getTrainingAttendance(userId, proxyUrl) {
  // Reuse logic from Planned Sessions but format will differ in renderer
  const baseData = await getPlannedSessions(userId, proxyUrl);
  // We pass the same structure, the Renderer handles the visual difference (checkboxes/signatures)
  return baseData;
}

// Add new functions to exports
module.exports = {
  getGroupedByMember,
  getGroupedBySkill,
  getPlannedSessions,
  getCriticalOverdue,
  getComplianceMatrix,
  getVerificationHistory,
  getTrainingAttendance,
};

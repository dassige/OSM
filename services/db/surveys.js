const crypto = require("crypto");
const { initDB } = require("./connection");

async function createSurvey(name, introText, status, structureJson, createdBy, isAnonymous = 1) {
  const db = await initDB();
  const publicId = crypto.randomUUID();
  const result = await db.run(
    `INSERT INTO surveys (public_id, name, intro_text, status, structure, created_by, is_anonymous)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    publicId, name, introText, status || 0, structureJson, createdBy, isAnonymous,
  );
  return { id: result.lastID, publicId };
}

async function updateSurvey(id, name, introText, status, structureJson, isAnonymous = 1) {
  const db = await initDB();
  await db.run(
    `UPDATE surveys SET name = ?, intro_text = ?, status = ?, structure = ?, is_anonymous = ? WHERE id = ?`,
    name, introText, status || 0, structureJson, isAnonymous, id,
  );
  return true;
}

async function getAllSurveys() {
  const db = await initDB();
  return await db.all(
    "SELECT id, public_id, name, intro_text as intro, status, structure, is_anonymous, created_at FROM surveys ORDER BY created_at DESC",
  );
}

async function deleteSurvey(id) {
  const db = await initDB();
  await db.run("DELETE FROM surveys WHERE id = ?", id);
}

async function getSurveyById(id) {
  const db = await initDB();
  return await db.get(
    "SELECT id, public_id, name, intro_text as intro, status, structure, is_anonymous FROM surveys WHERE id = ?",
    id,
  );
}

async function getSurveyByPublicId(publicId) {
  const db = await initDB();
  return await db.get(
    "SELECT id, name, intro_text, structure, status, is_anonymous FROM surveys WHERE public_id = ? AND status = 1",
    publicId,
  );
}

async function publishSurvey(templateId, memberIds, publishedByUserId) {
  const db = await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    const template = await db.get("SELECT * FROM surveys WHERE id = ?", templateId);
    if (!template) throw new Error("Survey template not found.");

    const instanceName = `${template.name} - ${new Date().toISOString().split("T")[0]}`;
    const instanceResult = await db.run(
      `INSERT INTO survey_live (template_id, name, intro_text, structure, published_by, is_anonymous)
       VALUES (?, ?, ?, ?, ?, ?)`,
      template.id, instanceName, template.intro_text, template.structure, publishedByUserId, template.is_anonymous,
    );
    const liveInstanceId = instanceResult.lastID;

    const trackingData = [];
    const stmt = await db.prepare(
      "INSERT INTO survey_tracking (survey_live_id, member_id, access_code) VALUES (?, ?, ?)",
    );
    for (const memberId of memberIds) {
      const accessCode = crypto.randomUUID();
      await stmt.run(liveInstanceId, memberId, accessCode);
      trackingData.push({ memberId, accessCode });
    }
    await stmt.finalize();
    await db.exec("COMMIT");
    return { liveInstanceId, trackingData };
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function submitSurveyResponse(liveSurveyId, accessCode, submittedDataJson) {
  const db = await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    const trackingRecord = await db.get(
      "SELECT id, member_id, status FROM survey_tracking WHERE survey_live_id = ? AND access_code = ?",
      liveSurveyId, accessCode,
    );
    if (!trackingRecord) throw new Error("Invalid access code.");
    if (trackingRecord.status === "submitted") throw new Error("Survey already submitted.");

    const liveInstance = await db.get("SELECT is_anonymous FROM survey_live WHERE id = ?", liveSurveyId);
    const memberIdToLink = liveInstance.is_anonymous === 0 ? trackingRecord.member_id : null;

    await db.run(
      "UPDATE survey_tracking SET status = 'submitted', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
      trackingRecord.id,
    );
    await db.run(
      "INSERT INTO survey_responses (survey_live_id, member_id, submitted_data) VALUES (?, ?, ?)",
      liveSurveyId, memberIdToLink, submittedDataJson,
    );
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function getSurveyInstanceResults(liveSurveyId) {
  const db = await initDB();
  const instance = await db.get("SELECT * FROM survey_live WHERE id = ?", liveSurveyId);
  if (!instance) return null;

  const trackingStats = await db.get(
    `SELECT COUNT(*) as totalInvited,
            SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) as totalSubmitted
     FROM survey_tracking WHERE survey_live_id = ?`,
    liveSurveyId,
  );
  const responses = await db.all(
    "SELECT submitted_data, submitted_at FROM survey_responses WHERE survey_live_id = ?",
    liveSurveyId,
  );
  return { instance, trackingStats, responses };
}

async function getLiveSurveyInstances() {
  const db = await initDB();
  return await db.all(`
    SELECT
      sl.id, sl.name, sl.published_at, sl.is_archived, sl.is_anonymous,
      COUNT(st.id) as total_sent,
      SUM(CASE WHEN st.status = 'submitted' THEN 1 ELSE 0 END) as total_submitted
    FROM survey_live sl
    LEFT JOIN survey_tracking st ON sl.id = st.survey_live_id
    GROUP BY sl.id
    ORDER BY sl.published_at DESC
  `);
}

async function updateSurveyArchiveStatus(id, isArchived) {
  const db = await initDB();
  await db.run("UPDATE survey_live SET is_archived = ? WHERE id = ?", isArchived ? 1 : 0, id);
  return true;
}

async function deleteSurveyInstance(id) {
  const db = await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    await db.run("DELETE FROM survey_responses WHERE survey_live_id = ?", id);
    await db.run("DELETE FROM survey_tracking WHERE survey_live_id = ?", id);
    await db.run("DELETE FROM survey_live WHERE id = ?", id);
    await db.exec("COMMIT");
    return true;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function getSurveyTracking(liveId) {
  const db = await initDB();
  return await db.all(
    `SELECT
      st.id as tracking_id, st.access_code, st.status, st.completed_at,
      m.name as member_name, m.email
     FROM survey_tracking st
     JOIN members m ON st.member_id = m.id
     WHERE st.survey_live_id = ?
     ORDER BY m.name ASC`,
    liveId,
  );
}

async function getLiveSurveyInstanceById(id) {
  const db = await initDB();
  return await db.get("SELECT * FROM survey_live WHERE id = ?", id);
}

async function getTrackingRecordByAccessCode(accessCode) {
  const db = await initDB();
  return await db.get(
    "SELECT id, survey_live_id, status FROM survey_tracking WHERE access_code = ?",
    accessCode,
  );
}

async function getTrackingRecordWithMember(accessCode) {
  const db = await initDB();
  return await db.get(
    `SELECT st.id, st.survey_live_id, st.status, st.member_id, m.name as member_name
     FROM survey_tracking st
     JOIN members m ON st.member_id = m.id
     WHERE st.access_code = ?`,
    accessCode,
  );
}

async function importAllSurveys(surveysData, createdByUserId) {
  const db = await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    const stmt = await db.prepare(
      "INSERT INTO surveys (public_id, name, intro_text, status, structure, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const s of surveysData) {
      const structure = typeof s.structure === "object" ? JSON.stringify(s.structure) : s.structure;
      const newPublicId = crypto.randomUUID();
      await stmt.run(newPublicId, s.name, s.intro_text || s.intro || "", s.status || 0, structure, createdByUserId);
    }
    await stmt.finalize();
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function getSurveyResponses(liveSurveyId) {
  const db = await initDB();
  return await db.all(
    `SELECT sr.id, sr.submitted_data, sr.submitted_at, m.name as member_name
     FROM survey_responses sr
     LEFT JOIN members m ON sr.member_id = m.id
     WHERE sr.survey_live_id = ?
     ORDER BY sr.submitted_at DESC`,
    liveSurveyId,
  );
}

async function getSurveyResponseById(responseId) {
  const db = await initDB();
  return await db.get(
    `SELECT
      sr.submitted_data, sr.submitted_at,
      sl.name as survey_name, sl.structure, sl.intro_text,
      m.name as member_name
     FROM survey_responses sr
     JOIN survey_live sl ON sr.survey_live_id = sl.id
     LEFT JOIN members m ON sr.member_id = m.id
     WHERE sr.id = ?`,
    responseId,
  );
}

module.exports = {
  createSurvey,
  updateSurvey,
  getAllSurveys,
  deleteSurvey,
  getSurveyById,
  getSurveyByPublicId,
  publishSurvey,
  submitSurveyResponse,
  getSurveyInstanceResults,
  getLiveSurveyInstances,
  updateSurveyArchiveStatus,
  deleteSurveyInstance,
  getSurveyTracking,
  getLiveSurveyInstanceById,
  getTrackingRecordByAccessCode,
  getTrackingRecordWithMember,
  importAllSurveys,
  getSurveyResponses,
  getSurveyResponseById,
};

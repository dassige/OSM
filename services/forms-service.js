// services/forms-service.js
const db = require("./db");
const crypto = require("crypto");

async function getAllForms() {
  const database = await db.initDB();
  return await database.all(
    "SELECT id, public_id, name, status, created_at FROM forms ORDER BY name ASC"
  );
}

async function getAllFormsFull() {
  const database = await db.initDB();
  const forms = await database.all("SELECT * FROM forms ORDER BY name ASC");
  return forms.map((f) => {
    try {
      f.structure = JSON.parse(f.structure);
    } catch (e) {
      f.structure = [];
    }
    return f;
  });
}

async function importBulkForms(formsArray) {
  const database = await db.initDB();
  await database.exec("BEGIN TRANSACTION");
  try {
    await database.run("DELETE FROM forms");
    const stmt = await database.prepare(
      `INSERT INTO forms (public_id, name, status, intro, structure, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const f of formsArray) {
      const structureStr =
        typeof f.structure === "string"
          ? f.structure
          : JSON.stringify(f.structure || []);
      const pubId = f.public_id || crypto.randomUUID();
      const status = f.status !== undefined ? f.status : 0;
      const createdAt = f.created_at || new Date().toISOString();
      await stmt.run(
        pubId,
        f.name,
        status,
        f.intro || "",
        structureStr,
        createdAt
      );
    }
    await stmt.finalize();
    await database.exec("COMMIT");
    return true;
  } catch (e) {
    await database.exec("ROLLBACK");
    throw e;
  }
}

async function getFormByPublicId(publicId) {
  const database = await db.initDB();
  const form = await database.get(
    "SELECT * FROM forms WHERE public_id = ?",
    publicId
  );
  if (form) {
    try {
      form.structure = JSON.parse(form.structure);
    } catch (e) {
      form.structure = [];
    }
  }
  return form;
}

async function getFormById(id) {
  const database = await db.initDB();
  const form = await database.get("SELECT * FROM forms WHERE id = ?", id);
  if (form) {
    try {
      form.structure = JSON.parse(form.structure);
    } catch (e) {
      form.structure = [];
    }
  }
  return form;
}

async function createForm(name, status = 0, intro = "", structure = []) {
  const database = await db.initDB();
  const jsonStructure = JSON.stringify(structure);
  const publicId = crypto.randomUUID();
  const result = await database.run(
    `INSERT INTO forms (public_id, name, status, intro, structure) VALUES (?, ?, ?, ?, ?)`,
    publicId,
    name,
    status ? 1 : 0,
    intro,
    jsonStructure
  );
  return result.lastID;
}

async function updateForm(id, data) {
  const database = await db.initDB();
  const { name, status, intro, structure } = data;
  const updates = [];
  const params = [];
  if (name !== undefined) {
    updates.push("name = ?");
    params.push(name);
  }
  if (status !== undefined) {
    updates.push("status = ?");
    params.push(status ? 1 : 0);
  }
  if (intro !== undefined) {
    updates.push("intro = ?");
    params.push(intro);
  }
  if (structure !== undefined) {
    updates.push("structure = ?");
    params.push(JSON.stringify(structure));
  }
  if (updates.length === 0) return;
  params.push(id);
  await database.run(
    `UPDATE forms SET ${updates.join(", ")} WHERE id = ?`,
    params
  );
}

// [NEW] Get a list of skill names using this form
async function getFormUsage(id) {
  const database = await db.initDB();
  // First find the public_id associated with this internal ID
  const form = await database.get(
    "SELECT public_id FROM forms WHERE id = ?",
    id
  );
  if (!form) return [];

  const skills = await database.all(
    "SELECT name FROM skills WHERE url = ? AND url_type = 'internal'",
    form.public_id
  );
  return skills.map((s) => s.name);
}

// [UPDATED] Delete form and clean up skill references
async function deleteForm(id) {
  const database = await db.initDB();

  // Fetch public_id to identify references in the skills table
  const form = await database.get(
    "SELECT public_id FROM forms WHERE id = ?",
    id
  );
  if (!form) return;

  await database.exec("BEGIN TRANSACTION");
  try {
    // 1. Remove the reference from any skills using this form
    await database.run(
      "UPDATE skills SET url = '', url_type = 'external' WHERE url = ? AND url_type = 'internal'",
      form.public_id
    );

    // 2. Delete the form itself
    await database.run("DELETE FROM forms WHERE id = ?", id);

    await database.exec("COMMIT");
  } catch (e) {
    await database.exec("ROLLBACK");
    throw e;
  }
}
async function ensureLiveForm(
  memberId,
  skillId,
  skillExpiringDate,
  formPublicId
) {
  const database = await db.initDB();
  // [UPDATED] Check for 'sent'
  const existing = await database.get(
    `SELECT form_access_code FROM live_forms WHERE member_id = ? AND skill_id = ? AND form_status = 'sent'`,
    memberId,
    skillId
  );
  if (existing) {
    return existing.form_access_code;
  }

  const accessCode = crypto.randomUUID();
  // [UPDATED] Insert 'sent'
  await database.run(
    `INSERT INTO live_forms (skill_id, skill_expiring_date, member_id, skill_form_public_id, form_access_code, form_status) VALUES (?, ?, ?, ?, ?, 'sent')`,
    skillId,
    skillExpiringDate,
    memberId,
    formPublicId,
    accessCode
  );
  return accessCode;
}

//  Create a retry form based on a previous attempt
async function createRetryLiveForm(previousId) {
  const database = await db.initDB();
  const prev = await database.get(
    `SELECT * FROM live_forms WHERE id = ?`,
    previousId
  );
  if (!prev) throw new Error("Original form not found");

  const accessCode = crypto.randomUUID();
  const newTries = (prev.tries || 1) + 1;

  // [UPDATED] Insert 'sent'
  await database.run(
    `INSERT INTO live_forms (skill_id, skill_expiring_date, member_id, skill_form_public_id, form_access_code, form_status, tries) 
         VALUES (?, ?, ?, ?, ?, 'sent', ?)`,
    prev.skill_id,
    prev.skill_expiring_date,
    prev.member_id,
    prev.skill_form_public_id,
    accessCode,
    newTries
  );

  return accessCode;
}

// --- HELPER: Build WHERE clause for Live Forms ---
function buildLiveFormsWhere(filters) {
  let clauses = ["1=1"];
  let params = [];

  if (filters.memberId) {
    clauses.push("lf.member_id = ?");
    params.push(filters.memberId);
  }
  if (filters.skillId) {
    clauses.push("lf.skill_id = ?");
    params.push(filters.skillId);
  }
  if (filters.status) {
    clauses.push("lf.form_status = ?");
    params.push(filters.status);
  }

  // Date Range: Sent
  if (filters.sentStart) {
    clauses.push("lf.form_sent_datetime >= ?");
    params.push(filters.sentStart + " 00:00:00");
  }
  if (filters.sentEnd) {
    clauses.push("lf.form_sent_datetime <= ?");
    params.push(filters.sentEnd + " 23:59:59");
  }

  // Date Range: Submitted
  if (filters.subStart) {
    clauses.push("lf.form_submitted_datetime >= ?");
    params.push(filters.subStart + " 00:00:00");
  }
  if (filters.subEnd) {
    clauses.push("lf.form_submitted_datetime <= ?");
    params.push(filters.subEnd + " 23:59:59");
  }
  //  Tries Filter
  if (filters.tries) {
    clauses.push("lf.tries = ?");
    params.push(filters.tries);
  }
  return { where: clauses.join(" AND "), params };
}

//  Get Live Forms with Filters & Pagination
async function getLiveForms(filters = {}, pagination = null) {
  const database = await db.initDB();
  const { where, params } = buildLiveFormsWhere(filters);

  // 1. Get Count
  const countResult = await database.get(
    `SELECT COUNT(*) as total FROM live_forms lf WHERE ${where}`,
    params
  );
  const total = countResult.total;

  // 2. Get Data
  let query = `
        SELECT lf.*, m.name as member_name, s.name as skill_name 
        FROM live_forms lf 
        LEFT JOIN members m ON lf.member_id = m.id 
        LEFT JOIN skills s ON lf.skill_id = s.id 
        WHERE ${where}
        ORDER BY lf.form_sent_datetime DESC
    `;

  const dataParams = [...params];

  if (pagination && pagination.limit) {
    query += ` LIMIT ? OFFSET ?`;
    dataParams.push(pagination.limit, pagination.offset || 0);
  }

  const records = await database.all(query, dataParams);

  return { records, total };
}

// Purge Live Forms based on filters
async function purgeLiveForms(filters) {
  const database = await db.initDB();
  const { where, params } = buildLiveFormsWhere(filters);

  // Note: buildLiveFormsWhere prefixes columns with 'lf.'.
  // For DELETE, we need to be careful with aliases in SQLite.
  // However, since we filter on ID/Status/Date which exist on the main table,
  // we can strip the 'lf.' prefix for the DELETE query or use a subquery.
  // Subquery is safer to reuse logic.

  const deleteQuery = `DELETE FROM live_forms WHERE id IN (SELECT lf.id FROM live_forms lf WHERE ${where})`;
  const result = await database.run(deleteQuery, params);
  return result.changes;
}

// Update the status and set the reviewed timestamp
async function updateLiveFormStatus(id, status) {
  const database = await db.initDB();
  // Record current time for Accepted/Rejected, or clear it if moving back to Sent/Submitted
  const reviewedDate =
    status === "accepted" || status === "rejected"
      ? new Date().toISOString()
      : null;

  await database.run(
    `UPDATE live_forms SET form_status = ?, form_reviewed_datetime = ? WHERE id = ?`,
    status,
    reviewedDate,
    id
  );
}
//  Delete Live Form
async function deleteLiveForm(id) {
  const database = await db.initDB();
  await database.run(`DELETE FROM live_forms WHERE id = ?`, id);
}

//  Get Live Form Context by Access Code (Public Access)
async function getLiveFormByCode(code) {
  const database = await db.initDB();
  const result = await database.get(
    `
        SELECT lf.*, f.name as form_name, f.intro, f.structure, 
               m.name as member_name, m.email as member_email,
               s.name as skill_name
        FROM live_forms lf
        LEFT JOIN forms f ON lf.skill_form_public_id = f.public_id
        LEFT JOIN members m ON lf.member_id = m.id
        LEFT JOIN skills s ON lf.skill_id = s.id
        WHERE lf.form_access_code = ?
    `,
    code
  );

  if (result) {
    // Parse structure if it exists
    try {
      result.structure = JSON.parse(result.structure);
    } catch (e) {
      result.structure = [];
    }

    // Parse previously submitted data if it exists
    if (result.form_submitted_data) {
      try {
        result.form_submitted_data = JSON.parse(result.form_submitted_data);
      } catch (e) {}
    }
  }
  return result;
}

//  Submit Live Form
async function submitLiveForm(code, formData) {
  const database = await db.initDB();
  await database.run(
    `
        UPDATE live_forms 
        SET form_status = 'submitted', 
            form_submitted_datetime = CURRENT_TIMESTAMP,
            form_submitted_data = ?
        WHERE form_access_code = ?
    `,
    JSON.stringify(formData),
    code
  );
}
// Admin: Get specific submission details
async function getLiveFormSubmission(id) {
  const database = await db.initDB();
  const result = await database.get(
    `
        SELECT lf.*, f.name as form_name, f.intro, f.structure, 
               m.name as member_name, m.email as member_email, m.mobile as member_mobile, m.notificationPreference as member_prefs,
               s.name as skill_name
        FROM live_forms lf
        LEFT JOIN forms f ON lf.skill_form_public_id = f.public_id
        LEFT JOIN members m ON lf.member_id = m.id
        LEFT JOIN skills s ON lf.skill_id = s.id
        WHERE lf.id = ?
    `,
    id
  );

  if (result) {
    try {
      result.structure = JSON.parse(result.structure);
    } catch (e) {
      result.structure = [];
    }
    if (result.form_submitted_data) {
      try {
        result.form_submitted_data = JSON.parse(result.form_submitted_data);
      } catch (e) {}
    }
  }
  return result;
}
// Check if a form is currently in 'submitted' state
async function checkSubmittedStatus(memberId, skillId) {
  const database = await db.initDB();
  const record = await database.get(
    `SELECT id FROM live_forms WHERE member_id = ? AND skill_id = ? AND form_status = 'submitted'`,
    memberId,
    skillId
  );
  return !!record;
}
// Retrieve statuses including recently accepted forms
async function getAllActiveStatuses(visibilityDays) {
  const database = await db.initDB();
  return await database.all(
    `
        SELECT member_id, skill_id, form_status 
        FROM live_forms 
        WHERE form_status IN ('sent', 'submitted')
        OR (form_status = 'accepted' AND form_reviewed_datetime >= datetime('now', '-' || ? || ' days'))
    `,
    visibilityDays
  );
}

module.exports = {
  getAllForms,
  getAllFormsFull,
  importBulkForms,
  getFormById,
  getFormByPublicId,
  createForm,
  updateForm,
  deleteForm,
  ensureLiveForm,
  getLiveForms,
  purgeLiveForms,
  updateLiveFormStatus,
  deleteLiveForm,
  getLiveFormByCode,
  submitLiveForm,
  getLiveFormSubmission,
  createRetryLiveForm,
  checkSubmittedStatus,
  getAllActiveStatuses,
  getFormUsage,
};

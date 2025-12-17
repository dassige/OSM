// services/forms-service.js
const db = require('./db');
const crypto = require('crypto');

async function getAllForms() {
    const database = await db.initDB();
    return await database.all('SELECT id, public_id, name, status, created_at FROM forms ORDER BY name ASC');
}

async function getAllFormsFull() {
    const database = await db.initDB();
    const forms = await database.all('SELECT * FROM forms ORDER BY name ASC');
    return forms.map(f => {
        try { f.structure = JSON.parse(f.structure); } catch (e) { f.structure = []; }
        return f;
    });
}

async function importBulkForms(formsArray) {
    const database = await db.initDB();
    await database.exec('BEGIN TRANSACTION');
    try {
        await database.run('DELETE FROM forms');
        const stmt = await database.prepare(`INSERT INTO forms (public_id, name, status, intro, structure, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
        for (const f of formsArray) {
            const structureStr = typeof f.structure === 'string' ? f.structure : JSON.stringify(f.structure || []);
            const pubId = f.public_id || crypto.randomUUID();
            const status = f.status !== undefined ? f.status : 0;
            const createdAt = f.created_at || new Date().toISOString();
            await stmt.run(pubId, f.name, status, f.intro || '', structureStr, createdAt);
        }
        await stmt.finalize();
        await database.exec('COMMIT');
        return true;
    } catch (e) {
        await database.exec('ROLLBACK');
        throw e;
    }
}

async function getFormByPublicId(publicId) {
    const database = await db.initDB();
    const form = await database.get('SELECT * FROM forms WHERE public_id = ?', publicId);
    if (form) {
        try { form.structure = JSON.parse(form.structure); } catch (e) { form.structure = []; }
    }
    return form;
}

async function getFormById(id) {
    const database = await db.initDB();
    const form = await database.get('SELECT * FROM forms WHERE id = ?', id);
    if (form) {
        try { form.structure = JSON.parse(form.structure); } catch (e) { form.structure = []; }
    }
    return form;
}

async function createForm(name, status = 0, intro = '', structure = []) {
    const database = await db.initDB();
    const jsonStructure = JSON.stringify(structure);
    const publicId = crypto.randomUUID();
    const result = await database.run(
        `INSERT INTO forms (public_id, name, status, intro, structure) VALUES (?, ?, ?, ?, ?)`,
        publicId, name, status ? 1 : 0, intro, jsonStructure
    );
    return result.lastID;
}

async function updateForm(id, data) {
    const database = await db.initDB();
    const { name, status, intro, structure } = data;
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status ? 1 : 0); }
    if (intro !== undefined) { updates.push('intro = ?'); params.push(intro); }
    if (structure !== undefined) { updates.push('structure = ?'); params.push(JSON.stringify(structure)); }
    if (updates.length === 0) return;
    params.push(id);
    await database.run(`UPDATE forms SET ${updates.join(', ')} WHERE id = ?`, params);
}

async function deleteForm(id) {
    const database = await db.initDB();
    await database.run('DELETE FROM forms WHERE id = ?', id);
}

//  Check/Create Live Form Instance
async function ensureLiveForm(memberId, skillId, skillExpiringDate, formPublicId) {
    const database = await db.initDB();
    // 1. Check for existing OPEN form for this member/skill
    const existing = await database.get(
        `SELECT form_access_code FROM live_forms WHERE member_id = ? AND skill_id = ? AND form_status = 'open'`,
        memberId, skillId
    );
    if (existing) { return existing.form_access_code; }

    // 2. Create new record
    const accessCode = crypto.randomUUID();
    await database.run(
        `INSERT INTO live_forms (skill_id, skill_expiring_date, member_id, skill_form_public_id, form_access_code, form_status) VALUES (?, ?, ?, ?, ?, 'open')`,
        skillId, skillExpiringDate, memberId, formPublicId, accessCode
    );
    return accessCode;
}

//  Get Live Forms with Filters
async function getLiveForms(filters = {}) {
    const database = await db.initDB();

    let query = `
        SELECT lf.*, m.name as member_name, s.name as skill_name 
        FROM live_forms lf 
        LEFT JOIN members m ON lf.member_id = m.id 
        LEFT JOIN skills s ON lf.skill_id = s.id 
        WHERE 1=1
    `;

    const params = [];

    if (filters.memberId) {
        query += ` AND lf.member_id = ?`;
        params.push(filters.memberId);
    }
    if (filters.skillId) {
        query += ` AND lf.skill_id = ?`;
        params.push(filters.skillId);
    }
    if (filters.status) {
        query += ` AND lf.form_status = ?`;
        params.push(filters.status);
    }

    // Date Range: Sent
    if (filters.sentStart) {
        query += ` AND lf.form_sent_datetime >= ?`;
        params.push(filters.sentStart + ' 00:00:00');
    }
    if (filters.sentEnd) {
        query += ` AND lf.form_sent_datetime <= ?`;
        params.push(filters.sentEnd + ' 23:59:59');
    }

    // Date Range: Submitted
    if (filters.subStart) {
        query += ` AND lf.form_submitted_datetime >= ?`;
        params.push(filters.subStart + ' 00:00:00');
    }
    if (filters.subEnd) {
        query += ` AND lf.form_submitted_datetime <= ?`;
        params.push(filters.subEnd + ' 23:59:59');
    }

    query += ` ORDER BY lf.form_sent_datetime DESC`;

    return await database.all(query, params);
}

//  Update Live Form Status
async function updateLiveFormStatus(id, status) {
    const database = await db.initDB();
    await database.run(`UPDATE live_forms SET form_status = ? WHERE id = ?`, status, id);
}

//  Delete Live Form
async function deleteLiveForm(id) {
    const database = await db.initDB();
    await database.run(`DELETE FROM live_forms WHERE id = ?`, id);
}

//  Get Live Form Context by Access Code (Public Access)
async function getLiveFormByCode(code) {
    const database = await db.initDB();
    const result = await database.get(`
        SELECT lf.*, f.name as form_name, f.intro, f.structure, 
               m.name as member_name, m.email as member_email,
               s.name as skill_name
        FROM live_forms lf
        LEFT JOIN forms f ON lf.skill_form_public_id = f.public_id
        LEFT JOIN members m ON lf.member_id = m.id
        LEFT JOIN skills s ON lf.skill_id = s.id
        WHERE lf.form_access_code = ?
    `, code);

    if (result) {
        // Parse structure if it exists
        try { result.structure = JSON.parse(result.structure); } catch (e) { result.structure = []; }
        
        // Parse previously submitted data if it exists
        if (result.form_submitted_data) {
            try { result.form_submitted_data = JSON.parse(result.form_submitted_data); } catch (e) {}
        }
    }
    return result;
}

//  Submit Live Form
async function submitLiveForm(code, formData) {
    const database = await db.initDB();
    await database.run(`
        UPDATE live_forms 
        SET form_status = 'submitted', 
            form_submitted_datetime = CURRENT_TIMESTAMP,
            form_submitted_data = ?
        WHERE form_access_code = ?
    `, JSON.stringify(formData), code);
}
// Admin: Get specific submission details
async function getLiveFormSubmission(id) {
    const database = await db.initDB();
    const result = await database.get(`
        SELECT lf.*, f.name as form_name, f.intro, f.structure, 
               m.name as member_name, m.email as member_email,
               s.name as skill_name
        FROM live_forms lf
        LEFT JOIN forms f ON lf.skill_form_public_id = f.public_id
        LEFT JOIN members m ON lf.member_id = m.id
        LEFT JOIN skills s ON lf.skill_id = s.id
        WHERE lf.id = ?
    `, id);

    if (result) {
        try { result.structure = JSON.parse(result.structure); } catch (e) { result.structure = []; }
        // Parse the stored JSON answer data
        if (result.form_submitted_data) {
            try { result.form_submitted_data = JSON.parse(result.form_submitted_data); } catch (e) {}
        }
    }
    return result;
}

module.exports = {
    getAllForms, getAllFormsFull, importBulkForms, getFormById, getFormByPublicId, createForm, updateForm, deleteForm, ensureLiveForm,
    getLiveForms, updateLiveFormStatus, deleteLiveForm,
    getLiveFormByCode, submitLiveForm,
    getLiveFormSubmission 
};
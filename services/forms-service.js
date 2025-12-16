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

// [NEW] Check/Create Live Form Instance
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

module.exports = {
    getAllForms, getAllFormsFull, importBulkForms, getFormById, getFormByPublicId, createForm, updateForm, deleteForm, ensureLiveForm
};
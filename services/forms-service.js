// services/forms-service.js
const db = require('./db');
const crypto = require('crypto'); // Required for UUID generation

async function getAllForms() {
    const database = await db.initDB();
    // [UPDATED] Include public_id in the result
    return await database.all('SELECT id, public_id, name, status, created_at FROM forms ORDER BY name ASC');
}

// [NEW] Get Form by Public UUID
async function getFormByPublicId(publicId) {
    const database = await db.initDB();
    const form = await database.get('SELECT * FROM forms WHERE public_id = ?', publicId);
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
    // ... existing logic ...
    const database = await db.initDB();
    const form = await database.get('SELECT * FROM forms WHERE id = ?', id);
    if (form) {
        try {
            form.structure = JSON.parse(form.structure);
        } catch (e) {
            form.structure = [];
        }
    }
    return form;
}

async function createForm(name, status = 0, intro = '', structure = []) {
    const database = await db.initDB();
    const jsonStructure = JSON.stringify(structure);
    const publicId = crypto.randomUUID(); // Generate UUID
    
    const result = await database.run(
        `INSERT INTO forms (public_id, name, status, intro, structure) VALUES (?, ?, ?, ?, ?)`,
        publicId, name, status ? 1 : 0, intro, jsonStructure
    );
    return result.lastID;
}

async function updateForm(id, data) {
    const database = await db.initDB();
    const { name, status, intro, structure } = data;
    
    // Only update fields that are provided
    // Note: structure is expected to be a JS Object/Array here, we stringify it for DB
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

module.exports = {
    getAllForms,
    getFormById,
    getFormByPublicId,
    createForm,
    updateForm,
    deleteForm
};
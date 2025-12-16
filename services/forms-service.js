// services/forms-service.js
const db = require('./db');

async function getAllForms() {
    const database = await db.initDB();
    return await database.all('SELECT id, name, status, created_at FROM forms ORDER BY name ASC');
}

async function getFormById(id) {
    const database = await db.initDB();
    const form = await database.get('SELECT * FROM forms WHERE id = ?', id);
    if (form) {
        // Parse the JSON structure for the frontend
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
    
    const result = await database.run(
        `INSERT INTO forms (name, status, intro, structure) VALUES (?, ?, ?, ?)`,
        name, status ? 1 : 0, intro, jsonStructure
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
    createForm,
    updateForm,
    deleteForm
};
const { initDB } = require('./connection');
const crypto = require('crypto');

// ── Categories ────────────────────────────────────────────────────────────────

async function getKbCategories() {
    const db = await initDB();
    return db.all('SELECT * FROM knowledgebase_categories ORDER BY parent_id ASC, sort_order ASC, name ASC');
}

async function createKbCategory(name, parentId, sortOrder) {
    const db = await initDB();
    const result = await db.run(
        'INSERT INTO knowledgebase_categories (name, parent_id, sort_order) VALUES (?, ?, ?)',
        name, parentId || null, sortOrder || 0,
    );
    return result.lastID;
}

async function updateKbCategory(id, name, parentId, sortOrder) {
    const db = await initDB();
    await db.run(
        'UPDATE knowledgebase_categories SET name = ?, parent_id = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        name, parentId || null, sortOrder ?? 0, id,
    );
}

async function getKbCategoryById(id) {
    const db = await initDB();
    return db.get('SELECT * FROM knowledgebase_categories WHERE id = ?', id);
}

async function deleteKbCategory(id) {
    const db = await initDB();
    // Re-parent children to the deleted category's parent
    const cat = await db.get('SELECT parent_id FROM knowledgebase_categories WHERE id = ?', id);
    if (cat) {
        await db.run('UPDATE knowledgebase_categories SET parent_id = ? WHERE parent_id = ?', cat.parent_id, id);
    }
    await db.run('DELETE FROM knowledgebase_categories WHERE id = ?', id);
}

// ── Documents ─────────────────────────────────────────────────────────────────

async function getKbDocuments(categoryId) {
    const db = await initDB();
    if (categoryId !== undefined && categoryId !== null) {
        return db.all(
            `SELECT d.*, c.name AS category_name
               FROM knowledgebase_documents d
               LEFT JOIN knowledgebase_categories c ON c.id = d.category_id
              WHERE d.category_id = ?
              ORDER BY d.title ASC`,
            categoryId,
        );
    }
    return db.all(
        `SELECT d.*, c.name AS category_name
           FROM knowledgebase_documents d
           LEFT JOIN knowledgebase_categories c ON c.id = d.category_id
          ORDER BY d.title ASC`,
    );
}

async function getKbDocumentById(id) {
    const db = await initDB();
    return db.get(
        `SELECT d.*, c.name AS category_name
           FROM knowledgebase_documents d
           LEFT JOIN knowledgebase_categories c ON c.id = d.category_id
          WHERE d.id = ?`,
        id,
    );
}

async function getKbDocumentBySlug(slug) {
    const db = await initDB();
    return db.get(
        `SELECT d.*, c.name AS category_name
           FROM knowledgebase_documents d
           LEFT JOIN knowledgebase_categories c ON c.id = d.category_id
          WHERE d.slug = ?`,
        slug,
    );
}

async function createKbDocument(data) {
    const db = await initDB();
    const result = await db.run(
        `INSERT INTO knowledgebase_documents
           (slug, title, description, category_id, original_filename, file_size, mime_type, storage_type, storage_path, is_active, uploaded_by, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        data.slug,
        data.title,
        data.description || null,
        data.category_id || null,
        data.original_filename,
        data.file_size || 0,
        data.mime_type || 'application/pdf',
        data.storage_type,
        data.storage_path,
        data.uploaded_by || null,
        data.expires_at || null,
    );
    return result.lastID;
}

async function updateKbDocument(id, data) {
    const db = await initDB();
    await db.run(
        `UPDATE knowledgebase_documents
            SET title = ?, description = ?, category_id = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        data.title,
        data.description || null,
        data.category_id || null,
        data.expires_at || null,
        id,
    );
}

async function updateKbDocumentFile(id, fileData) {
    const db = await initDB();
    await db.run(
        `UPDATE knowledgebase_documents
            SET original_filename = ?, file_size = ?, mime_type = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        fileData.original_filename,
        fileData.file_size,
        fileData.mime_type,
        id,
    );
}

async function rotateKbDocumentSlug(id) {
    const db = await initDB();
    const newSlug = crypto.randomUUID().toUpperCase();
    await db.run(
        'UPDATE knowledgebase_documents SET slug = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        newSlug, id,
    );
    return newSlug;
}

async function toggleKbDocument(id) {
    const db = await initDB();
    await db.run(
        'UPDATE knowledgebase_documents SET is_active = 1 - is_active, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        id,
    );
}

async function deleteKbDocument(id) {
    const db = await initDB();
    await db.run('DELETE FROM knowledgebase_documents WHERE id = ?', id);
}

async function rotateAllKbSlugs() {
    const db = await initDB();
    const docs = await db.all('SELECT id FROM knowledgebase_documents');
    await db.exec('BEGIN TRANSACTION');
    try {
        for (const doc of docs) {
            const newSlug = crypto.randomUUID().toUpperCase();
            await db.run(
                'UPDATE knowledgebase_documents SET slug = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                newSlug, doc.id,
            );
        }
        await db.exec('COMMIT');
        return docs.length;
    } catch (e) {
        await db.exec('ROLLBACK');
        throw e;
    }
}

module.exports = {
    getKbCategories,
    createKbCategory,
    updateKbCategory,
    getKbCategoryById,
    deleteKbCategory,
    getKbDocuments,
    getKbDocumentById,
    getKbDocumentBySlug,
    createKbDocument,
    updateKbDocument,
    toggleKbDocument,
    deleteKbDocument,
    updateKbDocumentFile,
    rotateKbDocumentSlug,
    rotateAllKbSlugs,
};

// Storage abstraction for Knowledge Base documents.
// KB_STORAGE_TYPE controls the backend: local | s3 | gcs
// S3 and GCS SDKs are loaded dynamically so the server starts without them
// when KB_STORAGE_TYPE=local (the default).

const path = require('path');
const fs   = require('fs');
const config = require('../config');
const logger = require('./logger');

function getLocalDir() {
    return config.kbStorage && config.kbStorage.localPath
        ? config.kbStorage.localPath
        : path.join(__dirname, '../storage/knowledgebase');
}

function ensureLocalDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Local filesystem ──────────────────────────────────────────────────────────

async function uploadLocal(slug, ext, buffer) {
    const dir = getLocalDir();
    ensureLocalDir(dir);
    const filename = `${slug}${ext}`;
    fs.writeFileSync(path.join(dir, filename), buffer);
    return filename;
}

async function streamLocal(storagePath) {
    return fs.createReadStream(path.join(getLocalDir(), storagePath));
}

async function deleteLocal(storagePath) {
    const filePath = path.join(getLocalDir(), storagePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ── AWS S3 ───────────────────────────────────────────────────────────────────

function s3Client() {
    const { S3Client } = require('@aws-sdk/client-s3');
    const cfg = config.kbStorage.s3;
    const opts = {
        region: cfg.region,
        credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    };
    if (cfg.endpoint) opts.endpoint = cfg.endpoint;
    return new S3Client(opts);
}

async function uploadS3(slug, ext, buffer, mimeType) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const key = `knowledgebase/${slug}${ext}`;
    await s3Client().send(new PutObjectCommand({
        Bucket:      config.kbStorage.s3.bucket,
        Key:         key,
        Body:        buffer,
        ContentType: mimeType,
    }));
    return key;
}

async function streamS3(storagePath) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const response = await s3Client().send(new GetObjectCommand({
        Bucket: config.kbStorage.s3.bucket,
        Key:    storagePath,
    }));
    return response.Body; // web-streams Readable — pipe-compatible in Node 18+
}

async function deleteS3(storagePath) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client().send(new DeleteObjectCommand({
        Bucket: config.kbStorage.s3.bucket,
        Key:    storagePath,
    }));
}

// ── Google Cloud Storage ──────────────────────────────────────────────────────

function gcsBucket() {
    const { Storage } = require('@google-cloud/storage');
    const cfg = config.kbStorage.gcs;
    const opts = {};
    if (cfg.keyFilename) opts.keyFilename = cfg.keyFilename;
    return new Storage(opts).bucket(cfg.bucket);
}

async function uploadGCS(slug, ext, buffer, mimeType) {
    const key = `knowledgebase/${slug}${ext}`;
    await gcsBucket().file(key).save(buffer, { contentType: mimeType });
    return key;
}

async function streamGCS(storagePath) {
    return gcsBucket().file(storagePath).createReadStream();
}

async function deleteGCS(storagePath) {
    await gcsBucket().file(storagePath).delete({ ignoreNotFound: true });
}

// ── Public API ────────────────────────────────────────────────────────────────

async function upload(storageKey, originalFilename, buffer, mimeType) {
    const ext  = (path.extname(originalFilename) || '.pdf').toLowerCase();
    const type = (config.kbStorage && config.kbStorage.type) || 'local';
    let storagePath;

    if (type === 's3') {
        storagePath = await uploadS3(storageKey, ext, buffer, mimeType);
    } else if (type === 'gcs') {
        storagePath = await uploadGCS(storageKey, ext, buffer, mimeType);
    } else {
        storagePath = await uploadLocal(storageKey, ext, buffer);
    }

    logger.info('[KB Storage] File uploaded', { storageKey, type, storagePath, bytes: buffer.length });
    return { storageType: type, storagePath, fileSize: buffer.length };
}

async function getFileStream(storageType, storagePath) {
    if (storageType === 's3')  return streamS3(storagePath);
    if (storageType === 'gcs') return streamGCS(storagePath);
    return streamLocal(storagePath);
}

async function deleteFile(storageType, storagePath) {
    if (storageType === 's3')  return deleteS3(storagePath);
    if (storageType === 'gcs') return deleteGCS(storagePath);
    return deleteLocal(storagePath);
}

module.exports = { upload, getFileStream, deleteFile };

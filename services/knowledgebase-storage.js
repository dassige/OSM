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

async function fileExistsLocal(storagePath) {
    return fs.existsSync(path.join(getLocalDir(), storagePath));
}

// ── Shared bucket config parser ───────────────────────────────────────────────

// KB_S3_BUCKET and KB_GCS_BUCKET both support "bucketname/optional/prefix".
// The prefix, if present, is prepended to object keys at upload time so the
// full path is stored in the DB. Stream/delete operations use the stored
// storagePath directly and only need the clean bucket name.
function parseBucketConfig(raw) {
    const idx = (raw || '').indexOf('/');
    if (idx < 0) return { bucketName: raw || '', prefix: '' };
    return { bucketName: raw.slice(0, idx), prefix: raw.slice(idx + 1) };
}

function buildKey(prefix, objectPath) {
    return prefix ? `${prefix}/${objectPath}` : objectPath;
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
    const { bucketName, prefix } = parseBucketConfig(config.kbStorage.s3.bucket);
    const key = buildKey(prefix, `knowledgebase/${slug}${ext}`);
    await s3Client().send(new PutObjectCommand({
        Bucket:      bucketName,
        Key:         key,
        Body:        buffer,
        ContentType: mimeType,
    }));
    return key;
}

async function streamS3(storagePath) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const { bucketName } = parseBucketConfig(config.kbStorage.s3.bucket);
    const response = await s3Client().send(new GetObjectCommand({
        Bucket: bucketName,
        Key:    storagePath,
    }));
    return response.Body; // web-streams Readable — pipe-compatible in Node 18+
}

async function deleteS3(storagePath) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const { bucketName } = parseBucketConfig(config.kbStorage.s3.bucket);
    await s3Client().send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key:    storagePath,
    }));
}

async function fileExistsS3(storagePath) {
    try {
        const { HeadObjectCommand } = require('@aws-sdk/client-s3');
        const { bucketName } = parseBucketConfig(config.kbStorage.s3.bucket);
        await s3Client().send(new HeadObjectCommand({ Bucket: bucketName, Key: storagePath }));
        return true;
    } catch {
        return false;
    }
}

// ── Google Cloud Storage ──────────────────────────────────────────────────────

function gcsBucket() {
    const { Storage } = require('@google-cloud/storage');
    const cfg = config.kbStorage.gcs;
    const opts = {};
    if (cfg.keyFilename) opts.keyFilename = cfg.keyFilename;
    return new Storage(opts).bucket(parseBucketConfig(cfg.bucket).bucketName);
}

async function uploadGCS(slug, ext, buffer, mimeType) {
    const { prefix } = parseBucketConfig(config.kbStorage.gcs.bucket);
    const key = buildKey(prefix, `knowledgebase/${slug}${ext}`);
    await gcsBucket().file(key).save(buffer, { contentType: mimeType });
    return key;
}

async function streamGCS(storagePath) {
    return gcsBucket().file(storagePath).createReadStream();
}

async function deleteGCS(storagePath) {
    await gcsBucket().file(storagePath).delete({ ignoreNotFound: true });
}

async function fileExistsGCS(storagePath) {
    try {
        const [exists] = await gcsBucket().file(storagePath).exists();
        return exists;
    } catch {
        return false;
    }
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

async function fileExists(storageType, storagePath) {
    if (storageType === 's3')  return fileExistsS3(storagePath);
    if (storageType === 'gcs') return fileExistsGCS(storagePath);
    return fileExistsLocal(storagePath);
}

// Overwrites the file at an existing storage path with new content.
// Used when an admin replaces a document — the storage key and path stay the same.
async function replaceFile(storageType, storagePath, buffer, mimeType) {
    if (storageType === 's3') {
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const s3Cfg = config.kbStorage.s3;
        const client = new S3Client({
            region: s3Cfg.region,
            credentials: { accessKeyId: s3Cfg.accessKeyId, secretAccessKey: s3Cfg.secretAccessKey },
            ...(s3Cfg.endpoint ? { endpoint: s3Cfg.endpoint } : {}),
        });
        await client.send(new PutObjectCommand({ Bucket: parseBucketConfig(s3Cfg.bucket).bucketName, Key: storagePath, Body: buffer, ContentType: mimeType }));
    } else if (storageType === 'gcs') {
        const { Storage } = require('@google-cloud/storage');
        const gcsCfg = config.kbStorage.gcs;
        const storage = new Storage(gcsCfg.keyFilename ? { keyFilename: gcsCfg.keyFilename } : {});
        await storage.bucket(gcsParts().bucketName).file(storagePath).save(buffer, { contentType: mimeType });
    } else {
        const filePath = path.join(getLocalDir(), storagePath);
        fs.writeFileSync(filePath, buffer);
    }
    logger.info('[KB Storage] File replaced', { storagePath, storageType, bytes: buffer.length });
}

module.exports = { upload, getFileStream, deleteFile, replaceFile, fileExists };

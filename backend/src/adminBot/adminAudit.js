const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { db } = require('../firebase');

const auditFile = path.join(__dirname, '../../.data/admin-audit.json');

async function loadFileAudit() {
  try {
    return JSON.parse(await fs.readFile(auditFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Unable to read the admin audit log: ${error.message}`);
  }
}

async function writeFileAudit(entry) {
  const entries = await loadFileAudit();
  entries.unshift(entry);
  await fs.mkdir(path.dirname(auditFile), { recursive: true });
  const temporaryPath = `${auditFile}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(entries.slice(0, 1000), null, 2), 'utf8');
  await fs.rename(temporaryPath, auditFile);
}

async function logAdminEvent({ type, message, actorId, details = {} }) {
  const entry = {
    id: crypto.randomUUID(),
    type,
    message,
    actorId,
    details,
    createdAt: new Date().toISOString(),
  };
  if (db) {
    try {
      await db.collection('adminAudit').doc(entry.id).set(entry);
      return entry;
    } catch (error) {
      entry.details.auditFallbackReason = error.message;
    }
  }
  await writeFileAudit(entry);
  return entry;
}

async function listAdminEvents(limit = 100) {
  if (db) {
    try {
      const snapshot = await db.collection('adminAudit').orderBy('createdAt', 'desc').limit(limit).get();
      return snapshot.docs.map((document) => document.data());
    } catch (error) {
      console.warn(`Firestore audit history was unavailable; using the local audit log: ${error.message}`);
    }
  }
  return (await loadFileAudit()).slice(0, limit);
}

module.exports = { listAdminEvents, logAdminEvent };

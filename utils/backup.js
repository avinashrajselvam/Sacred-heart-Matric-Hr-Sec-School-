'use strict';
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'school.db');
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');

/**
 * Create a timestamped backup of the SQLite database.
 */
function backupDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('Database file not found:', DB_PATH);
    return null;
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(BACKUP_DIR, `school_backup_${timestamp}.db`);
  fs.copyFileSync(DB_PATH, backupPath);
  console.log('✅ Database backed up to:', backupPath);

  // Clean up old backups — keep last 10
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  files.slice(10).forEach(f => {
    fs.unlinkSync(path.join(BACKUP_DIR, f.name));
    console.log('🗑️  Deleted old backup:', f.name);
  });

  return backupPath;
}

module.exports = { backupDatabase };

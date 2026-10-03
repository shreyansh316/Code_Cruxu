#!/usr/bin/env node
/**
 * HEADROOM — scripts/check-sqlite.js
 *
 * Standalone script to verify better-sqlite3 native module compatibility.
 * Run with: node scripts/check-sqlite.js
 *
 * This script intentionally does NOT use TypeScript or the build pipeline.
 * It verifies the raw Node.js require() path for the native .node binary.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

console.log('HEADROOM — SQLite Native Compatibility Check');
console.log('Node version :', process.version);
console.log('Platform     :', process.platform, process.arch);
console.log('');

let Database;
try {
  Database = require('better-sqlite3');
  console.log('[OK] better-sqlite3 loaded');
} catch (err) {
  console.error('[FAIL] better-sqlite3 failed to load:', err.message);
  process.exit(1);
}

// In-memory test
try {
  const db = new Database(':memory:');
  const versionRow = db.prepare('SELECT sqlite_version() AS v').get();
  console.log('[OK] In-memory database opened. SQLite version:', versionRow.v);

  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
  db.prepare('INSERT INTO t (v) VALUES (?)').run('phase-002');
  const row = db.prepare('SELECT v FROM t').get();

  if (row.v !== 'phase-002') {
    throw new Error(`Unexpected value: ${row.v}`);
  }
  console.log('[OK] CREATE / INSERT / SELECT verified');

  db.close();
  console.log('[OK] Database closed');
} catch (err) {
  console.error('[FAIL] In-memory test failed:', err.message);
  process.exit(1);
}

// File-based temp test
const tmpPath = path.join(os.tmpdir(), `headroom-compat-${Date.now()}.db`);
try {
  const db = new Database(tmpPath);
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
  db.prepare('INSERT INTO t (v) VALUES (?)').run('file-test');
  const row = db.prepare('SELECT v FROM t').get();

  if (row.v !== 'file-test') {
    throw new Error(`Unexpected value: ${row.v}`);
  }
  db.close();
  fs.unlinkSync(tmpPath);
  console.log('[OK] File-based database verified and cleaned up');
} catch (err) {
  console.error('[FAIL] File-based test failed:', err.message);
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  process.exit(1);
}

console.log('');
console.log('SQLite compatibility: VERIFIED');
process.exit(0);

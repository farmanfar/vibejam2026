// Thin I/O helpers for writing balance-sim report files.
// No business logic here — all formatting belongs to the caller.

import { writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Create a timestamped report directory: `${root}/${ISO-ts}-${label}/`.
 * @param {string} root   e.g. 'reports/balance'
 * @param {string} label  e.g. 'full'
 * @returns {string} Absolute path to the created directory.
 */
export function makeReportDir(root, label) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', 'T').slice(0, 19);
  const dir = join(root, `${ts}-${label}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Write a string as a markdown file, creating parent directories as needed.
 * @param {string} path
 * @param {string} content
 */
export function writeMarkdown(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

/**
 * Write an array of row objects as a CSV file (RFC 4180).
 * @param {string}   path
 * @param {object[]} rows     Array of plain objects.
 * @param {string[]} columns  Column keys in order; used as the header row.
 */
export function writeCsv(path, rows, columns) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [columns.map(_csvCell).join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => _csvCell(row[col] ?? '')).join(','));
  }
  writeFileSync(path, lines.join('\r\n') + '\r\n', 'utf8');
}

/**
 * Append a single JSON object as one line to a .jsonl file.
 * Creates the file if it does not exist.
 * @param {string} path
 * @param {object} obj
 */
export function appendJsonl(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(obj) + '\n', 'utf8');
}

// ---------- internal ----------

function _csvCell(value) {
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

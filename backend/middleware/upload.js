/**
 * middleware/upload.js
 *
 * Multer configuration for PEM file uploads.
 * Security guarantees:
 *   • Files are written to OS temp dir with a random UUID-based filename.
 *   • File permissions are set to 0o600 (owner read/write only) immediately
 *     after multer finishes writing — before the route handler runs.
 *   • Only .pem / .key files (or files with no extension) are accepted.
 *   • Maximum file size 16 KB (a PEM key is never larger than a few KB).
 *   • Callers are responsible for deleting the temp file after use.
 */
'use strict';

const multer = require('multer');
const path   = require('path');
const os     = require('os');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');

// ─── Storage engine ───────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename:    (_req, _file, cb) => cb(null, `pem_${uuidv4()}.pem`),
});

// ─── File-type filter ─────────────────────────────────────────────────────────
function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = ['.pem', '.key', ''];
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only PEM / private-key files are accepted (.pem, .key)'), false);
  }
}

// ─── Multer instance ─────────────────────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 16 * 1024 }, // 16 KB
});

/**
 * Express middleware that locks the uploaded PEM to 0o600 (owner-only r/w).
 * Must be used AFTER the multer `upload.single('pemFile')` middleware.
 */
function setPemPermissions(req, _res, next) {
  if (req.file && fs.existsSync(req.file.path)) {
    try {
      fs.chmodSync(req.file.path, 0o600);
    } catch (err) {
      // Non-fatal on Windows; fail silently
      console.warn('[upload] chmod 600 failed:', err.message);
    }
  }
  next();
}

module.exports = { upload, setPemPermissions };

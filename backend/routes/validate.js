/**
 * routes/validate.js
 *
 * POST /api/validate-connection
 *   Accepts a multipart upload (IP + PEM file), attempts an SSH connection,
 *   runs `uname -a` to confirm shell access, then deletes the PEM.
 *   No data is persisted to the database.
 */
'use strict';

const express = require('express');
const { Client } = require('ssh2');
const fs = require('fs');
const { upload, setPemPermissions } = require('../middleware/upload');

const router = express.Router();

// ─── IPv4 validator (shared helper — also used in deploy route) ───────────────
function isValidIPv4(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = parseInt(p, 10);
    return n >= 0 && n <= 255;
  });
}

// ─── POST /api/validate-connection ───────────────────────────────────────────
router.post(
  '/validate-connection',
  upload.single('pemFile'),
  setPemPermissions,
  async (req, res) => {
    const { instanceIp, sshUser } = req.body;
    const pemFile = req.file;

    // ── Input validation ──────────────────────────────────────────────────────
    if (!pemFile) {
      return res.status(400).json({ success: false, error: 'PEM file is required.' });
    }
    if (!instanceIp || !isValidIPv4(instanceIp)) {
      fs.unlinkSync(pemFile.path);
      return res.status(400).json({ success: false, error: 'A valid IPv4 address is required.' });
    }

    // ── Attempt connection ────────────────────────────────────────────────────
    try {
      const result = await testConnection(instanceIp.trim(), (sshUser || 'ubuntu').trim(), pemFile.path);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    } finally {
      // Always clean up temp PEM regardless of outcome
      try { if (fs.existsSync(pemFile.path)) fs.unlinkSync(pemFile.path); } catch (_) {}
    }
  }
);

// ─── SSH connection tester ────────────────────────────────────────────────────
function testConnection(host, username, pemPath) {
  return new Promise(resolve => {
    const conn = new Client();
    let settled = false;

    const done = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { conn.end(); } catch (_) {}
      resolve(result);
    };

    const timer = setTimeout(() => {
      done({ success: false, error: 'Connection timed out after 20 seconds.' });
    }, 20_000);

    conn.on('ready', () => {
      conn.exec('echo "PIPELINE_OK" && uname -srm && uptime', (err, stream) => {
        if (err) return done({ success: false, error: err.message });

        let output = '';
        stream.on('data', chunk => { output += chunk.toString(); });
        stream.stderr.on('data', chunk => { output += chunk.toString(); });
        stream.on('close', () => {
          done({
            success: true,
            message: 'SSH connection successful.',
            serverInfo: output.trim(),
          });
        });
      });
    });

    conn.on('error', err => done({ success: false, error: `SSH Error: ${err.message}` }));

    let privateKey;
    try {
      privateKey = fs.readFileSync(pemPath);
    } catch (e) {
      return done({ success: false, error: `Cannot read PEM: ${e.message}` });
    }

    conn.connect({ host, port: 22, username, privateKey, readyTimeout: 20_000 });
  });
}

module.exports = { router, isValidIPv4 };

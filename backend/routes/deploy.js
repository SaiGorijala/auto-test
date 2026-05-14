/**
 * routes/deploy.js
 *
 * POST   /api/deploy                 — Enqueue a new deployment (rate-limited, multipart)
 * DELETE /api/deploy/:id/cancel      — Kill active SSH session + mark cancelled
 * GET    /api/deploy/:id/status      — Current phase, %, elapsed time
 * GET    /api/deploy/:id/logs        — Paginated log replay (?from=lastId)
 * GET    /api/deployments            — History list
 * GET    /api/deployments/:id        — Full deployment detail
 *
 * Security:
 *   • GitHub token is NEVER stored in the database — only a redacted hint.
 *   • PEM file is accepted only via multipart (multer), set to 0o600, and
 *     deleted by the job worker in its finally block.
 *   • Rate limit: 5 POST /api/deploy requests per minute per IP.
 *   • IPv4 is validated before any SSH attempt.
 */
'use strict';

const express   = require('express');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const fs        = require('fs');
const path      = require('path');
const { execSync } = require('child_process');

const db                     = require('../db');
const { deployQueue, cancelDeployment, resumeDeployment } = require('../queue');
const { upload, setPemPermissions }     = require('../middleware/upload');
const { isValidIPv4 }                   = require('./validate');

const router = express.Router();

// ─── Rate limiter: 5 deploys / minute / IP ────────────────────────────────────
const deployLimiter = rateLimit({
  windowMs:       60_000,
  max:            5,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: req => req.ip,
  message: { error: 'Rate limit exceeded: max 5 deployments per minute per IP.' },
});

// ─── Token redaction ──────────────────────────────────────────────────────────
function redactToken(token) {
  if (!token || token.length < 6) return '****';
  // Show first 4 chars (e.g. "ghp_") and mask the rest
  return `${token.slice(0, 4)}${'*'.repeat(Math.min(token.length - 4, 20))}`;
}

// ─── POST /api/deploy ─────────────────────────────────────────────────────────
router.post(
  '/deploy',
  deployLimiter,
  upload.single('pemFile'),
  setPemPermissions,
  async (req, res) => {
    const pemFile = req.file;

    const cleanup = () => {
      if (pemFile) try { fs.unlinkSync(pemFile.path); } catch (_) {}
    };

    try {
      const { instanceIp, repoUrl, githubUsername, githubToken, sshUser } = req.body;

      // ── Validate inputs ─────────────────────────────────────────────────────
      if (!pemFile) {
        return res.status(400).json({ error: 'PEM file is required (multipart upload).' });
      }
      if (!instanceIp || !isValidIPv4(instanceIp)) {
        cleanup();
        return res.status(400).json({ error: 'A valid IPv4 address is required for instanceIp.' });
      }
      if (!repoUrl || !/^https?:\/\/.+/.test(repoUrl)) {
        cleanup();
        return res.status(400).json({ error: 'A valid repository URL is required.' });
      }
      if (!githubUsername || !githubToken) {
        cleanup();
        return res.status(400).json({ error: 'GitHub username and token are required.' });
      }

      // ── Create deployment record ────────────────────────────────────────────
      const id        = uuidv4();
      const createdAt = new Date().toISOString();

      // Store only the redacted token hint — raw token never touches the DB
      const configSnapshot = JSON.stringify({
        instanceIp:      instanceIp.trim(),
        repoUrl:         repoUrl.trim(),
        githubUsername:  githubUsername.trim(),
        sshUser:         (sshUser || 'ubuntu').trim(),
        githubTokenHint: redactToken(githubToken),
      });

      db.prepare(`
        INSERT INTO deployments (id, created_at, instance_ip, repo_url, github_username, status, config_snapshot)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `).run(id, createdAt, instanceIp.trim(), repoUrl.trim(), githubUsername.trim(), configSnapshot);

      // ── Clone repository for local analysis (AI uses this for planning) ─────
      const reposDir = path.join(__dirname, '..', '..', '.ai-deployments');
      const repoPath = path.join(reposDir, id);
      
      if (!fs.existsSync(reposDir)) {
        fs.mkdirSync(reposDir, { recursive: true });
      }

      let cloneError = null;
      try {
        // Create authenticated URL for private repos
        const authedUrl = repoUrl.replace(
          /^https?:\/\//,
          `https://${githubUsername}:${githubToken}@`
        );

        execSync(`git clone --depth 1 "${authedUrl}" "${repoPath}"`, {
          stdio: 'pipe',
          timeout: 30000, // 30 seconds timeout
        });
      } catch (err) {
        cloneError = err;
        console.warn(`[deploy] Warning: Repository clone failed, AI analysis will be limited: ${err.message}`);
      }

      // ── Enqueue Bull job (AI will use cloned repo for analysis) ────────────
      // githubToken exists only in Bull's Redis job payload (in-memory pipeline),
      // never written to SQLite.
      try {
        await deployQueue.add(
          {
            deploymentId:  id,
            instanceIp:    instanceIp.trim(),
            repoUrl:       repoUrl.trim(),
            githubUsername: githubUsername.trim(),
            githubToken,          // ← in-memory only; deleted after job completes
            pemPath:       pemFile.path,
            sshUser:       (sshUser || 'ubuntu').trim(),
            repoPath:      fs.existsSync(repoPath) ? repoPath : null, // Pass cloned repo path to AI
          },
          { attempts: 1, removeOnComplete: false, removeOnFail: false }
        );
      } catch (err) {
        throw err;
      } finally {
        // Clean up repo clone on error (or it will be cleaned up after deployment)
        if (cloneError && fs.existsSync(repoPath)) {
          try { 
            execSync(`rm -rf "${repoPath}"`, { stdio: 'pipe' });
          } catch (_) {}
        }
      }

      res.status(202).json({ 
        deploymentId: id,
        repoCloned: !cloneError,
        repoCloneWarning: cloneError ? cloneError.message : null,
      });
    } catch (err) {
      cleanup();
      console.error('[deploy] Error enqueuing job:', err);
      res.status(500).json({ error: `Server error: ${err.message}` });
    }
  }
);

// ─── DELETE /api/deploy/:id/cancel ───────────────────────────────────────────
router.delete('/deploy/:id/cancel', (req, res) => {
  const { id } = req.params;

  const row = db.prepare('SELECT status FROM deployments WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Deployment not found.' });

  if (!['pending', 'in-progress'].includes(row.status)) {
    return res.status(409).json({ error: `Cannot cancel a deployment with status "${row.status}".` });
  }

  const killed = cancelDeployment(id);
  if (!killed) {
    // Job may be pending in the queue — mark cancelled directly
    db.prepare(
      "UPDATE deployments SET status='cancelled' WHERE id = ? AND status IN ('pending','in-progress')"
    ).run(id);
  }

  res.json({ message: 'Cancellation requested.', deploymentId: id });
});

// ─── POST /api/deploy/:id/resume ─────────────────────────────────────────────
router.post('/deploy/:id/resume', async (req, res) => {
  const { id } = req.params;

  try {
    const row = db.prepare('SELECT status, recovery_metadata FROM deployments WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Deployment not found.' });

    if (row.status !== 'failed') {
      return res.status(409).json({ error: `Cannot resume a deployment with status "${row.status}". Only failed deployments can be resumed.` });
    }

    if (!row.recovery_metadata) {
      return res.status(409).json({ error: 'Deployment has no recovery metadata. Cannot resume.' });
    }

    // Re-queue the deployment for retry
    await resumeDeployment(id);
    
    // Reset status to pending so it appears in active queue
    db.prepare("UPDATE deployments SET status='pending' WHERE id = ?").run(id);

    res.json({ 
      message: 'Deployment queued for resume.', 
      deploymentId: id,
      recovery: JSON.parse(row.recovery_metadata)
    });
  } catch (err) {
    console.error('[deploy] Error resuming deployment:', err);
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

// ─── GET /api/deploy/:id/status ──────────────────────────────────────────────
router.get('/deploy/:id/status', (req, res) => {
  const { id } = req.params;

  const row = db.prepare(
    'SELECT id, status, phase, phase_percent, created_at, duration_ms, jenkins_url, sonarqube_url, app_url, recovery_metadata, deployment_plan FROM deployments WHERE id = ?'
  ).get(id);

  if (!row) return res.status(404).json({ error: 'Deployment not found.' });

  const elapsedMs = row.duration_ms != null
    ? row.duration_ms
    : Date.now() - new Date(row.created_at).getTime();

  const recovery = row.recovery_metadata ? JSON.parse(row.recovery_metadata) : null;
  const deploymentPlan = row.deployment_plan ? JSON.parse(row.deployment_plan) : null;

  // Get AI reasoning entries
  const aiReasoning = db.prepare(`
    SELECT timestamp, title, content, reasoning_type
    FROM ai_reasoning
    WHERE deployment_id = ?
    ORDER BY timestamp DESC
    LIMIT 10
  `).all(id);

  res.json({
    id:           row.id,
    status:       row.status,
    phase:        row.phase        || 'Initializing',
    phasePercent: row.phase_percent ?? 0,
    elapsedMs,
    jenkinsUrl:   row.jenkins_url,
    sonarqubeUrl: row.sonarqube_url,
    appUrl:       row.app_url,
    recovery:     recovery,
    deploymentPlan: deploymentPlan ? {
      language: deploymentPlan.analysis?.language,
      framework: deploymentPlan.analysis?.framework,
      phases: deploymentPlan.deploymentSteps?.phases?.length,
    } : null,
    aiReasoning:  aiReasoning,
  });
});

// ─── GET /api/deploy/:id/logs?from=0&limit=500 ───────────────────────────────
router.get('/deploy/:id/logs', (req, res) => {
  const { id }   = req.params;
  const from     = Math.max(0, parseInt(req.query.from  || '0', 10));
  const limit    = Math.min(1000, Math.max(1, parseInt(req.query.limit || '500', 10)));

  const exists = db.prepare('SELECT 1 FROM deployments WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Deployment not found.' });

  const logs = db.prepare(
    'SELECT id, timestamp, level, message FROM logs WHERE deployment_id = ? AND id > ? ORDER BY id ASC LIMIT ?'
  ).all(id, from, limit);

  const lastId  = logs.length ? logs[logs.length - 1].id : from;
  const hasMore = logs.length === limit;

  res.json({ logs, lastId, hasMore });
});

// ─── GET /api/deployments ─────────────────────────────────────────────────────
router.get('/deployments', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, created_at, instance_ip, repo_url, github_username,
           status, duration_ms, jenkins_url, sonarqube_url, app_url,
           phase, phase_percent
    FROM   deployments
    ORDER  BY created_at DESC
    LIMIT  100
  `).all();

  res.json({ deployments: rows });
});

// ─── GET /api/deployments/:id ─────────────────────────────────────────────────
router.get('/deployments/:id', (req, res) => {
  const { id } = req.params;

  const row = db.prepare('SELECT * FROM deployments WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Deployment not found.' });

  // Parse stored config snapshot (never includes raw token)
  let config = null;
  if (row.config_snapshot) {
    try {
      config = JSON.parse(row.config_snapshot);
      // Belt-and-suspenders: ensure raw token is never returned
      delete config.githubToken;
    } catch (_) {}
  }

  const elapsedMs = row.duration_ms != null
    ? row.duration_ms
    : Date.now() - new Date(row.created_at).getTime();

  res.json({ ...row, config, elapsedMs, config_snapshot: undefined });
});

// ─── GET /api/deployments/:id/artifacts ──────────────────────────────────────
// Get AI-generated artifacts (Dockerfile, docker-compose, Jenkinsfile, etc.)
router.get('/deployments/:id/artifacts', (req, res) => {
  const { id } = req.params;

  const deployment = db.prepare('SELECT id FROM deployments WHERE id = ?').get(id);
  if (!deployment) return res.status(404).json({ error: 'Deployment not found.' });

  const artifacts = db.prepare(`
    SELECT artifact_type, content, created_at
    FROM deployment_artifacts
    WHERE deployment_id = ?
    ORDER BY created_at ASC
  `).all(id);

  if (artifacts.length === 0) {
    return res.json({ artifacts: {} });
  }

  const result = {};
  for (const artifact of artifacts) {
    result[artifact.artifact_type] = {
      content: artifact.content,
      createdAt: artifact.created_at,
    };
  }

  res.json({ artifacts: result });
});

// ─── GET /api/deployments/:id/ai-reasoning ──────────────────────────────────
// Get AI reasoning log for this deployment
router.get('/deployments/:id/ai-reasoning', (req, res) => {
  const { id } = req.params;

  const deployment = db.prepare('SELECT id FROM deployments WHERE id = ?').get(id);
  if (!deployment) return res.status(404).json({ error: 'Deployment not found.' });

  const reasoning = db.prepare(`
    SELECT timestamp, title, content, reasoning_type
    FROM ai_reasoning
    WHERE deployment_id = ?
    ORDER BY timestamp ASC
  `).all(id);

  res.json({ 
    deploymentId: id,
    reasoning: reasoning,
    totalEntries: reasoning.length,
  });
});

module.exports = router;

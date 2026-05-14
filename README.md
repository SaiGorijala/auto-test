# Pipeline Deployment Dashboard

A full-stack CI/CD deployment dashboard that provisions **Jenkins + SonarQube** on EC2 (or any Ubuntu VM) via SSH, with real-time log streaming, job queueing, and full deployment history.

```
Stack: Node.js · Express · Socket.IO · SSH2 · Bull · SQLite · React · Tailwind CSS
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React + Tailwind)                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ ConnectionTest│  │DeploymentForm│  │DepConsole    │  │
│  │  (SSH test)  │  │ (FormData)   │  │(Socket+REST) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
└─────────┼─────────────────┼─────────────────┼──────────┘
          │ multipart POST  │ multipart POST   │ WS + GET
          ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│  Express API  (Node.js)                                 │
│  ┌────────────────┐  ┌────────────────────────────────┐ │
│  │POST /validate- │  │POST /api/deploy (rate-limited) │ │
│  │  connection    │  │DELETE /api/deploy/:id/cancel   │ │
│  └────────┬───────┘  │GET  /api/deploy/:id/status     │ │
│           │ SSH2     │GET  /api/deploy/:id/logs       │ │
│           │ (test)   │GET  /api/deployments[/:id]     │ │
│           ▼          └──────────────┬─────────────────┘ │
│  ┌─────────────────┐                │                   │
│  │ Socket.IO       │◄───────────────┘                   │
│  │ room deploy:{id}│                                    │
│  └─────────────────┘                                    │
└───────────────────────────┬─────────────────────────────┘
                            │ Bull job
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Bull Worker  (same process)                            │
│  ┌────────────────────────────────────────────────────┐ │
│  │ SSH → exec deploy script → stream stdout/stderr   │ │
│  │   → persist to SQLite logs table                  │ │
│  │   → emit to Socket.IO room                        │ │
│  │   → detect phase → update deployments table       │ │
│  │   → delete PEM in finally {}                      │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
          ↑                           ↑
     Redis (Bull)               SQLite (better-sqlite3)
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js ≥ 18 | Both backend and frontend |
| Redis ≥ 6 | Required by Bull (`brew install redis` / `apt install redis-server`) |
| An SSH-accessible Ubuntu VM | EC2 with port 22 open |

---

## Quick Start

### 1. Clone & install

```bash
git clone <repo>
cd pipeline-dashboard

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure backend

```bash
cd backend
cp .env.example .env
# Edit .env — set FRONTEND_URL if not localhost:5173
```

### 3. Start Redis

```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis
```

### 4. Start backend

```bash
cd backend
npm run dev        # nodemon (dev)
# or
npm start          # production
```

### 5. Start frontend

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173**

---

## Security Model

### PEM Files
- Accepted **only** via `multipart/form-data` (never raw JSON body).
- Written to OS temp dir (`os.tmpdir()`) with a UUID-based filename.
- Permissions set to **`0o600`** (owner read/write only) immediately after upload via `fs.chmodSync`.
- Passed to the Bull job worker as a filesystem path.
- **Deleted in the `finally` block** of the job processor — guaranteed deletion even on crash/cancel.

### GitHub Tokens
- **Never stored in SQLite.** Only a redacted hint (`ghp_****`) is persisted in `config_snapshot`.
- Token lives only in:
  1. The multipart request body (HTTPS, in-flight).
  2. The Bull/Redis job payload (in-memory pipeline, deleted after job completes).
  3. The bash script string (in RAM, executed on the remote host, never written to disk on the server).
- The `GET /api/deployments/:id` endpoint strips `githubToken` from config before responding.

### Rate Limiting
- `POST /api/deploy` is limited to **5 requests per minute per IP** using `express-rate-limit`.

### IPv4 Validation
- Instance IP is validated against a strict IPv4 regex (all four octets 0–255) before any SSH attempt is made. Invalid IPs are rejected with HTTP 400.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/validate-connection` | Test SSH before deploying (multipart: `pemFile`, `instanceIp`, `sshUser`) |
| POST | `/api/deploy` | Enqueue deployment (multipart; rate-limited 5/min/IP) |
| DELETE | `/api/deploy/:id/cancel` | Kill active SSH session + mark cancelled |
| GET | `/api/deploy/:id/status` | Current phase, %, elapsed time |
| GET | `/api/deploy/:id/logs?from=0` | Paginated log replay for reconnects |
| GET | `/api/deployments` | History list (last 100) |
| GET | `/api/deployments/:id` | Full deployment detail |

---

## Database Schema

```sql
CREATE TABLE deployments (
  id               TEXT PRIMARY KEY,
  created_at       TEXT NOT NULL,
  instance_ip      TEXT NOT NULL,
  repo_url         TEXT NOT NULL,
  github_username  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending|in-progress|success|failed|cancelled
  duration_ms      INTEGER,
  jenkins_url      TEXT,
  sonarqube_url    TEXT,
  phase            TEXT    DEFAULT 'Initializing',
  phase_percent    INTEGER DEFAULT 0,
  config_snapshot  TEXT    -- JSON: ip, repo, username, sshUser, tokenHint (no raw token)
);

CREATE TABLE logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id  TEXT    NOT NULL REFERENCES deployments(id),
  timestamp      TEXT    NOT NULL,
  level          TEXT    NOT NULL DEFAULT 'info',  -- info|warning|error|success
  message        TEXT    NOT NULL
);
```

---

## Phase Map

Deployment progress is driven by log-line content matching, not a timer. Edit `PHASE_MAP` in `backend/queue.js` to add your own phases:

```js
{ keyword: 'Installing Docker',  phase: 'Installing Docker',  percent: 18 },
{ keyword: 'Jenkins ready',      phase: 'Jenkins ready',      percent: 70 },
// ...
```

---

## Frontend Features

| Feature | Detail |
|---|---|
| SSH Connection Tester | Step 1 widget — verifies SSH before the form unlocks |
| Deployment Form | Inline field validation, token masking, PEM reuse from tester |
| Real-time console | Color-coded log levels, auto-scroll toggle, line count |
| Log search / filter | Client-side, no extra API calls |
| Download logs | Saves all visible lines as `.txt` |
| Phase progress bar | Driven by server-detected phases, not timers |
| Cancel button | Visible while `in-progress`; kills SSH session server-side |
| Socket reconnect | Auto-reconnects; fetches missed logs via `GET /logs?from=lastId` |
| History page | Status badges, duration, timestamps, inline log viewer |
| Re-deploy button | Pre-fills form from stored config (token must be re-entered) |

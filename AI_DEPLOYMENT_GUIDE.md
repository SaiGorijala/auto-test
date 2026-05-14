# AI-Powered Deployment Platform - Ollama Integration Guide

This deployment dashboard has been transformed from a **hardcoded script-based system** into an **autonomous AI-powered deployment platform** using the Ollama HTTP API.

## 🚀 Overview

The system now uses Ollama to dynamically generate deployment plans instead of executing pre-written scripts. The AI agent analyzes repositories, generates Dockerfiles, docker-compose configurations, Jenkinsfiles, and deployment scripts automatically.

### Key Features

- **🤖 AI-Driven Orchestration**: Ollama analyzes repositories and generates deployment artifacts
- **🔐 Secure Command Validation**: All AI-generated commands are validated before execution
- **📊 Real-time AI Reasoning**: Watch the AI's decision-making process in real-time
- **📦 Artifact Storage**: Generated Dockerfiles, docker-compose, Jenkinsfiles stored for later use
- **🔄 Smart Deployment**: AI generates optimized deployment steps tailored to your tech stack
- **📈 Health Checks**: Automatic post-deployment validation
- **💾 Persistent Logging**: Complete deployment history with AI reasoning preserved

## Architecture

### New Modules

#### 1. **ollamaService.js**
Communicates with Ollama HTTP API at `http://127.0.0.1:11434`

```javascript
// Example usage
const { chat, analyzeRepository } = require('./ollamaService');

const plan = await analyzeRepository({
  language: 'javascript',
  framework: 'react',
  buildTool: 'npm',
}, (chunk) => console.log(chunk));
```

**Key Functions:**
- `chat()` - Send prompts to Ollama
- `analyzeRepository()` - Analyze repo structure
- `generateDockerfile()` - Generate production Dockerfile
- `generateDockerCompose()` - Generate docker-compose with Jenkins, SonarQube, Trivy
- `generateJenkinsfile()` - Generate CI/CD pipeline
- `generateDeploymentScript()` - Generate shell deployment script
- `generateDeploymentPlan()` - Generate structured deployment phases

#### 2. **commandValidator.js**
Security-focused validation for all AI-generated commands

```javascript
const { validateCommand, validateCommandBatch } = require('./commandValidator');

// Validate single command
const result = validateCommand('apt update && apt install -y docker.io');

// Batch validate
const results = validateCommandBatch(commands, { strict: false });
```

**Blocked Patterns:**
- `rm -rf /` and destructive file operations
- `mkfs`, `dd if=` (disk writes)
- `shutdown`, `reboot`, `poweroff`
- `sudo su`, privilege escalation
- Fork bombs and resource exhaustion
- Password/credential manipulation
- SSH key tampering

#### 3. **repoAnalyzer.js**
Analyzes repository structure for AI planning

```javascript
const { analyzeRepository } = require('./repoAnalyzer');

const analysis = analyzeRepository('/path/to/repo', (msg, percent) => {
  console.log(`${percent}% - ${msg}`);
});

// Returns:
{
  language: 'javascript',
  framework: 'react',
  buildTool: 'npm',
  ports: [3000, 8080],
  healthCheck: '/health',
  dependencies: [...],
  dockerFile: true,
  files: [...]
}
```

#### 4. **sshExecutor.js**
Executes validated commands remotely via SSH

```javascript
const { executeCommands } = require('./sshExecutor');

const results = await executeCommands(
  {
    host: '10.0.0.1',
    username: 'ubuntu',
    privateKey: pemBuffer,
  },
  ['apt update', 'apt install -y docker.io'],
  (output) => console.log(output.data),
  (phase) => console.log(`${phase.percent}% - ${phase.phase}`)
);
```

#### 5. **aiDeploymentPlanner.js**
Orchestrates the entire AI-driven deployment workflow

```javascript
const { generateDeploymentPlan, executeDeploymentPlan } = require('./aiDeploymentPlanner');

// Step 1: Generate plan
const plan = await generateDeploymentPlan({
  repoPath: '/tmp/repo',
  repoUrl: 'https://github.com/user/repo',
  onProgress: (status) => {},
  onAiReasoning: (reasoning) => {},
});

// Step 2: Execute plan
const results = await executeDeploymentPlan(plan, sshConfig);
```

### Database Schema

#### New Tables

```sql
-- AI reasoning logs
CREATE TABLE ai_reasoning (
  id              INTEGER PRIMARY KEY,
  deployment_id   TEXT NOT NULL,
  timestamp       TEXT NOT NULL,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  reasoning_type  TEXT DEFAULT 'analysis'
);

-- Generated artifacts
CREATE TABLE deployment_artifacts (
  id              INTEGER PRIMARY KEY,
  deployment_id   TEXT NOT NULL,
  artifact_type   TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
```

#### Enhanced Deployments Table

```sql
ALTER TABLE deployments ADD COLUMN deployment_plan TEXT;
ALTER TABLE deployments ADD COLUMN ai_reasoning_summary TEXT;
```

### API Endpoints

#### New Endpoints

```
GET /api/deployments/:id/artifacts
  Returns generated Dockerfile, docker-compose, Jenkinsfile, deployment script

GET /api/deployments/:id/ai-reasoning
  Returns AI reasoning log entries for the deployment
```

#### Enhanced Endpoints

```
GET /api/deploy/:id/status
  Now includes:
    - deploymentPlan: {language, framework, phases}
    - aiReasoning: [recent reasoning entries]
```

## Configuration

### Environment Variables

```env
# Ollama Configuration
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:3b
OLLAMA_TIMEOUT=120000

# Frontend
FRONTEND_URL=http://localhost:5173

# Database
DB_PATH=./pipeline.db

# Redis (Bull Queue)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Docker Hub (for image push)
DOCKER_USERNAME=
DOCKER_TOKEN=
```

### Ollama Setup

1. **Install Ollama**: https://ollama.ai
2. **Start service**: `ollama serve`
3. **Pull model**: `ollama pull qwen2.5-coder:3b`

Verify:
```bash
curl -X GET http://127.0.0.1:11434/api/tags
```

## Workflow

### 1. User Submits Deployment Request

- Instance IP
- Git repository URL
- Git credentials
- SSH PEM file

### 2. AI Analysis Phase

```
Repository Analysis
  ↓
Repository Cloning (local for analysis)
  ↓
Send to Ollama for Analysis
  ↓
Ollama Returns Deployment Plan JSON
```

### 3. Artifact Generation

```
Ollama Generates:
  • Dockerfile (production-ready)
  • docker-compose.yml (with Jenkins, SonarQube, Trivy)
  • Jenkinsfile (declarative pipeline)
  • Deployment Script (shell script with all steps)
```

### 4. Validation Phase

```
All AI-Generated Commands
  ↓
Validate Against Security Blocklist
  ↓
Reject Dangerous Patterns
  ↓
Approved Commands → Execution
```

### 5. Remote Execution

```
SSH Connection Established
  ↓
Execute Phases Sequentially
  ↓
Stream Logs in Real-time via Socket.IO
  ↓
Health Checks Post-Deployment
```

### 6. AI Reasoning Transparency

All AI decisions are logged:
- Repository analysis results
- Deployment plan generation
- Command validation decisions
- Execution results
- Error recovery suggestions

## Frontend Components

### AIReasoningPanel.jsx

New component for displaying AI reasoning and artifacts:

```jsx
import AIReasoningPanel from './components/AIReasoningPanel';

<AIReasoningPanel deploymentId={id} />
```

Features:
- 🤖 AI Reasoning Tab: View all AI decisions
- 📦 Artifacts Tab: View generated files
- 🔍 Syntax highlighting for code artifacts
- 📋 Expandable artifact viewer

### Socket.IO Events

New events emitted during deployment:

```javascript
// AI reasoning event
socket.on('ai_reasoning', (reasoning) => {
  // {title, content, type, timestamp}
});

// Standard events still work
socket.on('log', (entry) => {});
socket.on('phase', (status) => {});
socket.on('status', (update) => {});
```

## Security Considerations

### Command Validation

✅ **Always Validated Before Execution:**
- `apt update`, `apt install`
- `docker build`, `docker compose`
- `git clone`, `git pull`
- Safe piping operations

❌ **Always Blocked:**
- `rm -rf /`
- `mkfs` commands
- `shutdown`, `reboot`
- Raw `eval` operations
- Fork bombs
- Privilege escalation

### Token Management

- GitHub tokens **never** stored in database
- Tokens exist only in Bull job payload (Redis)
- Tokens automatically deleted after job completion
- Redacted in all logs

### SSH Security

- PEM files stored temporarily (0o600 permissions)
- Deleted after deployment (even on failure)
- Timeout: 30 seconds for connection
- SSH port: 22 (standard)

## Deployment Phases

The AI orchestrates deployments in these phases:

1. **Initializing** (2%) - Setup
2. **Analyzing Repository** (10%) - Local repo analysis
3. **Generating Deployment Plan** (25%) - Ollama AI planning
4. **Validating Commands** (40%) - Security validation
5. **Connecting to Server** (45%) - SSH connection
6. **Executing Deployment** (60%) - Run deployment commands
7. **Health Checks** (90%) - Post-deployment validation
8. **Complete** (100%) - Success

## Error Recovery

When deployment fails:

1. Error cause detected
2. Gemini AI analyzes failure (if configured)
3. Recovery metadata stored
4. User notified with suggested fix
5. Resume button available for manual retry

## Example Usage

### JavaScript Repository

```javascript
// Input
{
  instanceIp: "10.0.0.1",
  repoUrl: "https://github.com/user/react-app",
  githubUsername: "user",
  githubToken: "ghp_...",
  sshUser: "ubuntu"
}

// Ollama Analysis Result
{
  language: "javascript",
  framework: "react",
  buildTool: "npm",
  ports: [3000, 8080],
  dockerization: {
    baseImage: "node:18-alpine",
    workdir: "/app",
    entrypoint: "npm start"
  }
}

// Generated Artifacts
{
  dockerfile: "FROM node:18-alpine...",
  dockerCompose: "version: '3.8'...",
  jenkinsfile: "pipeline {...}",
  deploymentScript: "#!/bin/bash..."
}
```

### Python Repository

```javascript
// Input
{
  language: "python",
  framework: "fastapi",
  buildTool: "pip"
}

// Ollama Analysis
{
  buildTool: "pip",
  ports: [8000],
  dockerization: {
    baseImage: "python:3.11-slim",
    workdir: "/app",
    entrypoint: "uvicorn main:app --host 0.0.0.0"
  }
}
```

## Troubleshooting

### Ollama Not Responding

```bash
# Check if Ollama is running
curl http://127.0.0.1:11434/api/tags

# Start Ollama if needed
ollama serve

# Pull model
ollama pull qwen2.5-coder:3b
```

### Model Not Available

```bash
# List available models
ollama list

# Pull recommended model
ollama pull qwen2.5-coder:3b
```

### Command Validation Failing

Check the browser console logs:
- `[SECURITY] Command validation FAILED`
- Review the blocked command pattern
- Customize patterns in `commandValidator.js` if needed

### SSH Connection Timeout

- Verify instance IP is correct
- Check security group allows SSH (port 22)
- Verify PEM file permissions
- Check SSH user (usually `ubuntu`, `ec2-user`, or `admin`)

## Performance Considerations

- **Ollama Inference**: 30-120 seconds (depends on model)
- **Repository Cloning**: ~10 seconds (--depth 1)
- **Deployment Execution**: 5-15 minutes (depends on steps)
- **Database**: SQLite with WAL mode for concurrency

### Optimization Tips

- Use `qwen2.5-coder:3b` for speed (vs. 7b for accuracy)
- Increase `OLLAMA_TIMEOUT` for slow systems
- Monitor Redis for queue bottlenecks
- Clean up old deployments periodically

## Future Enhancements

- [ ] Multi-model support (GPT-4, Claude)
- [ ] Kubernetes deployment generation
- [ ] ArgoCD integration
- [ ] Custom deployment templates
- [ ] Cost estimation
- [ ] Performance benchmarking
- [ ] Deployment rollback automation

## License

MIT

## Support

For issues or questions:
1. Check Ollama logs: `ollama serve` output
2. Review backend logs: `npm run dev` terminal
3. Inspect Socket.IO connection in browser DevTools
4. Check Redis connection: `redis-cli ping`

---

**Built with Ollama 🦙 + Node.js ⚡ + React ⚛️**

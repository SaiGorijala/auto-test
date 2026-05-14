# Quick Start Guide - AI-Powered Deployment Platform

## Prerequisites

- Node.js 16+ and npm
- Ollama installed and running
- Redis (for Bull queue)
- Git
- A Linux/MacOS system or WSL2 on Windows

## 1. Install & Run Ollama

### macOS/Linux
```bash
# Download from https://ollama.ai
# Or use homebrew
brew install ollama

# Run Ollama service
ollama serve
```

### Docker
```bash
docker run -d -p 11434:11434 ollama/ollama
```

## 2. Pull Ollama Model

In a new terminal:
```bash
ollama pull qwen2.5-coder:3b
```

Verify it works:
```bash
curl http://127.0.0.1:11434/api/tags
```

## 3. Setup Project

```bash
cd pipeline-dashboard

# Backend setup
cd backend
npm install

# Update .env
cat > .env << 'EOF'
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:3b
OLLAMA_TIMEOUT=120000
FRONTEND_URL=http://localhost:5173
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
NODE_ENV=development
EOF

# Frontend setup
cd ../frontend
npm install
```

## 4. Start Redis

```bash
# Option 1: Docker
docker run -d -p 6379:6379 redis:alpine

# Option 2: Local installation
redis-server
```

## 5. Run the Application

### Terminal 1: Backend
```bash
cd backend
npm run dev
# Server running on http://localhost:3001
```

### Terminal 2: Frontend
```bash
cd frontend
npm run dev
# UI running on http://localhost:5173
```

### Terminal 3: Ollama (if not already running)
```bash
ollama serve
# Listening on http://127.0.0.1:11434
```

## 6. Test the System

### Check Ollama
```bash
curl http://127.0.0.1:11434/api/tags
# Should return list of models
```

### Check Backend
```bash
curl http://localhost:3001/api/deployments
# Should return empty array
```

### Open Frontend
```
http://localhost:5173
```

## 7. Make Your First Deployment

1. **Connection Test**
   - Enter EC2 instance IP (must be accessible via SSH)
   - Upload your PEM file
   - Click "Test SSH Connection"

2. **Deployment Form**
   - Enter Git repository URL
   - Enter GitHub username and token
   - Click "Deploy"

3. **Watch AI Orchestration**
   - See real-time logs
   - View AI reasoning in the "AI Orchestration" panel
   - Download logs or artifacts

## 8. Verify Deployment

Check deployment status:
```bash
curl http://localhost:3001/api/deployments
```

Get AI artifacts:
```bash
curl http://localhost:3001/api/deployments/{id}/artifacts
```

Get AI reasoning:
```bash
curl http://localhost:3001/api/deployments/{id}/ai-reasoning
```

## Troubleshooting

### Ollama not responding
```bash
# Check if Ollama is running
curl http://127.0.0.1:11434/api/tags

# If not, start it
ollama serve
```

### Model not found
```bash
# List available models
ollama list

# Pull the model
ollama pull qwen2.5-coder:3b
```

### Redis connection error
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# If not, start Redis
docker run -d -p 6379:6379 redis:alpine
```

### Backend won't start
```bash
# Check Node version
node --version
# Should be 16 or higher

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Frontend can't connect to backend
```bash
# Make sure .env has correct API URL
# frontend/.env or frontend/.env.local
VITE_API_URL=http://localhost:3001
```

## Environment Variables Reference

### Backend (.env)

```env
# Ollama Configuration
OLLAMA_URL=http://127.0.0.1:11434          # Ollama API endpoint
OLLAMA_MODEL=qwen2.5-coder:3b              # Model to use
OLLAMA_TIMEOUT=120000                       # Request timeout (ms)

# Frontend Configuration
FRONTEND_URL=http://localhost:5173         # Frontend URL for CORS

# Database Configuration
DB_PATH=./pipeline.db                       # SQLite database path

# Redis Configuration (Bull Queue)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Server Configuration
PORT=3001                                   # Backend port
NODE_ENV=development

# Docker Hub (optional)
DOCKER_USERNAME=                            # For image push
DOCKER_TOKEN=                               # Docker Hub access token
```

### Frontend (.env.local)

```env
VITE_API_URL=http://localhost:3001
```

## Docker Compose (All-in-One)

```yaml
version: '3.8'

services:
  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    environment:
      - OLLAMA_KEEP_ALIVE=24h
    volumes:
      - ollama-data:/root/.ollama

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      OLLAMA_URL: http://ollama:11434
      REDIS_HOST: redis
      NODE_ENV: development
    depends_on:
      - ollama
      - redis
    volumes:
      - ./backend:/app

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:3001
    volumes:
      - ./frontend:/app

volumes:
  ollama-data:
```

Run with Docker Compose:
```bash
docker-compose up -d
```

## Common Tasks

### View deployment logs
```bash
curl http://localhost:3001/api/deploy/{deployment-id}/logs
```

### Cancel a deployment
```bash
curl -X DELETE http://localhost:3001/api/deploy/{deployment-id}/cancel
```

### Resume a failed deployment
```bash
curl -X POST http://localhost:3001/api/deploy/{deployment-id}/resume
```

### Get deployment history
```bash
curl http://localhost:3001/api/deployments
```

### Check AI reasoning for a deployment
```bash
curl http://localhost:3001/api/deployments/{deployment-id}/ai-reasoning | jq
```

## Development Tips

### Enable Debug Logging
```bash
DEBUG=* npm run dev
```

### Test Repository Analysis
```javascript
// In backend/test.js
const { analyzeRepository } = require('./repoAnalyzer');
const result = analyzeRepository('/path/to/repo');
console.log(result);
```

### Test Command Validation
```javascript
// In backend/test.js
const { validateCommand } = require('./commandValidator');
const result = validateCommand('rm -rf /');
console.log(result); // Should be invalid
```

### Test Ollama Connection
```bash
# Simple chat test
curl -X POST http://127.0.0.1:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5-coder:3b",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": false
  }' | jq
```

## Performance Tuning

### For Slower Systems
```env
# Increase timeouts
OLLAMA_TIMEOUT=300000                       # 5 minutes

# Use lighter model
OLLAMA_MODEL=neural-chat                    # Smaller alternative
```

### For Faster Systems
```env
# Use larger model for better accuracy
OLLAMA_MODEL=qwen2.5-coder:7b

# Reduce timeouts
OLLAMA_TIMEOUT=60000                        # 1 minute
```

## Production Deployment

See `AI_DEPLOYMENT_GUIDE.md` for production considerations.

## Support

- Check logs: `npm run dev` console output
- Backend logs: `./pipeline.db` SQLite database
- Frontend logs: Browser DevTools Console
- Ollama logs: Ollama terminal output
- Redis logs: `redis-cli monitor`

## Next Steps

1. ✅ Run `ollama serve` in terminal
2. ✅ Pull the model: `ollama pull qwen2.5-coder:3b`
3. ✅ Start Redis: `docker run -d -p 6379:6379 redis:alpine`
4. ✅ Start backend: `cd backend && npm run dev`
5. ✅ Start frontend: `cd frontend && npm run dev`
6. ✅ Open `http://localhost:5173` in browser
7. ✅ Test connection with your EC2 instance
8. ✅ Make your first AI-powered deployment!

---

**Happy deploying! 🚀**

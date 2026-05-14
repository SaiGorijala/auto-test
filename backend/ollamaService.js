'use strict';

/**
 * ollamaService.js — Ollama HTTP API communication layer.
 *
 * Handles:
 * - Chat requests with streaming
 * - Model availability checks
 * - Prompt templating
 * - Error handling and retries
 *
 * Ollama API endpoints:
 * - POST /api/chat - Chat with streaming
 * - GET /api/tags - List available models
 * - HEAD /api/tags - Check if API is available
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b';
const OLLAMA_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT || '120000'); // 2 minutes

/**
 * Check if Ollama service is available
 */
async function isOllamaAvailable() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      timeout: 5000,
    });
    return response.ok;
  } catch (err) {
    console.error('Ollama health check failed:', err.message);
    return false;
  }
}

/**
 * Get list of available models
 */
async function getAvailableModels() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      timeout: 10000,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    return (data.models || []).map(m => m.name);
  } catch (err) {
    console.error('Failed to fetch available models:', err.message);
    return [];
  }
}

/**
 * Send a chat request to Ollama
 *
 * @param {string} prompt - The user prompt
 * @param {object} options - Configuration options
 * @param {string} options.model - Model name (default: qwen2.5-coder:3b)
 * @param {number} options.temperature - Temperature (0.0-2.0)
 * @param {number} options.topP - Top P sampling (0.0-1.0)
 * @param {number} options.topK - Top K sampling
 * @param {array} options.systemPrompt - System prompt lines
 * @param {function} options.onChunk - Callback for each streamed chunk
 * @param {number} options.timeout - Request timeout in ms
 *
 * @returns {Promise<string>} - Complete response text
 */
async function chat(prompt, options = {}) {
  const {
    model = DEFAULT_MODEL,
    temperature = 0.3,
    topP = 0.9,
    topK = 40,
    systemPrompt = [],
    onChunk = null,
    timeout = OLLAMA_TIMEOUT,
  } = options;

  const messages = [];

  // Add system prompt if provided
  if (systemPrompt.length > 0) {
    messages.push({
      role: 'system',
      content: Array.isArray(systemPrompt)
        ? systemPrompt.join('\n')
        : systemPrompt,
    });
  }

  // Add user message
  messages.push({
    role: 'user',
    content: prompt,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: {
          temperature,
          top_p: topP,
          top_k: topK,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}: ${response.statusText}`);
    }

    return await handleStreamingResponse(response, onChunk);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Ollama request timeout (${timeout}ms)`);
    }
    throw new Error(`Ollama API error: ${err.message}`);
  }
}

/**
 * Handle streaming response from Ollama
 *
 * @private
 */
async function handleStreamingResponse(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      
      // Process each line (Ollama returns JSONL)
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            const content = data.message.content;
            fullText += content;
            
            if (onChunk) {
              onChunk(content);
            }
          }
        } catch (parseErr) {
          // Ignore parse errors for partial JSON
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

/**
 * Send a repository analysis prompt to Ollama
 *
 * Used by repoAnalyzer to understand repository structure
 */
async function analyzeRepository(repoInfo, onChunk) {
  const systemPrompt = [
    'You are an expert DevOps engineer and CI/CD specialist.',
    'Analyze the provided repository structure and metadata.',
    'Return a structured JSON deployment plan.',
    'Be precise and security-conscious.',
    'Never suggest dangerous commands.',
  ];

  const prompt = `
Analyze this repository and generate a deployment plan:

${JSON.stringify(repoInfo, null, 2)}

Return ONLY valid JSON with this structure:
{
  "language": "detected language",
  "framework": "detected framework",
  "buildTool": "detected build tool",
  "ports": [list of ports to expose],
  "dependencies": "detected dependencies",
  "healthCheck": "health check endpoint or command",
  "environment": {"KEY": "default_value"},
  "steps": [
    {
      "name": "step name",
      "description": "what this does",
      "commands": ["command1", "command2"],
      "critical": true/false
    }
  ],
  "dockerization": {
    "baseImage": "recommended base image",
    "workdir": "/app",
    "entrypoint": "entry command"
  }
}
`;

  return chat(prompt, {
    systemPrompt,
    temperature: 0.2,
    topK: 30,
    onChunk,
  });
}

/**
 * Generate Dockerfile from analysis
 */
async function generateDockerfile(analysisJson, onChunk) {
  const systemPrompt = [
    'You are a Docker expert.',
    'Generate production-ready Dockerfiles.',
    'Include security best practices.',
    'Make images as small as possible.',
  ];

  const prompt = `
Generate a production-ready Dockerfile for this project:

${JSON.stringify(analysisJson, null, 2)}

Return ONLY the Dockerfile content (no markdown, no explanation).
`;

  return chat(prompt, {
    systemPrompt,
    temperature: 0.1,
    onChunk,
  });
}

/**
 * Generate docker-compose.yml from analysis
 */
async function generateDockerCompose(analysisJson, onChunk) {
  const systemPrompt = [
    'You are a Docker Compose expert.',
    'Generate production-ready docker-compose files.',
    'Include Jenkins, SonarQube, and Trivy services.',
    'Include persistent volumes.',
    'Use environment variables for secrets.',
  ];

  const prompt = `
Generate a docker-compose.yml for deploying this project with Jenkins, SonarQube, and Trivy:

${JSON.stringify(analysisJson, null, 2)}

Include:
- Application service (from Dockerfile)
- Jenkins CI/CD (persistent data, auto-restart)
- SonarQube analysis (persistent database)
- Trivy scanning container
- Redis cache
- PostgreSQL database (for SonarQube)

Return ONLY valid docker-compose YAML (no markdown, no explanation).
`;

  return chat(prompt, {
    systemPrompt,
    temperature: 0.1,
    onChunk,
  });
}

/**
 * Generate Jenkinsfile from analysis
 */
async function generateJenkinsfile(analysisJson, onChunk) {
  const systemPrompt = [
    'You are a Jenkins expert.',
    'Generate production-ready Jenkinsfiles.',
    'Include comprehensive CI/CD pipeline stages.',
    'Include SonarQube and Trivy integration.',
    'Include Docker image build and push.',
  ];

  const prompt = `
Generate a Jenkinsfile (declarative pipeline) for deploying this project:

${JSON.stringify(analysisJson, null, 2)}

Include pipeline stages:
1. Clone Repository
2. Install Dependencies
3. Run Tests
4. SonarQube Analysis
5. Trivy Security Scan
6. Build Docker Image
7. Push to Docker Hub (use credentials)
8. Deploy Container
9. Health Check

Return ONLY valid Jenkinsfile (Groovy syntax, no markdown, no explanation).
`;

  return chat(prompt, {
    systemPrompt,
    temperature: 0.1,
    onChunk,
  });
}

/**
 * Generate deployment shell script
 */
async function generateDeploymentScript(analysisJson, onChunk) {
  const systemPrompt = [
    'You are an expert bash shell scripter.',
    'Generate production-ready deployment scripts.',
    'Include error handling and logging.',
    'Make scripts idempotent (safe to run multiple times).',
    'Include health checks and validation.',
  ];

  const prompt = `
Generate a bash deployment script for this project:

${JSON.stringify(analysisJson, null, 2)}

Script should:
1. Update system packages
2. Install Docker if needed
3. Create required directories
4. Clone repository
5. Build application
6. Start application in Docker
7. Configure Jenkins and SonarQube
8. Perform health checks
9. Log all steps

Include error handling (set -e) and detailed logging.

Return ONLY the bash script (no markdown, no explanation).
Start with #!/bin/bash
`;

  return chat(prompt, {
    systemPrompt,
    temperature: 0.1,
    onChunk,
  });
}

/**
 * Generate deployment steps/plan
 */
async function generateDeploymentPlan(analysisJson, onChunk) {
  const systemPrompt = [
    'You are a deployment planning expert.',
    'Generate structured deployment plans.',
    'Consider dependencies and order.',
    'Include validation steps.',
  ];

  const prompt = `
Generate a detailed deployment plan for this project:

${JSON.stringify(analysisJson, null, 2)}

Return ONLY valid JSON with this structure:
{
  "phases": [
    {
      "phase": 1,
      "name": "phase name",
      "description": "what happens",
      "steps": [
        {
          "name": "step name",
          "command": "shell command",
          "timeout": 300,
          "critical": true,
          "validation": "validation command or check"
        }
      ]
    }
  ]
}
`;

  return chat(prompt, {
    systemPrompt,
    temperature: 0.2,
    onChunk,
  });
}

module.exports = {
  isOllamaAvailable,
  getAvailableModels,
  chat,
  analyzeRepository,
  generateDockerfile,
  generateDockerCompose,
  generateJenkinsfile,
  generateDeploymentScript,
  generateDeploymentPlan,
};

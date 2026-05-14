'use strict';

/**
 * aiDeploymentPlanner.js — AI-driven deployment orchestration.
 *
 * Orchestrates the full deployment workflow:
 * 1. Repository analysis
 * 2. AI-powered planning
 * 3. Dockerfile/docker-compose generation
 * 4. Deployment script generation
 * 5. Command validation
 * 6. Remote execution
 * 7. Health verification
 *
 * Coordinates between:
 * - ollamaService (AI generation)
 * - repoAnalyzer (repo analysis)
 * - commandValidator (security validation)
 * - sshExecutor (remote execution)
 */

const fs = require('fs');
const path = require('path');
const { analyzeRepository } = require('./repoAnalyzer');
const { 
  analyzeRepository: analyzeRepositoryWithOllama,
  generateDeploymentPlan,
  generateDockerfile,
  generateDockerCompose,
  generateJenkinsfile,
  generateDeploymentScript,
  isOllamaAvailable,
} = require('./ollamaService');
const { validateCommand, validateCommandBatch } = require('./commandValidator');
const { executeCommands } = require('./sshExecutor');

// ─── Helper types ───────────────────────────────────────────────────────────

class DeploymentPlan {
  constructor() {
    this.analysis = null;
    this.aiPlan = null;
    this.dockerfile = null;
    this.dockerCompose = null;
    this.jenkinsfile = null;
    this.deploymentScript = null;
    this.deploymentSteps = [];
    this.validatedCommands = [];
    this.artifacts = {};
  }

  toJSON() {
    return {
      analysis: this.analysis,
      aiPlan: this.aiPlan,
      dockerfile: this.dockerfile?.substring(0, 500),
      dockerCompose: this.dockerCompose?.substring(0, 500),
      jenkinsfile: this.jenkinsfile?.substring(0, 500),
      deploymentScript: this.deploymentScript?.substring(0, 500),
      deploymentSteps: this.deploymentSteps,
      artifacts: this.artifacts,
    };
  }
}

// ─── Planning function ──────────────────────────────────────────────────────

/**
 * Generate a complete AI-powered deployment plan
 *
 * @param {object} options - Configuration options
 * @param {string} options.repoPath - Local repository path (for initial analysis)
 * @param {string} options.repoUrl - Git repository URL
 * @param {object} options.sshConfig - SSH configuration
 * @param {function} options.onProgress - Progress callback
 * @param {function} options.onAiReasoning - AI reasoning callback
 *
 * @returns {Promise<DeploymentPlan>}
 */
async function generateDeploymentPlan_AI(options = {}) {
  const {
    repoPath,
    repoUrl,
    sshConfig,
    onProgress = null,
    onAiReasoning = null,
  } = options;

  const plan = new DeploymentPlan();

  const progress = (message, percent) => {
    if (onProgress) {
      onProgress({ message, percent, timestamp: new Date().toISOString() });
    }
    console.log(`[${percent}%] ${message}`);
  };

  const reasoning = (title, content) => {
    if (onAiReasoning) {
      onAiReasoning({
        title,
        content,
        timestamp: new Date().toISOString(),
      });
    }
    console.log(`[AI] ${title}:`, content.substring(0, 200));
  };

  try {
    // Step 1: Check Ollama availability
    progress('Checking Ollama service', 5);
    
    const ollamaAvailable = await isOllamaAvailable();
    if (!ollamaAvailable) {
      throw new Error('Ollama service is not available at http://127.0.0.1:11434');
    }

    reasoning('System Check', 'Ollama service is online and ready');

    // Step 2: Analyze repository
    progress('Analyzing repository structure', 10);

    if (repoPath && fs.existsSync(repoPath)) {
      plan.analysis = analyzeRepository(repoPath, (msg, pct) => {
        progress(`Analyzing: ${msg}`, 10 + (pct * 0.1));
      });
    } else {
      plan.analysis = {
        path: 'unknown',
        language: 'unknown',
        framework: 'unknown',
        buildTool: 'unknown',
        ports: [3000, 8080],
      };
    }

    reasoning('Repository Analysis', `Detected ${plan.analysis.language}/${plan.analysis.framework}`);

    // Step 3: AI-powered analysis
    progress('Sending repository metadata to Ollama', 20);

    const repoAnalysisPrompt = {
      language: plan.analysis.language,
      framework: plan.analysis.framework,
      buildTool: plan.analysis.buildTool,
      packageManager: plan.analysis.packageManager,
      ports: plan.analysis.ports,
      dockerfile: plan.analysis.dockerFile,
      composefile: plan.analysis.composefile,
      files: plan.analysis.files.slice(0, 50), // First 50 files only
    };

    let analysisResponse = '';

    plan.aiPlan = await analyzeRepositoryWithOllama(repoAnalysisPrompt, (chunk) => {
      analysisResponse += chunk;
      progress('Ollama analyzing repository...', 25);
    });

    // Try to parse AI response as JSON
    try {
      const parsedPlan = JSON.parse(plan.aiPlan);
      plan.aiPlan = parsedPlan;
      reasoning('AI Analysis Complete', JSON.stringify(parsedPlan).substring(0, 300));
    } catch (_) {
      reasoning('AI Analysis (Raw)', plan.aiPlan.substring(0, 300));
    }

    // Step 4: Generate Dockerfile
    progress('Generating Dockerfile', 35);

    plan.dockerfile = await generateDockerfile(plan.analysis, (chunk) => {
      progress('Generating Dockerfile...', 37);
    });

    reasoning('Dockerfile Generated', `${plan.dockerfile.split('\n').length} lines`);

    // Step 5: Generate docker-compose
    progress('Generating docker-compose.yml', 45);

    plan.dockerCompose = await generateDockerCompose(plan.analysis, (chunk) => {
      progress('Generating docker-compose...', 47);
    });

    reasoning('Docker Compose Generated', `${plan.dockerCompose.split('\n').length} lines`);

    // Step 6: Generate Jenkinsfile
    progress('Generating Jenkinsfile', 55);

    plan.jenkinsfile = await generateJenkinsfile(plan.analysis, (chunk) => {
      progress('Generating Jenkinsfile...', 57);
    });

    reasoning('Jenkinsfile Generated', `${plan.jenkinsfile.split('\n').length} lines`);

    // Step 7: Generate deployment script
    progress('Generating deployment script', 65);

    plan.deploymentScript = await generateDeploymentScript(plan.analysis, (chunk) => {
      progress('Generating deployment script...', 67);
    });

    reasoning('Deployment Script Generated', `${plan.deploymentScript.split('\n').length} lines`);

    // Step 8: Generate structured deployment plan
    progress('Generating structured deployment plan', 75);

    const deploymentPlanJson = await generateDeploymentPlan(plan.analysis, (chunk) => {
      progress('Generating deployment plan...', 77);
    });

    try {
      plan.deploymentSteps = JSON.parse(deploymentPlanJson);
      reasoning('Deployment Plan Generated', `${plan.deploymentSteps.phases?.length || 0} phases`);
    } catch (_) {
      reasoning('Deployment Plan (Raw)', deploymentPlanJson.substring(0, 200));
      plan.deploymentSteps = [];
    }

    // Step 9: Validate commands from deployment plan
    progress('Validating generated commands', 85);

    if (Array.isArray(plan.deploymentSteps.phases)) {
      const allCommands = [];

      for (const phase of plan.deploymentSteps.phases) {
        if (Array.isArray(phase.steps)) {
          for (const step of phase.steps) {
            if (Array.isArray(step.commands)) {
              allCommands.push(...step.commands);
            }
          }
        }
      }

      const validation = validateCommandBatch(allCommands, { strict: false });

      plan.validatedCommands = validation.valid;

      if (validation.invalid.length > 0) {
        reasoning(
          'Command Validation Warnings',
          `${validation.invalid.length} commands were rejected for security`
        );
      }
    }

    // Step 10: Store artifacts
    progress('Finalizing deployment plan', 95);

    plan.artifacts = {
      dockerfile: plan.dockerfile,
      dockerCompose: plan.dockerCompose,
      jenkinsfile: plan.jenkinsfile,
      deploymentScript: plan.deploymentScript,
    };

    progress('Deployment plan generated successfully', 100);

    return plan;
  } catch (err) {
    progress(`Error: ${err.message}`, 100);
    throw err;
  }
}

/**
 * Execute a deployment plan on a remote server
 *
 * @param {DeploymentPlan} plan - The generated deployment plan
 * @param {object} sshConfig - SSH configuration
 * @param {function} onOutput - Output callback
 * @param {function} onPhase - Phase callback
 *
 * @returns {Promise<object>} - Execution results
 */
async function executeDeploymentPlan(plan, sshConfig, onOutput = null, onPhase = null) {
  if (!plan || !plan.deploymentSteps) {
    throw new Error('Invalid deployment plan');
  }

  const results = {
    phases: [],
    startTime: new Date(),
    endTime: null,
    success: false,
    errors: [],
  };

  try {
    // Extract commands from phases
    const allCommands = [];

    for (const phase of plan.deploymentSteps.phases || []) {
      const phaseCommands = [];

      for (const step of phase.steps || []) {
        if (Array.isArray(step.commands)) {
          phaseCommands.push(...step.commands);
        }
      }

      if (phaseCommands.length > 0) {
        allCommands.push({
          phase: phase.name,
          commands: phaseCommands,
          critical: phase.critical !== false,
        });
      }
    }

    // Execute each phase
    for (const phaseGroup of allCommands) {
      if (onPhase) {
        onPhase({
          phase: phaseGroup.phase,
          percent: Math.round((phaseGroup.index || 0) / allCommands.length * 100),
        });
      }

      try {
        const phaseResults = await executeCommands(
          sshConfig,
          phaseGroup.commands,
          onOutput,
          onPhase
        );

        results.phases.push({
          name: phaseGroup.phase,
          commands: phaseGroup.commands,
          results: phaseResults,
          success: phaseResults.every(r => r.success),
        });

        // Check if this is critical and failed
        if (!phaseResults.every(r => r.success) && phaseGroup.critical) {
          const failedCmd = phaseResults.find(r => !r.success);
          throw new Error(`Critical phase failed: ${failedCmd.command}`);
        }
      } catch (err) {
        results.errors.push({
          phase: phaseGroup.phase,
          error: err.message,
        });

        if (phaseGroup.critical) {
          throw err;
        }
      }
    }

    results.success = results.errors.length === 0;
  } catch (err) {
    results.success = false;
    if (!results.errors.some(e => e.error === err.message)) {
      results.errors.push({
        phase: 'execution',
        error: err.message,
      });
    }
  }

  results.endTime = new Date();
  return results;
}

module.exports = {
  DeploymentPlan,
  generateDeploymentPlan: generateDeploymentPlan_AI,
  executeDeploymentPlan,
};

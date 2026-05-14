'use strict';

/**
 * sshExecutor.js — Remote command execution via SSH.
 *
 * Handles:
 * - SSH connection establishment
 * - Command execution with streaming
 * - Stdout/stderr separation
 * - Error handling and retries
 * - Command timeout management
 * - Session cleanup
 */

const { Client } = require('ssh2');

// ─── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 300000; // 5 minutes
const DEFAULT_RETRY_ATTEMPTS = 2;
const RETRY_DELAY = 3000; // 3 seconds

// ─── Session management ──────────────────────────────────────────────────────

class SSHSession {
  constructor(config) {
    this.config = {
      host: config.host,
      port: config.port || 22,
      username: config.username || 'ubuntu',
      privateKey: config.privateKey,
      readyTimeout: config.readyTimeout || 30000,
    };

    this.client = null;
    this.isConnected = false;
  }

  /**
   * Connect to SSH server
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.client = new Client();

      this.client.on('ready', () => {
        this.isConnected = true;
        resolve();
      });

      this.client.on('error', (err) => {
        reject(new Error(`SSH connection error: ${err.message}`));
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });

      try {
        this.client.connect(this.config);
      } catch (err) {
        reject(new Error(`SSH connection failed: ${err.message}`));
      }
    });
  }

  /**
   * Execute a single command
   *
   * @param {string} command - Shell command to execute
   * @param {function} onData - Callback for output chunks (stdout/stderr)
   * @param {function} onError - Callback for error lines (optional)
   * @param {number} timeout - Command timeout in ms
   *
   * @returns {Promise<{code, stdout, stderr, duration}>}
   */
  async execute(command, onData = null, onError = null, timeout = DEFAULT_TIMEOUT) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        return reject(new Error('SSH session not connected'));
      }

      let stdout = '';
      let stderr = '';
      const startTime = Date.now();
      let timedOut = false;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        if (this.client) {
          this.client.end();
        }
      }, timeout);

      try {
        this.client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeoutId);
            return reject(new Error(`Exec error: ${err.message}`));
          }

          stream.on('close', (code, signal) => {
            clearTimeout(timeoutId);
            const duration = Date.now() - startTime;

            if (timedOut) {
              return reject(new Error(`Command timeout (${timeout}ms)`));
            }

            resolve({
              code,
              signal,
              stdout,
              stderr,
              duration,
              success: code === 0,
            });
          });

          stream.on('data', (data) => {
            const chunk = data.toString('utf8');
            stdout += chunk;

            if (onData) {
              onData({
                type: 'stdout',
                data: chunk,
                timestamp: new Date().toISOString(),
              });
            }
          });

          stream.stderr.on('data', (data) => {
            const chunk = data.toString('utf8');
            stderr += chunk;

            if (onError) {
              onError({
                type: 'stderr',
                data: chunk,
                timestamp: new Date().toISOString(),
              });
            } else if (onData) {
              onData({
                type: 'stderr',
                data: chunk,
                timestamp: new Date().toISOString(),
              });
            }
          });
        });
      } catch (err) {
        clearTimeout(timeoutId);
        reject(new Error(`SSH execution error: ${err.message}`));
      }
    });
  }

  /**
   * Execute a command with retries
   */
  async executeWithRetry(command, attempts = DEFAULT_RETRY_ATTEMPTS, onData = null, timeout = DEFAULT_TIMEOUT) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        if (onData) {
          onData({
            type: 'info',
            data: `[Attempt ${attempt}/${attempts}] Executing: ${command}`,
          });
        }

        const result = await this.execute(command, onData, null, timeout);

        if (result.success) {
          return result;
        }

        // Non-zero exit code, but we try retry if configured
        lastError = new Error(`Command failed with exit code ${result.code}`);

        if (onData) {
          onData({
            type: 'warning',
            data: `Command failed: ${result.stderr || result.stdout}`,
          });
        }

        if (attempt < attempts) {
          if (onData) {
            onData({
              type: 'info',
              data: `Retrying in ${RETRY_DELAY}ms...`,
            });
          }

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));

          // Reconnect if needed
          if (!this.isConnected) {
            await this.connect();
          }
        }
      } catch (err) {
        lastError = err;

        if (onData) {
          onData({
            type: 'error',
            data: `Attempt ${attempt} failed: ${err.message}`,
          });
        }

        if (attempt < attempts && !this.isConnected) {
          try {
            await this.connect();
          } catch (connectErr) {
            if (onData) {
              onData({
                type: 'error',
                data: `Failed to reconnect: ${connectErr.message}`,
              });
            }
          }
        }
      }
    }

    throw lastError || new Error('Command execution failed');
  }

  /**
   * Close SSH session
   */
  async close() {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.end();
      }
      this.isConnected = false;
      resolve();
    });
  }
}

/**
 * Execute commands on a remote server via SSH
 *
 * @param {object} sshConfig - SSH connection configuration
 * @param {string} sshConfig.host - Server hostname/IP
 * @param {number} sshConfig.port - SSH port (default 22)
 * @param {string} sshConfig.username - SSH username
 * @param {Buffer|string} sshConfig.privateKey - PEM private key
 * @param {array} commands - Array of commands to execute sequentially
 * @param {function} onData - Callback for each output chunk
 * @param {function} onPhase - Callback for phase updates (optional)
 * @param {number} timeout - Individual command timeout
 *
 * @returns {Promise<array>} - Array of execution results
 */
async function executeCommands(sshConfig, commands, onData = null, onPhase = null, timeout = DEFAULT_TIMEOUT) {
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error('Commands must be a non-empty array');
  }

  const session = new SSHSession(sshConfig);
  const results = [];

  try {
    // Connect
    if (onPhase) {
      onPhase({ phase: 'Connecting to SSH', percent: 5 });
    }

    await session.connect();

    if (onData) {
      onData({
        type: 'success',
        data: `Connected to ${sshConfig.host}:${sshConfig.port}`,
      });
    }

    // Execute commands
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      const progress = Math.round(10 + (i / commands.length) * 80);

      if (onPhase) {
        onPhase({
          phase: `Executing command ${i + 1}/${commands.length}`,
          percent: progress,
        });
      }

      try {
        const result = await session.executeWithRetry(
          command,
          DEFAULT_RETRY_ATTEMPTS,
          onData,
          timeout
        );

        results.push({
          command,
          success: true,
          exitCode: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
          duration: result.duration,
        });

        if (onData) {
          onData({
            type: 'success',
            data: `✓ Command ${i + 1}/${commands.length} completed successfully`,
          });
        }
      } catch (err) {
        results.push({
          command,
          success: false,
          error: err.message,
        });

        if (onData) {
          onData({
            type: 'error',
            data: `✗ Command ${i + 1}/${commands.length} failed: ${err.message}`,
          });
        }

        // Don't stop on error - continue with remaining commands
        // (unless the command was marked as critical)
      }
    }

    if (onPhase) {
      onPhase({ phase: 'Disconnecting', percent: 95 });
    }
  } finally {
    // Always close the session
    try {
      await session.close();
    } catch (err) {
      if (onData) {
        onData({
          type: 'warning',
          data: `Warning during cleanup: ${err.message}`,
        });
      }
    }
  }

  if (onPhase) {
    onPhase({ phase: 'Complete', percent: 100 });
  }

  return results;
}

/**
 * Execute a single command on a remote server
 *
 * Simplified interface for single command execution
 */
async function executeCommand(sshConfig, command, onData = null, timeout = DEFAULT_TIMEOUT) {
  const results = await executeCommands(sshConfig, [command], onData, null, timeout);
  return results[0];
}

module.exports = {
  SSHSession,
  executeCommands,
  executeCommand,
};

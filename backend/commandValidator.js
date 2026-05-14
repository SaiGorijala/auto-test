'use strict';

/**
 * commandValidator.js — Security-focused shell command validation.
 *
 * Prevents execution of dangerous or destructive commands:
 * - File system destruction (rm -rf /, mkfs, dd)
 * - System-level operations (shutdown, reboot, poweroff)
 * - Privilege escalation
 * - Network-based attacks
 * - Fork bombs and resource exhaustion
 *
 * Philosophy:
 * - Whitelist known-safe patterns where possible
 * - Blacklist known-dangerous patterns
 * - Log all validation decisions
 * - Fail securely (reject ambiguous commands)
 */

// ─── Dangerous patterns that should NEVER execute ─────────────────────────────

const DANGEROUS_PATTERNS = [
  // Destructive filesystem operations
  /\brm\s+-[a-z]*f[a-z]*\s+\/\s*$/i,           // rm -rf / (and variants)
  /\brm\s+-[a-z]*f[a-z]*\s+\/[a-z]/i,          // rm -rf /... 
  /\bmkfs/i,                                     // mkfs (create filesystem)
  /\bdd\s+if=/i,                                 // dd if= (disk write)
  /\bdisk.*format/i,                            // disk format
  /\bformat\s+[A-Z]:/i,                         // Windows format
  
  // System-level destruction
  /\bshutdown\s+-h/i,                           // shutdown -h (halt)
  /\breboot/i,                                  // reboot
  /\bpoweroff/i,                                // poweroff
  /\bhalt\b/i,                                  // halt
  /\bsystemctl\s+(?:poweroff|reboot|halt)/i,   // systemctl poweroff/reboot
  
  // Privilege escalation
  /\bsudo\s+su\b/i,                             // sudo su
  /\bsudo\s+-[a-z]*i/i,                         // sudo -i (interactive root)
  /\bsudo\s+passwd/i,                           // sudo passwd (change password)
  
  // Fork bombs and resource exhaustion
  /:\(\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;/,         // bash fork bomb
  /\(\s*\)\s*&\s*\(\s*\)/,                      // xdotool fork bomb pattern
  /\bwhile\s+true\s*;?\s*do\s+.*&\s*done/i,    // infinite loop fork
  
  // Network attacks
  /\bping\s+-f/i,                               // ping flood
  /\bhping/i,                                   // hping (packet crafting)
  
  // Password/credential manipulation
  /\bpasswd\b/i,                                // passwd command
  /\bsudoers/i,                                 // sudoers file manipulation
  /\b\/etc\/shadow/i,                           // shadow file access
  
  // SSH key manipulation
  /\brm\s+.*\.ssh/i,                            // rm ~/.ssh
  /\brm\s+.*authorized_keys/i,                  // rm authorized_keys
  
  // Dangerous eval-like operations
  /\beval\b/i,                                  // eval command
  /\bsource\s+.*\$\(/i,                         // source with command substitution
  
  // Suspicious redirections that could be dangerous
  />\s*\/dev\/sda/i,                            // write to disk device
  />\s*\/proc/i,                                // write to /proc
  />\s*\/sys/i,                                 // write to /sys
];

// ─── Patterns that require careful scrutiny ────────────────────────────────────

const WARNING_PATTERNS = [
  { pattern: /\brm\b/i, reason: 'File deletion command' },
  { pattern: /\bchmod\s+[0-7]*[579]/i, reason: 'Potential permission escalation' },
  { pattern: />\s*\/etc\//i, reason: 'Writing to system config' },
  { pattern: /\bwget\s+.*\.sh\s*\|/i, reason: 'Downloading and executing scripts' },
  { pattern: /\bcurl\s+.*\.sh\s*\|/i, reason: 'Downloading and executing scripts' },
  { pattern: /\bcp\s+.*\/etc\//i, reason: 'Copying system files' },
];

// ─── Safe command patterns (can accelerate validation) ────────────────────────

const SAFE_PATTERNS = [
  /^apt\s+(update|install|upgrade)/i,          // apt package management
  /^apt-get\s+(update|install|upgrade)/i,      // apt-get
  /^yum\s+(install|update|upgrade)/i,          // yum
  /^dnf\s+(install|update|upgrade)/i,          // dnf
  /^brew\s+install/i,                          // homebrew
  /^docker\s+(build|run|pull|push|compose)/i,  // docker operations
  /^git\s+(clone|pull|fetch|checkout|status|log)/i,  // safe git operations
  /^npm\s+(install|start|test|build)/i,        // npm
  /^yarn\s+(install|start|test|build)/i,       // yarn
  /^make/i,                                     // make
  /^python\s+-m\s+(pip|pytest|unittest)/i,     // python package/test
  /^node\s+/i,                                 // node execution
  /^echo\s+/i,                                 // echo
  /^cat\s+[^<>&|;`$]/i,                        // cat (no redirects or substitution)
  /^ls\s+/i,                                   // ls
  /^pwd\s*$/i,                                 // pwd
  /^mkdir\s+-p\s+[^;&|`$]/i,                   // mkdir (safe path)
  /^touch\s+[^;&|`$]/i,                        // touch
  /^curl\s+https?:\/\//i,                      // curl (safe URL only)
  /^wget\s+https?:\/\//i,                      // wget (safe URL only)
  /^env\s+/i,                                  // env
  /^export\s+\w+=/i,                           // export variables
];

// ─── Validation result ─────────────────────────────────────────────────────────

class ValidationResult {
  constructor(command, isValid = true, severity = 'info', reason = '') {
    this.command = command;
    this.isValid = isValid;
    this.severity = severity;  // 'info', 'warning', 'error'
    this.reason = reason;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      command: this.command,
      isValid: this.isValid,
      severity: this.severity,
      reason: this.reason,
      timestamp: this.timestamp,
    };
  }
}

// ─── Core validation logic ──────────────────────────────────────────────────────

/**
 * Check if a command is safe to execute
 *
 * @param {string} command - The shell command to validate
 * @param {object} options - Validation options
 * @param {boolean} options.strict - Strict mode (stricter validation)
 * @param {array} options.allowedUsers - List of allowed SSH users
 * @param {string} options.sourceIp - IP address that generated this command (for logging)
 *
 * @returns {ValidationResult}
 */
function validateCommand(command, options = {}) {
  const { strict = true, allowedUsers = [], sourceIp = 'unknown' } = options;

  if (!command || typeof command !== 'string') {
    return new ValidationResult(command, false, 'error', 'Command must be a non-empty string');
  }

  const trimmed = command.trim();

  // Empty command
  if (trimmed.length === 0) {
    return new ValidationResult(command, false, 'error', 'Command cannot be empty');
  }

  // Command too long (potential attack vector)
  if (trimmed.length > 10000) {
    return new ValidationResult(command, false, 'error', 'Command is too long (max 10000 chars)');
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      const reason = `Blocked dangerous pattern: ${pattern.source}`;
      console.error(`[SECURITY] Command validation FAILED from ${sourceIp}:`, reason);
      console.error(`[SECURITY] Command was:`, trimmed.slice(0, 200));
      return new ValidationResult(command, false, 'error', reason);
    }
  }

  // Check for warning patterns
  const warnings = [];
  for (const { pattern, reason } of WARNING_PATTERNS) {
    if (pattern.test(trimmed)) {
      warnings.push(reason);
    }
  }

  // If strict mode and warnings exist, fail
  if (strict && warnings.length > 0) {
    const reason = `Suspicious patterns detected: ${warnings.join(', ')}`;
    console.warn(`[SECURITY] Command validation WARNING (strict mode) from ${sourceIp}:`, reason);
    return new ValidationResult(command, false, 'warning', reason);
  }

  // Check for safe patterns (fast path)
  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return new ValidationResult(command, true, 'info', 'Recognized safe command pattern');
    }
  }

  // Additional checks for non-safe patterns
  if (nonSafeCommandValidation(trimmed, sourceIp)) {
    return new ValidationResult(command, true, 'info', 'Manual validation passed');
  }

  // Ambiguous command
  const reason = 'Command pattern not recognized as safe or unsafe - requires manual review';
  console.warn(`[SECURITY] Command validation AMBIGUOUS from ${sourceIp}:`, reason);
  console.warn(`[SECURITY] Command was:`, trimmed.slice(0, 200));
  
  // In strict mode, reject ambiguous commands
  if (strict) {
    return new ValidationResult(command, false, 'warning', reason);
  }

  return new ValidationResult(command, true, 'warning', reason);
}

/**
 * Additional validation for non-safe pattern commands
 *
 * @private
 */
function nonSafeCommandValidation(command, sourceIp) {
  // Only allow piping between known-safe commands
  if (command.includes('|')) {
    const parts = command.split('|').map(p => p.trim());
    
    // All parts must match safe patterns or be simple filters
    for (const part of parts) {
      const isSafe = SAFE_PATTERNS.some(p => p.test(part)) ||
                     /^(grep|sed|awk|cut|sort|uniq|head|tail|tr|wc)[\s\|]/i.test(part) ||
                     /^(xargs|tee|cat)/i.test(part);
      
      if (!isSafe) {
        console.warn(`[SECURITY] Pipe component not safe from ${sourceIp}:`, part);
        return false;
      }
    }
    
    return true;
  }

  // Command substitution is generally dangerous
  if (command.includes('$(') || command.includes('`')) {
    console.warn(`[SECURITY] Command substitution detected from ${sourceIp}`);
    return false;
  }

  // Variable expansion is ok for env vars
  if (command.match(/\$[A-Z_]+/)) {
    return true;
  }

  // Chains of safe operations
  if (command.includes(';') || command.includes('&&')) {
    const parts = command.split(/[;&&]+/).map(p => p.trim());
    return parts.every(p => 
      SAFE_PATTERNS.some(pat => pat.test(p)) ||
      /^(cd|pwd|echo|export)/i.test(p)
    );
  }

  return false;
}

/**
 * Validate multiple commands (batch validation)
 *
 * @param {array} commands - Array of commands to validate
 * @param {object} options - Validation options
 *
 * @returns {object} - { valid: array, invalid: array, warnings: array }
 */
function validateCommandBatch(commands, options = {}) {
  const results = {
    valid: [],
    invalid: [],
    warnings: [],
  };

  if (!Array.isArray(commands)) {
    return results;
  }

  for (const cmd of commands) {
    const result = validateCommand(cmd, options);

    if (!result.isValid) {
      results.invalid.push(result);
    } else if (result.severity === 'warning') {
      results.warnings.push(result);
      results.valid.push(result);
    } else {
      results.valid.push(result);
    }
  }

  return results;
}

module.exports = {
  validateCommand,
  validateCommandBatch,
  ValidationResult,
};

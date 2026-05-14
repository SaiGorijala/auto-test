'use strict';

/**
 * repoAnalyzer.js — Repository structure analysis and tech stack detection.
 *
 * Analyzes:
 * - Language and framework detection
 * - Build tool identification
 * - Package manager detection
 * - Runtime requirements
 * - Port detection
 * - Health check endpoints
 * - Dependencies
 *
 * Used by Ollama to understand the project before generating deployment plans.
 */

const fs = require('fs');
const path = require('path');

// ─── File patterns for language/framework detection ─────────────────────────────

const LANGUAGE_PATTERNS = {
  javascript: {
    files: ['package.json', 'package-lock.json', 'yarn.lock', 'npm-shrinkwrap.json'],
    patterns: ['*.js', '*.ts', '*.jsx', '*.tsx'],
    indicators: ['node_modules', '.next', 'dist'],
  },
  python: {
    files: ['requirements.txt', 'Pipfile', 'pyproject.toml', 'setup.py', 'poetry.lock'],
    patterns: ['*.py'],
    indicators: ['venv', '.venv', 'site-packages'],
  },
  java: {
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle'],
    patterns: ['*.java', '*.jar'],
    indicators: ['target', 'build', 'gradle'],
  },
  csharp: {
    files: ['*.csproj', '*.sln'],
    patterns: ['*.cs', '*.csx'],
    indicators: ['bin', 'obj', '.vs'],
  },
  go: {
    files: ['go.mod', 'go.sum'],
    patterns: ['*.go'],
    indicators: ['vendor', 'bin'],
  },
  rust: {
    files: ['Cargo.toml', 'Cargo.lock'],
    patterns: ['*.rs'],
    indicators: ['target'],
  },
  php: {
    files: ['composer.json', 'composer.lock'],
    patterns: ['*.php'],
    indicators: ['vendor', 'node_modules'],
  },
  ruby: {
    files: ['Gemfile', 'Gemfile.lock'],
    patterns: ['*.rb'],
    indicators: ['gems', 'vendor/bundle'],
  },
};

const FRAMEWORK_PATTERNS = {
  // JavaScript/TypeScript
  react: /import\s+.*\s+from\s+['"]react/,
  vue: /import\s+.*\s+from\s+['"]vue/,
  angular: /@angular\/(?:core|common)/,
  nextjs: /next\/link|next\/image|getServerSideProps|getStaticProps/,
  express: /require\s*\(\s*['"]express['"]\s*\)|import\s+.*express/,
  fastify: /require\s*\(\s*['"]fastify['"]\s*\)|import\s+.*fastify/,
  nestjs: /@nestjs\/common/,
  svelte: /import\s+.*\s+from\s+['"]svelte/,
  nuxt: /nuxt\.config\.|export\s+default\s+defineNuxtConfig/,
  
  // Python
  django: /from\s+django|import\s+django/,
  flask: /from\s+flask|import\s+flask/,
  fastapi: /from\s+fastapi|import\s+fastapi/,
  celery: /from\s+celery|import\s+celery/,
  pytorch: /torch|tensorflow/,
  
  // Java
  spring: /org\.springframework/,
  springboot: /spring-boot/,
  maven: /maven/,
  gradle: /gradle/,
  
  // Container/DevOps
  kubernetes: /apiVersion|kind:\s+Deployment|kubectl/,
  docker: /Dockerfile|docker-compose/,
};

// ─── Port detection patterns ────────────────────────────────────────────────────

const PORT_PATTERNS = {
  commonPorts: [3000, 5000, 5173, 8000, 8080, 8443, 9000, 3306, 5432, 6379, 27017],
  patterns: [
    /port\s*[=:]\s*(\d+)/i,
    /listen\s*[=(]*(\d+)/i,
    /PORT\s*[=:]\s*(\d+)/i,
    /SERVER_PORT\s*[=:]\s*(\d+)/i,
    /app\.listen\s*\(\s*(\d+)/i,
    /http\.createServer\(\)\.listen\s*\(\s*(\d+)/i,
  ],
};

// ─── Build tool detection ──────────────────────────────────────────────────────

const BUILD_TOOLS = {
  npm: { files: ['package.json'], script: 'npm run build' },
  yarn: { files: ['yarn.lock'], script: 'yarn build' },
  pnpm: { files: ['pnpm-lock.yaml'], script: 'pnpm build' },
  maven: { files: ['pom.xml'], script: 'mvn clean package' },
  gradle: { files: ['build.gradle', 'build.gradle.kts'], script: 'gradle build' },
  make: { files: ['Makefile'], script: 'make' },
  cargo: { files: ['Cargo.toml'], script: 'cargo build --release' },
  dotnet: { files: ['*.csproj'], script: 'dotnet build' },
};

// ─── Health check patterns ──────────────────────────────────────────────────────

const HEALTH_CHECK_PATTERNS = {
  express: '/health|/api/health|/status|/ping',
  fastapi: '/health|/api/v1/health|/docs',
  django: '/health|/api/health|/admin',
  spring: '/actuator/health|/health',
};

/**
 * Analyze a repository
 *
 * @param {string} repoPath - Path to the repository
 * @param {function} onProgress - Progress callback (optional)
 *
 * @returns {object} - Repository analysis result
 */
function analyzeRepository(repoPath, onProgress = null) {
  const progress = (message, percent) => {
    if (onProgress) onProgress(message, percent);
  };

  progress('Starting repository analysis', 0);

  const analysis = {
    path: repoPath,
    timestamp: new Date().toISOString(),
    language: null,
    framework: null,
    buildTool: null,
    packageManager: null,
    ports: [],
    healthCheck: null,
    dependencies: [],
    devDependencies: [],
    scripts: {},
    dockerFile: false,
    composefile: false,
    files: [],
  };

  // Check if path exists
  if (!fs.existsSync(repoPath)) {
    throw new Error(`Repository path does not exist: ${repoPath}`);
  }

  progress('Analyzing repository structure', 10);

  // Scan directory
  const files = scanDirectory(repoPath);
  analysis.files = files;

  progress('Detecting language', 20);

  // Detect language
  analysis.language = detectLanguage(repoPath, files);

  progress(`Language detected: ${analysis.language}`, 30);

  // Detect framework
  analysis.framework = detectFramework(repoPath, analysis.language);
  if (analysis.framework) {
    progress(`Framework detected: ${analysis.framework}`, 40);
  }

  // Detect build tool
  analysis.buildTool = detectBuildTool(files);
  if (analysis.buildTool) {
    progress(`Build tool detected: ${analysis.buildTool}`, 50);
  }

  // Detect package manager
  analysis.packageManager = detectPackageManager(files, analysis.language);

  // Extract dependencies
  progress('Extracting dependencies', 60);
  
  if (analysis.language === 'javascript') {
    const packageJsonPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = parseJSON(packageJsonPath);
      analysis.dependencies = Object.keys(packageJson?.dependencies || {});
      analysis.devDependencies = Object.keys(packageJson?.devDependencies || {});
      analysis.scripts = packageJson?.scripts || {};
    }
  }

  // Detect ports
  progress('Detecting ports', 70);
  analysis.ports = detectPorts(repoPath, analysis.language);

  // Detect health check
  progress('Detecting health check endpoints', 80);
  analysis.healthCheck = detectHealthCheck(repoPath, analysis.framework);

  // Check for Docker
  progress('Checking for Docker support', 90);
  analysis.dockerFile = fs.existsSync(path.join(repoPath, 'Dockerfile'));
  analysis.composefile = fs.existsSync(path.join(repoPath, 'docker-compose.yml')) ||
                         fs.existsSync(path.join(repoPath, 'docker-compose.yaml'));

  progress('Repository analysis complete', 100);

  return analysis;
}

/**
 * Scan directory recursively for files
 *
 * @private
 */
function scanDirectory(dirPath, maxDepth = 3, currentDepth = 0, fileList = []) {
  if (currentDepth > maxDepth) return fileList;

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      // Skip hidden directories and common ignore patterns
      if (item.name.startsWith('.') && item.name !== '.env') continue;
      if (['node_modules', 'vendor', 'target', 'build', 'dist', '.git'].includes(item.name)) continue;

      const fullPath = path.join(dirPath, item.name);
      const relativePath = path.relative(process.cwd(), fullPath);

      if (item.isDirectory()) {
        scanDirectory(fullPath, maxDepth, currentDepth + 1, fileList);
      } else {
        fileList.push({
          name: item.name,
          path: relativePath,
          size: item.size,
        });
      }
    }
  } catch (err) {
    // Ignore permission errors
  }

  return fileList;
}

/**
 * Detect programming language
 *
 * @private
 */
function detectLanguage(repoPath, files) {
  const fileNames = files.map(f => f.name);

  for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    // Check for language-specific files
    if (patterns.files.some(f => fileNames.includes(f))) {
      return language;
    }

    // Check for language patterns in file extensions
    if (patterns.patterns.some(pattern => {
      const regex = new RegExp(pattern.replace('.', '\\.').replace('*', '[^/]+'));
      return files.some(f => regex.test(f.name));
    })) {
      return language;
    }
  }

  return 'unknown';
}

/**
 * Detect framework
 *
 * @private
 */
function detectFramework(repoPath, language) {
  const extensions = language === 'javascript' ? ['js', 'jsx', 'ts', 'tsx'] :
                    language === 'python' ? ['py'] :
                    language === 'java' ? ['java'] :
                    ['txt', 'json'];

  try {
    const files = getAllFilesWithExtensions(repoPath, extensions);

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        for (const [framework, pattern] of Object.entries(FRAMEWORK_PATTERNS)) {
          if (pattern.test(content)) {
            return framework;
          }
        }
      } catch (err) {
        // Skip unreadable files
      }
    }
  } catch (err) {
    // Ignore errors
  }

  return null;
}

/**
 * Detect build tool
 *
 * @private
 */
function detectBuildTool(files) {
  const fileNames = files.map(f => f.name);

  for (const [tool, config] of Object.entries(BUILD_TOOLS)) {
    if (config.files.some(pattern => {
      const regex = new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '[^/]+'));
      return fileNames.some(name => regex.test(name));
    })) {
      return tool;
    }
  }

  return null;
}

/**
 * Detect package manager
 *
 * @private
 */
function detectPackageManager(files, language) {
  const fileNames = files.map(f => f.name);

  if (language === 'javascript' || language === 'typescript') {
    if (fileNames.includes('yarn.lock')) return 'yarn';
    if (fileNames.includes('pnpm-lock.yaml')) return 'pnpm';
    if (fileNames.includes('package-lock.json')) return 'npm';
  }

  if (language === 'python') {
    if (fileNames.includes('Pipfile')) return 'pipenv';
    if (fileNames.includes('poetry.lock')) return 'poetry';
    if (fileNames.includes('requirements.txt')) return 'pip';
  }

  return null;
}

/**
 * Detect ports
 *
 * @private
 */
function detectPorts(repoPath, language) {
  const ports = new Set();

  // Add common ports for framework
  const extensions = language === 'javascript' ? ['js', 'jsx', 'ts', 'tsx'] :
                    language === 'python' ? ['py'] :
                    ['txt', 'json'];

  try {
    const files = getAllFilesWithExtensions(repoPath, extensions);

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        for (const pattern of PORT_PATTERNS.patterns) {
          const matches = content.match(pattern);
          if (matches && matches[1]) {
            const port = parseInt(matches[1]);
            if (port > 0 && port < 65535) {
              ports.add(port);
            }
          }
        }
      } catch (err) {
        // Skip
      }
    }
  } catch (err) {
    // Ignore
  }

  // Add framework defaults
  if (ports.size === 0) {
    ports.add(3000);  // Default Node.js port
  }

  return Array.from(ports).sort((a, b) => a - b);
}

/**
 * Detect health check endpoint
 *
 * @private
 */
function detectHealthCheck(repoPath, framework) {
  if (!framework) return null;

  const patterns = HEALTH_CHECK_PATTERNS[framework];
  if (!patterns) return null;

  return patterns.split('|')[0]; // Return first pattern as default
}

/**
 * Get all files with specific extensions
 *
 * @private
 */
function getAllFilesWithExtensions(dirPath, extensions, maxFiles = 100) {
  const files = [];
  const extensionSet = new Set(extensions);

  function walk(dir, depth = 0) {
    if (files.length >= maxFiles || depth > 3) return;

    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        if (item.name.startsWith('.')) continue;
        if (['node_modules', 'vendor', 'target', 'build', 'dist', '.git'].includes(item.name)) continue;

        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (extensionSet.has(path.extname(item.name).slice(1).toLowerCase())) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Ignore errors
    }
  }

  walk(dirPath);
  return files;
}

/**
 * Parse JSON file safely
 *
 * @private
 */
function parseJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

module.exports = {
  analyzeRepository,
};

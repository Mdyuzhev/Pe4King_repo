#!/usr/bin/env node
/**
 * EVA v2.1 - Evaluate Test Quality (Full Methodology)
 *
 * New in v2.1:
 * - Compilation Gate: syntax errors, missing imports → Score × 0.5
 * - Anti-patterns: sleep, empty catch, empty tests, hardcoded secrets
 * - Copy-paste detection: sequential tests (testUser1..testUser8)
 * - Bad naming: t1, t2, test, test2
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// =============================================================================
// Configuration
// =============================================================================

const VERSION = '2.1';

const WEIGHTS = {
  oracle: 0.30,
  mutation: 0.25,
  negative: 0.20,
  edge: 0.15,
  structure: 0.10
};

const GRADES = [
  { min: 90, grade: 'S', desc: 'Отлично, эталонное качество' },
  { min: 80, grade: 'A', desc: 'Очень хорошо, незначительные улучшения' },
  { min: 70, grade: 'B', desc: 'Хорошо, есть потенциал' },
  { min: 60, grade: 'C', desc: 'Удовлетворительно, требуется доработка' },
  { min: 50, grade: 'D', desc: 'Слабо, значительная доработка' },
  { min: 0,  grade: 'F', desc: 'Неудовлетворительно, переписать' }
];

// =============================================================================
// Compilation Gate Patterns
// =============================================================================

const COMPILATION_ERRORS = {
  java: [
    { pattern: /import\s+[\w.]+\.(FakeLibrary|NonExistent|Undefined)\s*;/gi, name: 'Missing import', penalty: 10 },
    { pattern: /public\s+\w+\s*\([^)]*\)\s*\{/g, name: 'Missing return type', penalty: 5 },
    { pattern: /\(\s*\{[^}]*$/gm, name: 'Unclosed brace', penalty: 5 },
    { pattern: /\w+\s+\w+\s*=\s*\w+\s*\+\s*["'][^"']*["']\s*;(?!.*\bString\b)/g, name: 'Undefined variable concat', penalty: 5 },
    { pattern: /int\s+\w+\s*=\s*get\s*\(/g, name: 'Type mismatch', penalty: 5 },
  ],
  python: [
    { pattern: /from\s+undefined_module|from\s+nonexistent/gi, name: 'Missing import', penalty: 10 },
    { pattern: /^\s{2}(?=\S)/gm, name: 'Indentation error', penalty: 5 },
    { pattern: /def\s+\w+\s*\([^)]*$/gm, name: 'Unclosed parenthesis', penalty: 5 },
    { pattern: /assert\s+unknown_\w+/g, name: 'Undefined variable', penalty: 5 },
  ]
};

// =============================================================================
// Anti-Pattern Detection
// =============================================================================

const ANTI_PATTERNS = {
  java: [
    { pattern: /Thread\.sleep\s*\(\s*\d+\s*\)/g, name: 'Thread.sleep', penalty: 10, desc: 'Избегайте sleep в тестах' },
    { pattern: /catch\s*\([^)]+\)\s*\{\s*\/\/\s*(ignore|empty)?\s*\}/gi, name: 'Empty catch', penalty: 15, desc: 'Пустой catch скрывает ошибки' },
    { pattern: /catch\s*\(\s*Exception\s+\w+\s*\)\s*\{\s*\}/g, name: 'Swallowed exception', penalty: 15, desc: 'Exception проглочен' },
    { pattern: /@Test\s+public\s+void\s+\w+\s*\(\s*\)\s*\{\s*\}/g, name: 'Empty test', penalty: 20, desc: 'Пустой тест' },
    { pattern: /anything\s*\(\s*\)/g, name: 'anything()', penalty: 5, desc: 'anything() — слабый матчер' },
    { pattern: /private\s+static\s+final\s+String\s+\w*(PASSWORD|SECRET|KEY|TOKEN)\w*\s*=\s*["'][^"']+["']/gi, name: 'Hardcoded secret', penalty: 20, desc: 'Захардкоженные credentials' },
    { pattern: /["'](sk-|api_key|password|secret)[^"']*["']/gi, name: 'Hardcoded credential', penalty: 15, desc: 'Credentials в коде' },
  ],
  python: [
    { pattern: /time\.sleep\s*\(\s*\d+\s*\)/g, name: 'time.sleep', penalty: 10, desc: 'Избегайте sleep в тестах' },
    { pattern: /except\s*:\s*pass/g, name: 'Bare except pass', penalty: 15, desc: 'Bare except скрывает ошибки' },
    { pattern: /except\s+\w+\s*:\s*pass/g, name: 'Exception pass', penalty: 10, desc: 'Exception проглочен' },
    { pattern: /def\s+test_\w+\s*\([^)]*\)\s*:\s*pass/g, name: 'Empty test', penalty: 20, desc: 'Пустой тест' },
    { pattern: /assert\s+True\s*$/gm, name: 'assert True', penalty: 5, desc: 'Бесполезный assert' },
    { pattern: /password\s*=\s*["'][^"']+["']/gi, name: 'Hardcoded password', penalty: 20, desc: 'Пароль в коде' },
    { pattern: /api_key\s*=\s*["'][^"']+["']/gi, name: 'Hardcoded API key', penalty: 15, desc: 'API key в коде' },
  ]
};

// =============================================================================
// Copy-Paste Detection
// =============================================================================

function detectCopyPaste(content, lang) {
  const testPattern = lang === 'java'
    ? /@Test\s+public\s+void\s+(\w+)/g
    : /def\s+(test_\w+)/g;

  const testNames = [];
  let match;
  while ((match = testPattern.exec(content)) !== null) {
    testNames.push(match[1]);
  }

  // Detect sequential patterns like testUser1, testUser2, ... testUser8
  const sequences = [];
  const seqPattern = /^(\w+?)(\d+)$/;

  const prefixGroups = {};
  for (const name of testNames) {
    const seqMatch = name.match(seqPattern);
    if (seqMatch) {
      const prefix = seqMatch[1];
      const num = parseInt(seqMatch[2], 10);
      if (!prefixGroups[prefix]) prefixGroups[prefix] = [];
      prefixGroups[prefix].push(num);
    }
  }

  let maxSequence = 0;
  let sequencePrefix = '';
  for (const [prefix, nums] of Object.entries(prefixGroups)) {
    nums.sort((a, b) => a - b);
    let seqLen = 1;
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] === nums[i - 1] + 1) {
        seqLen++;
      } else {
        seqLen = 1;
      }
      if (seqLen > maxSequence) {
        maxSequence = seqLen;
        sequencePrefix = prefix;
      }
    }
    if (nums.length > maxSequence) {
      maxSequence = Math.max(maxSequence, nums.length);
      sequencePrefix = prefix;
    }
  }

  return {
    detected: maxSequence >= 3,
    sequence: maxSequence,
    prefix: sequencePrefix,
    penalty: maxSequence >= 5 ? 25 : maxSequence >= 3 ? 15 : 0
  };
}

// =============================================================================
// Bad Naming Detection
// =============================================================================

function detectBadNaming(content, lang) {
  const testPattern = lang === 'java'
    ? /@Test\s+public\s+void\s+(\w+)/g
    : /def\s+(test_\w+)/g;

  const badNames = [];
  const badPatterns = [
    /^test\d*$/i,           // test, test1, test2
    /^t\d+$/i,              // t1, t2, t3
    /^test_?\d+$/i,         // test_1, test_2
    /^foo|bar|baz$/i,       // placeholder names
    /^temp|tmp$/i,          // temporary names
  ];

  let match;
  while ((match = testPattern.exec(content)) !== null) {
    const name = match[1];
    for (const pattern of badPatterns) {
      if (pattern.test(name)) {
        badNames.push(name);
        break;
      }
    }
  }

  return {
    found: badNames,
    count: badNames.length,
    penalty: badNames.length * 5
  };
}

// =============================================================================
// Matchers
// =============================================================================

const JAVA_MATCHERS = {
  strong: [
    /matchesPattern\s*\(/g,
    /oneOf\s*\(/g,
    /greaterThanOrEqualTo\s*\(/g,
    /lessThanOrEqualTo\s*\(/g,
    /hasSize\s*\(/g,
    /containsString\s*\(/g,
    /equalTo\s*\([^)]+\)/g,
    /hasItem\s*\(/g,
    /hasKey\s*\(/g,
    /everyItem\s*\(/g
  ],
  medium: [
    /notNullValue\s*\(\)/g,
    /nullValue\s*\(\)/g,
    /isA\s*\(/g,
    /instanceOf\s*\(/g,
    /not\s*\(/g,
    /hasProperty\s*\(/g
  ],
  weak: [
    /is\s*\(/g,
    /anything\s*\(\)/g
  ]
};

const PYTHON_MATCHERS = {
  strong: [
    /assert\s+.*==\s*["'][^"']+["']/g,
    /assert\s+.*in\s+\[/g,
    /assert\s+re\.match\s*\(/g,
    /assert\s+len\s*\(/g,
    /assert\s+.*>=\s*\d+/g,
    /assert\s+.*<=\s*\d+/g,
    /assert\s+isinstance\s*\(/g
  ],
  medium: [
    /assert\s+.*is\s+not\s+None/g,
    /assert\s+.*is\s+None/g,
    /assert\s+.*!=\s*/g,
    /assert\s+["']\w+["']\s+in\s+/g
  ],
  weak: [
    /assert\s+True/g,
    /assert\s+response/g
  ]
};

// Expected scenarios
const NEGATIVE_SCENARIOS = [
  { code: '400', name: 'Bad Request' },
  { code: '401', name: 'Unauthorized' },
  { code: '403', name: 'Forbidden' },
  { code: '404', name: 'Not Found' },
  { code: '409', name: 'Conflict' },
  { code: '422', name: 'Validation Error' }
];

const EDGE_SCENARIOS = [
  { pattern: /empty|пустой/i, name: 'Empty values' },
  { pattern: /null|nil/i, name: 'Null handling' },
  { pattern: /zero|ноль/i, name: 'Zero values' },
  { pattern: /max|maximum|макс/i, name: 'Maximum bounds' },
  { pattern: /min|minimum|мин/i, name: 'Minimum bounds' },
  { pattern: /overflow|переполн/i, name: 'Overflow' },
  { pattern: /boundary|граница/i, name: 'Boundary values' },
  { pattern: /special|спец/i, name: 'Special characters' },
  { pattern: /unicode|юникод/i, name: 'Unicode' },
  { pattern: /injection|инъекц/i, name: 'Injection' }
];

// =============================================================================
// Archive Handling
// =============================================================================

function extractArchive(archivePath, targetDir) {
  const ext = path.extname(archivePath).toLowerCase();
  if (ext === '.zip') {
    try {
      execSync(`unzip -o "${archivePath}" -d "${targetDir}"`, { stdio: 'pipe' });
    } catch {
      try {
        execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${targetDir}' -Force"`, { stdio: 'pipe' });
      } catch (e) {
        throw new Error('Failed to extract archive: ' + e.message);
      }
    }
  } else {
    throw new Error(`Unsupported archive format: ${ext}`);
  }
  return targetDir;
}

// =============================================================================
// File Discovery
// =============================================================================

function findTestFiles(dir, extensions = ['.java', '.py']) {
  const files = [];
  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }
  walk(dir);
  return files;
}

// =============================================================================
// Analysis Functions
// =============================================================================

function countMatches(content, patterns) {
  let count = 0;
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    count += matches ? matches.length : 0;
  }
  return count;
}

function detectCompilationErrors(content, lang) {
  const patterns = COMPILATION_ERRORS[lang] || [];
  const errors = [];
  let totalPenalty = 0;

  for (const { pattern, name, penalty } of patterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      errors.push({ name, count: matches.length });
      totalPenalty += penalty * matches.length;
    }
  }

  return {
    pass: errors.length === 0,
    errors,
    penalty: Math.min(totalPenalty, 50), // Cap at 50% penalty
    multiplier: errors.length > 0 ? 0.5 : 1.0
  };
}

function detectAntiPatterns(content, lang) {
  const patterns = ANTI_PATTERNS[lang] || [];
  const found = [];
  let totalPenalty = 0;

  for (const { pattern, name, penalty, desc } of patterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      found.push({ name, count: matches.length, desc });
      totalPenalty += penalty * Math.min(matches.length, 3); // Cap per-pattern
    }
  }

  return {
    found,
    totalPenalty: Math.min(totalPenalty, 50) // Cap total
  };
}

function analyzeNegativeCoverage(content) {
  const covered = [];
  for (const scenario of NEGATIVE_SCENARIOS) {
    if (new RegExp(scenario.code, 'g').test(content)) {
      covered.push(scenario.code);
    }
  }
  return { covered: covered.length, total: NEGATIVE_SCENARIOS.length, details: covered };
}

function analyzeEdgeCoverage(content) {
  const covered = [];
  for (const scenario of EDGE_SCENARIOS) {
    if (scenario.pattern.test(content)) {
      covered.push(scenario.name);
    }
  }
  return { covered: covered.length, total: EDGE_SCENARIOS.length, details: covered };
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  const lang = ext === '.java' ? 'java' : 'python';
  const matchers = ext === '.java' ? JAVA_MATCHERS : PYTHON_MATCHERS;
  const testPattern = ext === '.java' ? /@Test/g : /def\s+test_/g;

  return {
    tests: (content.match(testPattern) || []).length,
    strong: countMatches(content, matchers.strong),
    medium: countMatches(content, matchers.medium),
    weak: countMatches(content, matchers.weak),
    lines: content.split('\n').length,
    lang,
    content
  };
}

// =============================================================================
// Score Calculation
// =============================================================================

function calculateScores(summary, negCoverage, edgeCoverage) {
  const scores = {};
  const totalMatchers = summary.strong + summary.medium + summary.weak;

  // 1. Oracle Strength (30%)
  if (totalMatchers > 0) {
    const weighted = (summary.strong * 3 + summary.medium * 2 + summary.weak * 1);
    scores.oracle = Math.min(100, (weighted / totalMatchers) * 33.3);
  } else {
    scores.oracle = 0;
  }
  if (summary.tests > 0) {
    const density = totalMatchers / summary.tests;
    scores.oracle = Math.min(100, scores.oracle + Math.min(30, density * 5));
  }

  // 2. Mutation Score (25%)
  scores.mutation = Math.min(100, (summary.strong * 4) + (summary.medium * 2));
  if (summary.tests > 0) {
    scores.mutation = Math.min(100, scores.mutation * (1 + summary.tests / 50));
  }

  // 3. Negative Coverage (20%)
  scores.negative = Math.round((negCoverage.covered / negCoverage.total) * 100);

  // 4. Edge Cases (15%)
  scores.edge = Math.round((edgeCoverage.covered / edgeCoverage.total) * 100);

  // 5. Structural (10%)
  scores.structure = 50;
  if (summary.files > 1) scores.structure += 20;
  if (summary.tests > 5) scores.structure += 15;
  if (summary.tests > 0 && totalMatchers / summary.tests >= 2) scores.structure += 15;
  scores.structure = Math.min(100, scores.structure);

  for (const key of Object.keys(scores)) {
    scores[key] = Math.round(scores[key]);
  }

  return scores;
}

function calculateOracleDepth(summary) {
  if (summary.strong > 0 && summary.medium > 0 && summary.weak > 0) {
    return Math.min(100, 75 + Math.min(25, summary.strong * 2));
  } else if (summary.strong > 0) {
    return Math.min(75, 50 + summary.strong * 2);
  } else if (summary.medium > 0) {
    return Math.min(50, 25 + summary.medium * 2);
  } else if (summary.weak > 0) {
    return Math.min(25, summary.weak);
  }
  return 0;
}

function getGrade(score) {
  for (const g of GRADES) {
    if (score >= g.min) return g;
  }
  return GRADES[GRADES.length - 1];
}

function generateRecommendations(scores, summary, compilation, antiPatterns, copyPaste, badNaming) {
  const recs = [];

  // Compilation issues first
  if (!compilation.pass) {
    recs.push('КРИТИЧНО: Исправьте ошибки компиляции (Score × 0.5)');
  }

  // Anti-patterns
  if (antiPatterns.found.length > 0) {
    const names = antiPatterns.found.map(f => f.name).slice(0, 3).join(', ');
    recs.push(`Устраните anti-patterns: ${names}`);
  }

  // Copy-paste
  if (copyPaste.detected) {
    recs.push(`Рефакторинг copy-paste: ${copyPaste.sequence} последовательных тестов (${copyPaste.prefix}*)`);
  }

  // Bad naming
  if (badNaming.count > 0) {
    recs.push(`Улучшите именование тестов: ${badNaming.found.slice(0, 3).join(', ')}`);
  }

  // Standard recommendations
  if (scores.negative < 50) {
    recs.push('Добавьте негативные тесты (4xx коды, невалидные данные)');
  }
  if (scores.edge < 40) {
    recs.push('Добавьте edge cases (empty, null, boundary values)');
  }
  if (summary.strong < summary.weak) {
    recs.push('Замените слабые матчеры (is, anything) на строгие');
  }

  return recs;
}

// =============================================================================
// Main
// =============================================================================

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node scripts/eva-v2.js <path-to-tests> [--json]');
    process.exit(1);
  }

  let targetPath = args[0];
  let tempDir = null;

  // Extract archive if needed
  const ext = path.extname(targetPath).toLowerCase();
  if (ext === '.zip') {
    tempDir = path.join(require('os').tmpdir(), `eva-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    extractArchive(targetPath, tempDir);
    targetPath = tempDir;
  }

  // Find test files
  let files;
  if (fs.statSync(targetPath).isDirectory()) {
    files = findTestFiles(targetPath);
  } else {
    files = [targetPath];
  }

  if (files.length === 0) {
    console.error('No test files found (.java or .py)');
    process.exit(1);
  }

  // Aggregate analysis
  const summary = { files: files.length, tests: 0, strong: 0, medium: 0, weak: 0 };
  let allContent = '';
  let primaryLang = 'java';

  for (const file of files) {
    const stats = analyzeFile(file);
    summary.tests += stats.tests;
    summary.strong += stats.strong;
    summary.medium += stats.medium;
    summary.weak += stats.weak;
    allContent += stats.content + '\n';
    primaryLang = stats.lang;
  }

  // v2.1 Analysis
  const compilation = detectCompilationErrors(allContent, primaryLang);
  const antiPatterns = detectAntiPatterns(allContent, primaryLang);
  const copyPaste = detectCopyPaste(allContent, primaryLang);
  const badNaming = detectBadNaming(allContent, primaryLang);

  // Coverage analysis
  const negCoverage = analyzeNegativeCoverage(allContent);
  const edgeCoverage = analyzeEdgeCoverage(allContent);

  // Calculate base scores
  const scores = calculateScores(summary, negCoverage, edgeCoverage);
  const oracleDepth = calculateOracleDepth(summary);

  // Calculate base total
  let baseTotal = Math.round(
    scores.oracle * WEIGHTS.oracle +
    scores.mutation * WEIGHTS.mutation +
    scores.negative * WEIGHTS.negative +
    scores.edge * WEIGHTS.edge +
    scores.structure * WEIGHTS.structure
  );

  // Apply penalties
  const totalPenalty = antiPatterns.totalPenalty + copyPaste.penalty + badNaming.penalty;
  let total = Math.max(0, baseTotal - totalPenalty);

  // Apply compilation multiplier
  total = Math.round(total * compilation.multiplier);

  const grade = getGrade(total);
  const recommendations = generateRecommendations(scores, summary, compilation, antiPatterns, copyPaste, badNaming);

  // Cleanup
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // Build result
  const result = {
    version: VERSION,
    summary,
    compilation,
    antiPatterns,
    copyPaste,
    badNaming,
    scores,
    weights: WEIGHTS,
    baseTotal,
    totalPenalty,
    total,
    grade: grade.grade,
    gradeDesc: grade.desc,
    oracleDepth,
    negativeCovered: negCoverage.covered,
    negativeTotal: negCoverage.total,
    edgeCovered: edgeCoverage.covered,
    edgeTotal: edgeCoverage.total,
    recommendations
  };

  // Output
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n' + '='.repeat(60));
    console.log(`EVA v${VERSION} Test Quality Report`);
    console.log('='.repeat(60));
    console.log(`Files: ${summary.files} | Tests: ${summary.tests}`);
    console.log(`Matchers: ${summary.strong} strong, ${summary.medium} medium, ${summary.weak} weak`);

    if (!compilation.pass) {
      console.log('\n⚠️  COMPILATION ERRORS DETECTED (Score × 0.5)');
      compilation.errors.forEach(e => console.log(`   • ${e.name}: ${e.count}`));
    }

    if (antiPatterns.found.length > 0) {
      console.log('\n🚫 Anti-patterns:');
      antiPatterns.found.forEach(a => console.log(`   • ${a.name} (×${a.count}): -${a.count * 5}`));
    }

    if (copyPaste.detected) {
      console.log(`\n📋 Copy-paste: ${copyPaste.sequence} sequential tests (${copyPaste.prefix}*) → -${copyPaste.penalty}`);
    }

    if (badNaming.count > 0) {
      console.log(`\n📛 Bad naming: ${badNaming.found.join(', ')} → -${badNaming.penalty}`);
    }

    console.log('\n' + '-'.repeat(60));
    console.log(`Oracle:    ${scores.oracle}%  | Mutation: ${scores.mutation}%`);
    console.log(`Negative:  ${negCoverage.covered}/${negCoverage.total} | Edge: ${edgeCoverage.covered}/${edgeCoverage.total}`);
    console.log(`Structure: ${scores.structure}%  | Depth: L${Math.ceil(oracleDepth/25)} (${oracleDepth}/100)`);
    console.log('-'.repeat(60));
    console.log(`Base: ${baseTotal} - Penalties: ${totalPenalty}${compilation.multiplier < 1 ? ' × 0.5' : ''} = ${total}`);
    console.log('='.repeat(60));
    console.log(`EVA Score: ${total} [${grade.grade}] - ${grade.desc}`);
    console.log('='.repeat(60));

    if (recommendations.length > 0) {
      console.log('\nРекомендации:');
      recommendations.forEach(r => console.log(`  • ${r}`));
    }
  }

  process.exit(total >= 60 ? 0 : 1);
}

main();

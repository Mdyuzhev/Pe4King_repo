# EVA: Evaluation of Verification Assets

## Purpose

EVA is a static analysis tool for measuring test quality without execution. It analyzes test code structure and assigns scores based on assertion depth and coverage.

## Oracle Depth Levels

| Level | Score | What it checks |
|-------|-------|----------------|
| L0 | 0 | No assertions |
| L1 | 10 | Status code only |
| L2 | 25 | Status + response exists |
| L3 | 50 | Top-level fields |
| L4 | 70 | Nested fields |
| L5 | 85 | Types and formats |
| L6 | 100 | Business logic |

## Grading System

| Grade | Score Range | Description |
|-------|-------------|-------------|
| S | 90-100 | Production-ready |
| A | 80-89 | High quality |
| B | 70-79 | Good foundation |
| C | 60-69 | Acceptable draft |
| D | 50-59 | Needs improvement |
| F | 0-49 | Rewrite required |

## Score Calculation

Components:
- Oracle Strength: 30%
- Mutation Score: 25%
- Negative Coverage: 20%
- Edge Cases: 15%
- Structural Quality: 10%

## Anti-patterns Detected

- Thread.sleep() calls
- Empty catch blocks
- Hardcoded credentials
- Copy-paste tests
- Missing assertions

## Usage

### IntelliJ Plugin
1. Open EvaPanel from tool window
2. Click "Analyze File" or "Analyze Folder"
3. Review results and recommendations

### Standalone Script
```bash
node eva-v2.1.js path/to/tests
```

## Author

Mikhail Dyuzhev

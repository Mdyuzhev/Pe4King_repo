# Building Pe4King

## Prerequisites

- Node.js 18+
- npm 9+
- JDK 17+
- Gradle 8+

## VS Code Extension

### Install dependencies
```bash
npm install
```

### Build VSIX
```bash
npm run package
```

Output: `dist/pe4king-{version}.vsix`

### Install locally
```bash
code --install-extension dist/pe4king-*.vsix
```

## IntelliJ IDEA Plugin

### Build
```bash
cd idea_plugin
./gradlew buildPlugin
```

Output: `build/distributions/pe4king-idea-{version}.zip`

### Install locally
1. IDEA → Settings → Plugins → ⚙️ → Install from disk
2. Select the ZIP file
3. Restart IDE

## Dependencies

### VS Code Extension
- TypeScript 5.x
- @types/vscode
- swagger-parser

### IntelliJ Plugin
- Kotlin 1.9.x
- Jackson 2.15.x
- OkHttp 4.12.x
- Swagger Parser 2.1.x
- GraalJS 23.x

## Performance

| Operation | Time |
|-----------|------|
| Parse 200 endpoints | ~50ms |
| Generate 2000 tests | ~100ms |
| Render to Java | ~50ms |
| EVA analyze 50 tests | ~200ms |

## Author

Mikhail Dyuzhev

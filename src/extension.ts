import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import { Pe4KingGenerator } from './generator';
import { GeneratorConfig, GenerationResult } from './core/models';
import { Pe4KingWebviewProvider } from './ui/webview-provider';
import { CollectionManager } from './collections';

let generator: Pe4KingGenerator;
let webviewProvider: Pe4KingWebviewProvider;
let collectionManager: CollectionManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('Pe4King extension activated!');
    generator = new Pe4KingGenerator();
    collectionManager = new CollectionManager(context);

    // Register webview provider with endpoint selection UI
    webviewProvider = new Pe4KingWebviewProvider(context.extensionUri, generator, collectionManager);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            Pe4KingWebviewProvider.viewType,
            webviewProvider
        )
    );

    // Command: Generate tests with UI selection (context menu)
    const generateCommand = vscode.commands.registerCommand(
        'pe4king.generateTests',
        async (uri: vscode.Uri) => {
            const filePath = uri?.fsPath || vscode.window.activeTextEditor?.document.uri.fsPath;
            if (!filePath) {
                vscode.window.showErrorMessage('No file selected');
                return;
            }

            // Load spec into webview panel
            await webviewProvider.loadSpec(filePath);

            // Focus the Pe4King view
            vscode.commands.executeCommand('pe4king.mainView.focus');
        }
    );

    // Command: Quick generate (no UI, all endpoints)
    const quickGenerateCommand = vscode.commands.registerCommand(
        'pe4king.quickGenerate',
        async (uri: vscode.Uri) => {
            await quickGenerate(uri, generator);
        }
    );

    // Command: Open panel
    const openPanelCommand = vscode.commands.registerCommand(
        'pe4king.openPanel',
        () => {
            vscode.commands.executeCommand('pe4king.mainView.focus');
        }
    );

    // Command: Load spec from URL
    const loadUrlCommand = vscode.commands.registerCommand(
        'pe4king.loadFromUrl',
        async () => {
            const url = await vscode.window.showInputBox({
                prompt: 'Enter OpenAPI/Swagger specification URL',
                placeHolder: 'https://api.example.com/v3/api-docs or https://api.example.com/swagger-ui/',
                validateInput: (value) => {
                    if (!value) return 'URL is required';
                    if (!value.match(/^https?:\/\//i) && !value.match(/^[a-z0-9.-]+\.[a-z]{2,}/i)) {
                        return 'Please enter a valid URL';
                    }
                    return null;
                }
            });

            if (!url) return;

            // Ask for auth if needed
            const useAuth = await vscode.window.showQuickPick(['No', 'Yes'], {
                placeHolder: 'Does this API require authentication?'
            });

            let authHeader: string | undefined;
            if (useAuth === 'Yes') {
                authHeader = await vscode.window.showInputBox({
                    prompt: 'Enter Authorization header value',
                    placeHolder: 'Bearer your-token-here',
                    password: false
                });
            }

            // Load spec
            await webviewProvider.loadSpecFromUrl(url, authHeader);

            // Focus the Pe4King view
            vscode.commands.executeCommand('pe4king.mainView.focus');
        }
    );

    context.subscriptions.push(generateCommand, quickGenerateCommand, openPanelCommand, loadUrlCommand);

    vscode.window.showInformationMessage('Pe4King activated');
}

/**
 * Quick generate without UI - generates all endpoints.
 */
async function quickGenerate(uri: vscode.Uri, generator: Pe4KingGenerator) {
    try {
        const filePath = uri?.fsPath || vscode.window.activeTextEditor?.document.uri.fsPath;
        if (!filePath) {
            vscode.window.showErrorMessage('No file selected');
            return;
        }

        // Get framework from quick pick
        const frameworkChoice = await vscode.window.showQuickPick([
            { label: 'pytest', description: 'Python + requests', detail: 'Generates test_api.py + conftest.py' },
            { label: 'rest-assured', description: 'Java + JUnit 5', detail: 'Generates Maven project with REST Assured' },
            { label: 'postman', description: 'Postman Collection', detail: 'Generates collection.json with test scripts' }
        ], {
            placeHolder: 'Select test framework',
            title: 'Pe4King: Choose Framework'
        });

        if (!frameworkChoice) {
            return; // User cancelled
        }

        const framework = frameworkChoice.label;
        const config = vscode.workspace.getConfiguration('pe4king');
        const generateNegative = config.get<boolean>('generateNegativeTests') ?? true;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Generating tests...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0 });

            // Read spec file
            const content = fs.readFileSync(filePath, 'utf-8');
            const specName = path.basename(filePath, path.extname(filePath));

            // Generate tests
            const result = generator.generate(content, {
                framework: framework as GeneratorConfig['framework'],
                generateNegativeTests: generateNegative
            });

            if (!result.success) {
                throw new Error(result.errors?.join(', ') || 'Generation failed');
            }

            progress.report({ increment: 30, message: 'Writing files...' });

            // Create output directory
            const outputDir = path.join(path.dirname(filePath), 'generated-tests');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Write files
            for (const file of result.files) {
                const outputPath = path.join(outputDir, file.filename);
                const dir = path.dirname(outputPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(outputPath, file.content);
            }

            progress.report({ increment: 60, message: 'Creating ZIP archive...' });

            // Create ZIP archive
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const zipName = `${specName}_${framework}_${timestamp}.zip`;
            const zipPath = path.join(path.dirname(filePath), zipName);
            await createZipArchive(outputDir, zipPath);

            progress.report({ increment: 100 });

            // Show results panel
            showResultsPanel(result, outputDir, zipPath, specName, framework);
        });

    } catch (error: unknown) {
        vscode.window.showErrorMessage(`Error: ${(error as Error).message}`);
    }
}

/**
 * Creates a ZIP archive from a directory.
 */
async function createZipArchive(sourceDir: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver.default('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', (err: Error) => reject(err));

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

/**
 * Shows the results panel with navigation buttons.
 */
function showResultsPanel(
    result: GenerationResult,
    outputDir: string,
    zipPath: string,
    specName: string,
    framework: string
) {
    const panel = vscode.window.createWebviewPanel(
        'pe4kingResults',
        'Pe4King Results',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    const fileList = result.files.map(f =>
        `<li><a href="#" onclick="openFile('${f.filename}')">${f.filename}</a></li>`
    ).join('\n');

    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generation Results</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
        }
        .header h1 {
            margin: 0;
            color: var(--vscode-textLink-foreground);
        }
        .badge {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .stat-card {
            background: var(--vscode-input-background);
            padding: 16px;
            border-radius: 8px;
            text-align: center;
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        .actions {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 24px;
        }
        button {
            padding: 10px 20px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .files-section h2 {
            margin-bottom: 12px;
        }
        .file-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .file-list li {
            padding: 8px 12px;
            background: var(--vscode-input-background);
            margin-bottom: 4px;
            border-radius: 4px;
        }
        .file-list a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        .file-list a:hover {
            text-decoration: underline;
        }
        .zip-info {
            margin-top: 24px;
            padding: 12px;
            background: var(--vscode-textBlockQuote-background);
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Generation Complete</h1>
        <span class="badge">${framework}</span>
    </div>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-value">${result.stats.totalEndpoints}</div>
            <div class="stat-label">Endpoints</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${result.stats.totalTests}</div>
            <div class="stat-label">Tests</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${result.stats.positiveTests}</div>
            <div class="stat-label">Positive</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${result.stats.negativeTests}</div>
            <div class="stat-label">Negative</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${result.stats.assertions}</div>
            <div class="stat-label">Assertions</div>
        </div>
    </div>

    <div class="actions">
        <button onclick="openFolder()">
            <span>Open Output Folder</span>
        </button>
        <button onclick="openZip()">
            <span>Open ZIP Archive</span>
        </button>
        <button class="secondary" onclick="openMainFile()">
            <span>Open Main Test File</span>
        </button>
        <button class="secondary" onclick="copyPath()">
            <span>Copy Folder Path</span>
        </button>
    </div>

    <div class="files-section">
        <h2>Generated Files</h2>
        <ul class="file-list">
            ${fileList}
        </ul>
    </div>

    <div class="zip-info">
        <strong>ZIP Archive:</strong> ${path.basename(zipPath)}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const outputDir = ${JSON.stringify(outputDir)};
        const zipPath = ${JSON.stringify(zipPath)};
        const files = ${JSON.stringify(result.files.map(f => f.filename))};

        function openFolder() {
            vscode.postMessage({ command: 'openFolder', path: outputDir });
        }

        function openZip() {
            vscode.postMessage({ command: 'revealFile', path: zipPath });
        }

        function openMainFile() {
            vscode.postMessage({ command: 'openFile', path: outputDir, filename: files[0] });
        }

        function openFile(filename) {
            vscode.postMessage({ command: 'openFile', path: outputDir, filename });
        }

        function copyPath() {
            vscode.postMessage({ command: 'copyPath', path: outputDir });
        }
    </script>
</body>
</html>`;

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'openFolder':
                vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(message.path));
                break;
            case 'revealFile':
                vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(message.path));
                break;
            case 'openFile':
                const filePath = path.join(message.path, message.filename);
                const doc = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                break;
            case 'copyPath':
                await vscode.env.clipboard.writeText(message.path);
                vscode.window.showInformationMessage('Path copied to clipboard!');
                break;
        }
    });
}

export function deactivate() {}

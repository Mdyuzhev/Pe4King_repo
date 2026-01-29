/**
 * VS Code Webview provider for endpoint selection UI.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiver = require('archiver');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');
import { EndpointInfo, GeneratorConfig } from '../core/models';
import { OpenAPIParser } from '../core/parser';
import { SpecUrlResolver } from '../core/url-resolver';
import { SampleGenerator } from '../core/sample-generator';
import { EndpointTreeBuilder, EndpointNode } from './endpoint-tree';
import { RequestPanelProvider } from './request-panel';
import { RunnerPanelProvider } from './runner-panel';
import { Pe4KingGenerator } from '../generator';
import { CollectionManager, SNIPPET_LIBRARY } from '../collections';
import { collectionToTestCases, ExportConfig } from '../collections/export-models';
import { exportToPytest } from '../collections/exporters/pytest';
import { exportToRestAssured } from '../collections/exporters/rest-assured';
import { generateWebviewHtml } from './webview';

export class Pe4KingWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'pe4king.mainView';

  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _endpoints: EndpointInfo[] = [];
  private _tree: EndpointNode[] = [];
  private _specPath?: string;
  private _generator: Pe4KingGenerator;
  private _treeBuilder: EndpointTreeBuilder;
  private _urlResolver: SpecUrlResolver;
  private _currentSpecUrl?: string;
  private _requestPanel: RequestPanelProvider;
  private _runnerPanel: RunnerPanelProvider;
  private _baseUrl: string = '';
  private _authHeader?: string;
  private _collectionManager: CollectionManager;
  private _activeTab: 'endpoints' | 'collections' = 'endpoints';
  private _sampleGenerator: SampleGenerator;

  constructor(extensionUri: vscode.Uri, generator: Pe4KingGenerator, collectionManager: CollectionManager) {
    this._extensionUri = extensionUri;
    this._generator = generator;
    this._collectionManager = collectionManager;
    this._treeBuilder = new EndpointTreeBuilder();
    this._urlResolver = new SpecUrlResolver();
    this._sampleGenerator = new SampleGenerator();
    this._requestPanel = new RequestPanelProvider(collectionManager);
    this._runnerPanel = new RunnerPanelProvider(collectionManager);

    // Update UI when collections change
    this._collectionManager.onDidChange(() => {
      this._sendCollections();
    });
  }

  /**
   * Called when the webview is created.
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlContent();

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async message => {
      switch (message.type) {
        case 'ready':
          // Webview is ready, send current data if available
          console.log('[Pe4King] Webview ready, tree has', this._tree.length, 'folders');
          if (this._tree.length > 0) {
            this._sendEndpoints();
          }
          this._sendCollections();
          break;

        case 'generate':
          await this._handleGenerate(message);
          break;

        case 'loadUrl':
          await this._handleLoadUrl(message.url, message.authHeader);
          break;

        case 'reset':
          this._endpoints = [];
          this._tree = [];
          this._specPath = undefined;
          this._currentSpecUrl = undefined;
          this._baseUrl = '';
          this._authHeader = undefined;
          break;

        case 'browseFile':
          await this._handleBrowseFile();
          break;

        case 'openRequest':
          this._handleOpenRequest(message.endpointId);
          break;

        case 'switchTab':
          this._activeTab = message.tab;
          break;

        case 'getCollections':
          this._sendCollections();
          break;

        case 'createCollection':
          console.log('[Webview] Creating collection:', message.name);
          const newCollection = this._collectionManager.createCollection(message.name, message.description);
          // Explicitly send updated collections (event listener may not trigger if view inactive)
          this._sendCollections();
          // Auto-expand new collection
          this._view?.webview.postMessage({
            type: 'expandCollection',
            collectionId: newCollection.id
          });
          break;

        case 'promptCreateCollection':
          this._promptCreateCollection();
          break;

        case 'deleteCollection':
          this._confirmDeleteCollection(message.collectionId);
          break;

        case 'createFolder':
          this._collectionManager.createFolderIn(message.collectionId, message.name, message.parentFolderId);
          this._sendCollections();
          break;

        case 'promptCreateFolder':
          this._promptCreateFolder(message.collectionId, message.parentFolderId);
          break;

        case 'deleteFolder':
          this._collectionManager.deleteFolder(message.collectionId, message.folderId);
          this._sendCollections();
          break;

        case 'deleteRequest':
          this._collectionManager.deleteRequest(message.collectionId, message.requestId);
          this._sendCollections();
          break;

        case 'openSavedRequest':
          this._handleOpenSavedRequest(message.collectionId, message.requestId);
          break;

        case 'exportCollection':
          this._handleExportCollection(message.collectionId);
          break;

        case 'runCollection':
          this._runnerPanel.open(message.collectionId);
          break;

        case 'addToCollection':
          this._handleAddToCollection(message.selectedIds);
          break;

        // Test Snippets
        case 'addTestSnippet':
          this._collectionManager.addTestToRequest(message.collectionId, message.requestId, message.snippet);
          this._sendCollections();
          break;

        case 'removeTestSnippet':
          this._collectionManager.removeTestFromRequest(message.collectionId, message.requestId, message.index);
          this._sendCollections();
          break;

        case 'toggleTestSnippet':
          this._collectionManager.toggleTest(message.collectionId, message.requestId, message.index);
          this._sendCollections();
          break;

        case 'getSnippetLibrary':
          this._sendSnippetLibrary();
          break;

        // Variables Extraction
        case 'addExtraction':
          this._collectionManager.addExtractionToRequest(
            message.collectionId,
            message.requestId,
            message.extraction
          );
          this._sendCollections();
          break;

        case 'removeExtraction':
          this._collectionManager.removeExtractionFromRequest(
            message.collectionId,
            message.requestId,
            message.index
          );
          this._sendCollections();
          break;

        // Export to Code
        case 'previewExportCode': {
          const collection = this._collectionManager.getCollection(message.collectionId);
          if (!collection) break;

          const testCases = collectionToTestCases(collection, message.config);
          let result;

          if (message.config.format === 'pytest') {
            result = exportToPytest(testCases, message.config);
          } else if (message.config.format === 'rest-assured') {
            result = exportToRestAssured(testCases, message.config);
          }

          if (result?.files?.[0]) {
            this._view?.webview.postMessage({
              type: 'exportPreview',
              code: result.files[0].content
            });
          }
          break;
        }

        case 'saveExportCode': {
          const collection = this._collectionManager.getCollection(message.collectionId);
          if (!collection) break;

          const testCases = collectionToTestCases(collection, message.config);
          let result;

          if (message.config.format === 'pytest') {
            result = exportToPytest(testCases, message.config);
          } else if (message.config.format === 'rest-assured') {
            result = exportToRestAssured(testCases, message.config);
          }

          if (result?.success && result.files.length > 0) {
            await this._saveExportFiles(result.files, message.config.format);
          }
          break;
        }

        // EVA - Test Quality Analysis
        case 'browseTestArchive':
          await this._handleBrowseTestArchive();
          break;

        case 'runEva':
          await this._handleRunEva(message.archivePath);
          break;
      }
    });
  }

  /**
   * Saves exported test files to disk.
   * For REST Assured: creates ZIP archive with 3-layer architecture
   * For pytest: saves single file
   */
  private async _saveExportFiles(files: { filename: string; content: string }[], format: string): Promise<void> {
    if (format === 'rest-assured' && files.length > 1) {
      // Save as ZIP archive for REST Assured (3-layer architecture)
      const uri = await vscode.window.showSaveDialog({
        filters: { 'ZIP Archive': ['zip'] },
        saveLabel: 'Save Tests Archive'
      });

      if (!uri) return;

      await this._createZipArchive(uri.fsPath, files);

      vscode.window.showInformationMessage(`Exported ${files.length} files to ${uri.fsPath}`);
    } else {
      // Save single file for pytest
      const uri = await vscode.window.showSaveDialog({
        filters: format === 'pytest'
          ? { 'Python': ['py'] }
          : { 'Java': ['java'] },
        saveLabel: 'Save Test File'
      });

      if (!uri) return;

      await vscode.workspace.fs.writeFile(uri, Buffer.from(files[0].content, 'utf8'));

      vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);

      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    }
  }

  /**
   * Prompts user to create a new collection using VSCode input box.
   */
  private async _promptCreateCollection(): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter collection name',
      placeHolder: 'My Collection'
    });
    if (name) {
      const newCollection = this._collectionManager.createCollection(name);
      this._sendCollections();
      this._view?.webview.postMessage({
        type: 'expandCollection',
        collectionId: newCollection.id
      });
    }
  }

  /**
   * Prompts user to create a new folder using VSCode input box.
   */
  private async _promptCreateFolder(collectionId: string, parentFolderId?: string): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter folder name',
      placeHolder: 'New Folder'
    });
    if (name) {
      this._collectionManager.createFolderIn(collectionId, name, parentFolderId);
      this._sendCollections();
    }
  }

  /**
   * Confirms and deletes a collection.
   */
  private async _confirmDeleteCollection(collectionId: string): Promise<void> {
    const result = await vscode.window.showWarningMessage(
      'Delete this collection?',
      { modal: true },
      'Delete'
    );
    if (result === 'Delete') {
      this._collectionManager.deleteCollection(collectionId);
      this._sendCollections();
    }
  }

  /**
   * Sends collections data to webview.
   */
  private _sendCollections(): void {
    const treeData = this._collectionManager.getTreeData();
    console.log('[Webview] Sending', treeData.length, 'collections to webview');
    if (!this._view) {
      console.log('[Webview] Warning: view is not available');
      return;
    }
    this._view.webview.postMessage({
      type: 'setCollections',
      collections: treeData
    });
  }

  /**
   * Sends snippet library to webview.
   */
  private _sendSnippetLibrary(): void {
    if (!this._view) return;
    this._view.webview.postMessage({
      type: 'setSnippetLibrary',
      library: SNIPPET_LIBRARY
    });
  }

  /**
   * Opens saved request in request panel.
   */
  private _handleOpenSavedRequest(collectionId: string, requestId: string): void {
    const request = this._collectionManager.getRequest(collectionId, requestId);
    if (!request) {
      vscode.window.showErrorMessage('Request not found');
      return;
    }

    this._requestPanel.openSavedRequest(request, collectionId);
  }

  /**
   * Exports collection to Postman format.
   */
  private async _handleExportCollection(collectionId: string): Promise<void> {
    const collection = this._collectionManager.getCollection(collectionId);
    if (!collection) return;

    const postmanData = this._collectionManager.exportToPostman(collectionId);
    if (!postmanData) return;

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${collection.name}.postman_collection.json`),
      filters: { 'Postman Collection': ['json'] }
    });

    if (uri) {
      fs.writeFileSync(uri.fsPath, JSON.stringify(postmanData, null, 2));
      vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
    }
  }

  /**
   * Add selected endpoints to a collection.
   */
  private async _handleAddToCollection(selectedIds: string[]): Promise<void> {
    const endpoints = this._getSelectedEndpoints(selectedIds);
    if (endpoints.length === 0) return;

    // Get or create collection
    const collections = this._collectionManager.collections;
    const items: vscode.QuickPickItem[] = [
      { label: '$(add) New Collection...', description: 'Create a new collection' },
      ...collections.map(c => ({ label: c.name, description: `${c.requests.length} requests` }))
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select collection or create new'
    });

    if (!selected) return;

    let collectionId: string;

    if (selected.label === '$(add) New Collection...') {
      const name = await vscode.window.showInputBox({
        prompt: 'Collection name',
        placeHolder: 'My Collection'
      });
      if (!name) return;
      const newCollection = this._collectionManager.createCollection(name);
      collectionId = newCollection.id;
    } else {
      const collection = collections.find(c => c.name === selected.label);
      if (!collection) return;
      collectionId = collection.id;
    }

    // Add each endpoint as a saved request
    for (const endpoint of endpoints) {
      const url = this._baseUrl + endpoint.path;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      if (this._authHeader) {
        headers['Authorization'] = this._authHeader;
      }

      // Generate body from schema for POST/PUT/PATCH
      let body: string | undefined;
      let bodyType: 'none' | 'raw' = 'none';

      if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
        if (endpoint.requestBodyExample !== undefined) {
          body = JSON.stringify(endpoint.requestBodyExample, null, 2);
          bodyType = 'raw';
        } else if (endpoint.requestBodySchema && endpoint.requestBodySchema.length > 0) {
          const generated = this._sampleGenerator.generateRequestBody(endpoint.requestBodySchema);
          body = JSON.stringify(generated, null, 2);
          bodyType = 'raw';
        }
      }

      this._collectionManager.saveRequest(
        collectionId,
        `${endpoint.method} ${endpoint.path}`,
        endpoint.method,
        url,
        headers,
        body,
        bodyType
      );
    }

    this._sendCollections();
    vscode.window.showInformationMessage(`Added ${endpoints.length} requests to collection`);
  }

  /**
   * Handles file browse request from webview.
   */
  private async _handleBrowseFile(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'OpenAPI Spec': ['json', 'yaml', 'yml', 'zip']
      },
      title: 'Select OpenAPI Specification'
    });

    if (uris && uris.length > 0) {
      // Show loading state
      this._view?.webview.postMessage({ type: 'loading', message: 'Loading specification...' });
      await this.loadSpec(uris[0].fsPath);
    }
  }

  /**
   * Loads an OpenAPI specification and updates the webview.
   */
  public async loadSpec(specPath: string): Promise<void> {
    try {
      console.log('[Pe4King] Loading spec from file:', specPath);
      this._specPath = specPath;
      this._currentSpecUrl = undefined; // Clear URL source when loading from file

      let content: string;

      // Handle ZIP archives
      if (specPath.toLowerCase().endsWith('.zip')) {
        content = this._extractSpecFromZip(specPath);
      } else {
        content = fs.readFileSync(specPath, 'utf-8');
      }

      const parser = new OpenAPIParser(content);
      const parsed = parser.parse();

      this._endpoints = parsed.endpoints;
      this._tree = this._treeBuilder.build(this._endpoints);
      this._baseUrl = parsed.baseUrl;

      console.log('[Pe4King] Parsed', this._endpoints.length, 'endpoints,', this._tree.length, 'folders');

      if (this._view) {
        // Reveal the view to ensure it's visible and active
        this._view.show?.(true);
        this._sendEndpoints();
      } else {
        console.log('[Pe4King] Warning: view not available');
      }

      vscode.window.showInformationMessage(
        `Loaded ${this._endpoints.length} endpoints from ${path.basename(specPath)}`
      );

    } catch (error) {
      console.error('[Pe4King] Error loading spec:', error);
      vscode.window.showErrorMessage(`Failed to load spec: ${(error as Error).message}`);
    }
  }

  /**
   * Extracts OpenAPI spec from ZIP archive.
   * Looks for json/yaml/yml files that look like OpenAPI specs.
   */
  private _extractSpecFromZip(zipPath: string): string {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    // Priority order for spec file names
    const specPatterns = [
      /openapi\.(json|yaml|yml)$/i,
      /swagger\.(json|yaml|yml)$/i,
      /api\.(json|yaml|yml)$/i,
      /spec\.(json|yaml|yml)$/i,
      /\.(json|yaml|yml)$/i
    ];

    // Find spec file by priority
    for (const pattern of specPatterns) {
      for (const entry of entries) {
        if (!entry.isDirectory && pattern.test(entry.entryName)) {
          const content = entry.getData().toString('utf-8');
          // Verify it looks like an OpenAPI spec
          if (content.includes('openapi') || content.includes('swagger') || content.includes('paths')) {
            console.log('[Pe4King] Found spec in ZIP:', entry.entryName);
            return content;
          }
        }
      }
    }

    throw new Error('No OpenAPI specification found in ZIP archive');
  }

  /**
   * Loads OpenAPI specification from URL.
   */
  public async loadSpecFromUrl(url: string, authHeader?: string): Promise<void> {
    await this._handleLoadUrl(url, authHeader);
  }

  /**
   * Handles URL loading request from webview.
   */
  private async _handleLoadUrl(url: string, authHeader?: string): Promise<void> {
    try {
      // Show loading state
      this._view?.webview.postMessage({ type: 'loading', message: 'Resolving specification URL...' });

      const options: { headers?: Record<string, string> } = {};
      if (authHeader) {
        options.headers = { 'Authorization': authHeader };
      }

      const result = await this._urlResolver.resolve(url, options);

      if (!result.success) {
        throw new Error(result.error || 'Failed to load specification');
      }

      this._currentSpecUrl = result.resolvedUrl;
      this._specPath = undefined; // Clear file path when loading from URL

      // Parse the spec content
      const parser = new OpenAPIParser(result.specContent!);
      const parsed = parser.parse();

      this._endpoints = parsed.endpoints;
      this._tree = this._treeBuilder.build(this._endpoints);
      this._baseUrl = parsed.baseUrl;
      this._authHeader = authHeader;

      if (this._view) {
        this._sendEndpoints();
      }

      vscode.window.showInformationMessage(
        `Loaded ${this._endpoints.length} endpoints from ${result.resolvedUrl}`
      );

    } catch (error) {
      this._view?.webview.postMessage({
        type: 'error',
        error: (error as Error).message
      });
      vscode.window.showErrorMessage(`Failed to load spec: ${(error as Error).message}`);
    }
  }

  /**
   * Opens request panel for an endpoint.
   */
  private _handleOpenRequest(endpointId: string): void {
    // Find endpoint by ID
    const endpoint = this._findEndpointById(endpointId);
    if (!endpoint) {
      vscode.window.showErrorMessage('Endpoint not found');
      return;
    }

    this._requestPanel.open({
      endpoint,
      baseUrl: this._baseUrl,
      authHeader: this._authHeader
    });
  }

  /**
   * Finds endpoint by ID in the tree.
   */
  private _findEndpointById(endpointId: string): EndpointInfo | undefined {
    for (const folder of this._tree) {
      for (const child of folder.children || []) {
        if (child.id === endpointId && child.endpoint) {
          return child.endpoint;
        }
      }
    }
    return undefined;
  }

  /**
   * Sends endpoints to webview.
   * Only sends minimal data needed for UI display (not full endpoint schemas).
   */
  private _sendEndpoints(): void {
    console.log('[Pe4King] Sending', this._tree.length, 'folders to webview');

    // Create lightweight tree for webview (without full endpoint data)
    const lightTree = this._tree.map(folder => ({
      id: folder.id,
      label: folder.label,
      type: folder.type,
      checked: folder.checked,
      children: folder.children?.map(child => ({
        id: child.id,
        label: child.label,
        type: child.type,
        checked: child.checked,
        method: child.method,
        path: child.path
        // Note: endpoint object is NOT included - too large for postMessage
      }))
    }));

    this._view?.webview.postMessage({
      type: 'setEndpoints',
      tree: lightTree
    });

    // Send source info
    const sourceUrl = this._currentSpecUrl || (this._specPath ? `file://${this._specPath}` : '');
    if (sourceUrl) {
      this._view?.webview.postMessage({
        type: 'sourceUrl',
        url: sourceUrl
      });
    }
  }

  /**
   * Handles generate request from webview.
   */
  private async _handleGenerate(message: {
    selectedIds: string[];
    framework: string;
    generateNegative: boolean;
    generateUniversal?: boolean;
  }): Promise<void> {
    try {
      // Filter endpoints by selected IDs
      const selectedEndpoints = this._getSelectedEndpoints(message.selectedIds);

      if (selectedEndpoints.length === 0) {
        throw new Error('No endpoints selected');
      }

      // Generate tests using the filtered endpoints
      const result = this._generator.generateForEndpoints(
        selectedEndpoints,
        {
          baseUrl: this._baseUrl,
          framework: message.framework as GeneratorConfig['framework'],
          generateNegativeTests: message.generateNegative,
          generateUniversalTests: message.generateUniversal ?? false
        }
      );

      if (!result.success) {
        throw new Error(result.errors?.join(', ') || 'Generation failed');
      }

      // Show save dialog for ZIP archive
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const defaultFileName = `pe4king-tests-${message.framework}-${timestamp}.zip`;

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultFileName),
        filters: { 'ZIP Archive': ['zip'] },
        title: 'Save Generated Tests'
      });

      if (!uri) {
        this._view?.webview.postMessage({ type: 'generationComplete' });
        return;
      }

      await this._createZipArchive(uri.fsPath, result.files);

      // Notify webview
      this._view?.webview.postMessage({ type: 'generationComplete' });

      // Show success message
      vscode.window.showInformationMessage(
        `Generated ${result.stats.totalTests} tests → ${path.basename(uri.fsPath)}`
      );

    } catch (error) {
      this._view?.webview.postMessage({
        type: 'error',
        error: (error as Error).message
      });

      vscode.window.showErrorMessage(`Generation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Creates a ZIP archive with generated files.
   */
  private _createZipArchive(zipPath: string, files: { filename: string; content: string }[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', (err: Error) => reject(err));

      archive.pipe(output);

      for (const file of files) {
        archive.append(file.content, { name: file.filename });
      }

      archive.finalize();
    });
  }

  /**
   * Gets endpoints matching selected IDs.
   */
  private _getSelectedEndpoints(selectedIds: string[]): EndpointInfo[] {
    const selectedSet = new Set(selectedIds);
    const endpoints: EndpointInfo[] = [];

    for (const folder of this._tree) {
      for (const child of folder.children || []) {
        if (selectedSet.has(child.id) && child.endpoint) {
          endpoints.push(child.endpoint);
        }
      }
    }

    return endpoints;
  }

  /**
   * Gets HTML content for webview.
   */
  private _getHtmlContent(): string {
    return generateWebviewHtml();
  }

  /**
   * Handles browsing for test archive.
   */
  private async _handleBrowseTestArchive(): Promise<void> {
    const defaultPath = vscode.workspace.workspaceFolders?.[0]?.uri;
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: defaultPath,
      filters: {
        'Test Archives': ['zip'],
        'All Files': ['*']
      },
      title: 'Select Tests Archive (.zip)'
    });

    if (uris && uris.length > 0) {
      this._view?.webview.postMessage({
        type: 'setEvaArchive',
        path: uris[0].fsPath
      });
    }
  }

  /**
   * Runs EVA analysis on test archive.
   */
  private async _handleRunEva(archivePath: string): Promise<void> {
    if (!archivePath) return;

    this._view?.webview.postMessage({ type: 'evaLoading' });

    try {
      // Get extension path to find eva-v2.js script
      const evaScript = path.join(this._extensionUri.fsPath, 'scripts', 'eva-v2.js');

      // Check if script exists
      if (!fs.existsSync(evaScript)) {
        throw new Error('EVA script not found. Please ensure scripts/eva-v2.js exists.');
      }

      // Run EVA v2 script with --json flag
      // Note: eva-v2.js exits with code 1 for scores < 60, so we catch and check for JSON output
      let result: string;
      try {
        result = execSync(`node "${evaScript}" "${archivePath}" --json`, {
          encoding: 'utf-8',
          timeout: 60000,
          cwd: this._extensionUri.fsPath
        });
      } catch (execError: unknown) {
        // execSync throws on non-zero exit, but output is in stdout
        const err = execError as { stdout?: string; message?: string };
        if (err.stdout && err.stdout.startsWith('{')) {
          result = err.stdout;
        } else {
          throw new Error(err.message || 'EVA execution failed');
        }
      }

      // Parse JSON result (eva-v2 outputs pure JSON with --json flag)
      const evaResult = JSON.parse(result.trim());

      this._view?.webview.postMessage({
        type: 'evaResult',
        result: evaResult
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._view?.webview.postMessage({
        type: 'evaError',
        error: errorMessage
      });
    }
  }

}

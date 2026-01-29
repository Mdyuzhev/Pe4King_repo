/**
 * Test Runner Panel for executing and displaying collection run results.
 */

import * as vscode from 'vscode';
import { CollectionManager, TestRunner, CollectionRunResult, RequestRunResult, SavedRequest } from '../collections';

export class RunnerPanelProvider {
  private panel: vscode.WebviewPanel | null = null;
  private runner: TestRunner;
  private collectionManager: CollectionManager;
  private currentCollectionId: string | null = null;
  private customOrder: SavedRequest[] = [];

  constructor(collectionManager: CollectionManager) {
    this.collectionManager = collectionManager;
    this.runner = new TestRunner();
    this.setupRunnerEvents();
  }

  /**
   * Setup runner event handlers.
   */
  private setupRunnerEvents(): void {
    this.runner.on('start', (result: CollectionRunResult) => {
      this.sendMessage({ type: 'runStart', result });
    });

    this.runner.on('request-start', (requestResult: RequestRunResult, index: number) => {
      this.sendMessage({ type: 'requestStart', requestResult, index });
    });

    this.runner.on('request-complete', (requestResult: RequestRunResult, index: number) => {
      this.sendMessage({ type: 'requestComplete', requestResult, index });
    });

    this.runner.on('progress', (result: CollectionRunResult) => {
      this.sendMessage({ type: 'progress', result });
    });

    this.runner.on('complete', (result: CollectionRunResult) => {
      this.sendMessage({ type: 'runComplete', result });
    });

    this.runner.on('stop', (result: CollectionRunResult) => {
      this.sendMessage({ type: 'runStopped', result });
    });
  }

  /**
   * Open runner panel for a collection.
   */
  open(collectionId: string): void {
    const collection = this.collectionManager.getCollection(collectionId);
    if (!collection) {
      vscode.window.showErrorMessage('Collection not found');
      return;
    }

    this.currentCollectionId = collectionId;
    this.customOrder = this.flattenRequests(collection);

    if (this.panel) {
      this.panel.reveal();
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'pe4kingRunner',
        `Run: ${collection.name}`,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = null;
        if (this.runner.running) {
          this.runner.stop();
        }
      });

      this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
    }

    this.panel.title = `Run: ${collection.name}`;
    this.panel.webview.html = this.getHtml(collection.name);

    // Send initial requests
    setTimeout(() => {
      this.sendMessage({
        type: 'init',
        collectionName: collection.name,
        requests: this.customOrder.map(r => ({
          id: r.id,
          name: r.name,
          method: r.method,
          url: r.url,
          hasTests: !!r.scripts?.test
        }))
      });
    }, 100);
  }

  /**
   * Handle messages from webview.
   */
  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'run':
        await this.runCollection(message as { type: string; delay?: number; stopOnError?: boolean });
        break;

      case 'stop':
        this.runner.stop();
        break;

      case 'reorder':
        this.handleReorder(message.order as string[]);
        break;

      case 'close':
        this.panel?.dispose();
        break;
    }
  }

  /**
   * Run the collection with current order.
   */
  private async runCollection(options: { delay?: number; stopOnError?: boolean }): Promise<void> {
    if (!this.currentCollectionId || this.customOrder.length === 0) return;

    const collection = this.collectionManager.getCollection(this.currentCollectionId);
    if (!collection) return;

    try {
      await this.runner.runRequests(
        this.customOrder,
        collection.id,
        collection.name,
        {
          delay: options.delay || 0,
          stopOnError: options.stopOnError || false
        }
      );
    } catch (err) {
      vscode.window.showErrorMessage(`Run failed: ${(err as Error).message}`);
    }
  }

  /**
   * Handle request reorder from drag-and-drop.
   */
  private handleReorder(newOrder: string[]): void {
    const orderMap = new Map(this.customOrder.map(r => [r.id, r]));
    this.customOrder = newOrder
      .map(id => orderMap.get(id))
      .filter((r): r is SavedRequest => r !== undefined);
  }

  /**
   * Flatten all requests from collection.
   */
  private flattenRequests(collection: { requests: SavedRequest[]; folders: { requests: SavedRequest[]; folders: unknown[] }[] }): SavedRequest[] {
    const requests: SavedRequest[] = [];
    requests.push(...collection.requests);

    const addFolderRequests = (folders: { requests: SavedRequest[]; folders: unknown[] }[]) => {
      for (const folder of folders) {
        requests.push(...folder.requests);
        if (folder.folders.length > 0) {
          addFolderRequests(folder.folders as { requests: SavedRequest[]; folders: unknown[] }[]);
        }
      }
    };

    addFolderRequests(collection.folders);
    return requests;
  }

  /**
   * Send message to webview.
   */
  private sendMessage(message: unknown): void {
    this.panel?.webview.postMessage(message);
  }

  /**
   * Get HTML content for runner panel.
   */
  private getHtml(collectionName: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Run Collection</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, system-ui, sans-serif);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      line-height: 1.5;
    }
    h2 { font-size: 1.3em; margin-bottom: 16px; }
    h3 { font-size: 1.1em; margin-bottom: 12px; color: var(--vscode-descriptionForeground); }

    /* Controls */
    .controls {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 16px;
      padding: 12px;
      background: var(--vscode-sideBar-background);
      border-radius: 6px;
    }
    .control-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .control-group label { font-size: 0.9em; }
    input[type="number"] {
      width: 70px;
      padding: 4px 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
    }
    input[type="checkbox"] {
      width: 16px;
      height: 16px;
    }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: inherit;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-weight: 500;
    }
    .btn-danger {
      background: #f93e3e;
      color: white;
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    /* Summary */
    .summary {
      display: flex;
      gap: 24px;
      margin-bottom: 16px;
      padding: 16px;
      background: var(--vscode-sideBar-background);
      border-radius: 6px;
    }
    .summary-item {
      text-align: center;
    }
    .summary-value {
      font-size: 2em;
      font-weight: 600;
    }
    .summary-label {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    .summary-passed { color: #49cc90; }
    .summary-failed { color: #f93e3e; }
    .summary-error { color: #fca130; }

    /* Progress */
    .progress-bar {
      height: 4px;
      background: var(--vscode-progressBar-background);
      border-radius: 2px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: var(--vscode-button-background);
      transition: width 0.3s ease;
    }

    /* Request List */
    .request-list {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      max-height: 400px;
      overflow-y: auto;
    }
    .request-item {
      display: flex;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      cursor: grab;
      transition: background 0.15s;
    }
    .request-item:last-child { border-bottom: none; }
    .request-item:hover { background: var(--vscode-list-hoverBackground); }
    .request-item.dragging {
      opacity: 0.5;
      background: var(--vscode-list-activeSelectionBackground);
    }
    .request-item.drag-over {
      border-top: 2px solid var(--vscode-focusBorder);
    }
    .drag-handle {
      cursor: grab;
      padding: 0 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 1.2em;
    }
    .request-index {
      width: 24px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
    .request-method {
      font-family: monospace;
      font-size: 0.8em;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 3px;
      margin-right: 8px;
      min-width: 50px;
      text-align: center;
    }
    .method-get { background: #61affe22; color: #61affe; }
    .method-post { background: #49cc9022; color: #49cc90; }
    .method-put { background: #fca13022; color: #fca130; }
    .method-patch { background: #50e3c222; color: #50e3c2; }
    .method-delete { background: #f93e3e22; color: #f93e3e; }
    .request-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .request-status {
      width: 80px;
      text-align: center;
      font-size: 0.85em;
      font-weight: 500;
    }
    .status-pending { color: var(--vscode-descriptionForeground); }
    .status-running { color: var(--vscode-textLink-foreground); }
    .status-passed { color: #49cc90; }
    .status-failed { color: #f93e3e; }
    .status-error { color: #fca130; }
    .status-skipped { color: var(--vscode-descriptionForeground); }
    .request-time {
      width: 70px;
      text-align: right;
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    .request-assertions {
      width: 100px;
      text-align: right;
      font-size: 0.85em;
    }
    .test-badge {
      font-size: 0.75em;
      padding: 2px 6px;
      border-radius: 3px;
      margin-left: 6px;
    }
    .test-badge.has-tests {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    /* Expandable test details */
    .request-row { cursor: pointer; }
    .request-details { display: none; padding: 12px 16px 12px 60px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); }
    .request-details.expanded { display: block; }
    .detail-section { margin-bottom: 12px; }
    .detail-title { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    .test-detail-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-family: monospace; font-size: 0.9em; }
    .test-detail-icon { width: 16px; }
    .test-detail-icon.pass { color: #49cc90; }
    .test-detail-icon.fail { color: #f93e3e; }
    .test-expand-icon { font-size: 10px; width: 12px; color: var(--vscode-descriptionForeground); }
    .expand-icon { margin-right: 4px; font-size: 0.8em; color: var(--vscode-descriptionForeground); transition: transform 0.2s; }
    .expand-icon.expanded { transform: rotate(90deg); }

    /* Spinner */
    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid var(--vscode-textLink-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
    }

    /* Result details */
    .result-details {
      margin-top: 16px;
      padding: 12px;
      background: var(--vscode-sideBar-background);
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.9em;
      max-height: 200px;
      overflow-y: auto;
    }
    .assertion-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
    }
    .assertion-icon { font-size: 1.1em; }
    .assertion-passed { color: #49cc90; }
    .assertion-failed { color: #f93e3e; }
  </style>
</head>
<body>
  <h2>Collection Runner</h2>
  <h3 id="collection-name">${collectionName}</h3>

  <div class="controls">
    <button id="btn-run" class="btn-primary" onclick="run()">
      Run Collection
    </button>
    <button id="btn-stop" class="btn-danger" onclick="stop()" disabled>
      Stop
    </button>

    <div class="control-group">
      <label for="delay">Delay (ms):</label>
      <input type="number" id="delay" value="0" min="0" max="10000" step="100">
    </div>

    <div class="control-group">
      <input type="checkbox" id="stop-on-error">
      <label for="stop-on-error">Stop on error</label>
    </div>
  </div>

  <div class="summary" id="summary" style="display: none;">
    <div class="summary-item">
      <div class="summary-value" id="total-count">0</div>
      <div class="summary-label">Total</div>
    </div>
    <div class="summary-item summary-passed">
      <div class="summary-value" id="passed-count">0</div>
      <div class="summary-label">Passed</div>
    </div>
    <div class="summary-item summary-failed">
      <div class="summary-value" id="failed-count">0</div>
      <div class="summary-label">Failed</div>
    </div>
    <div class="summary-item summary-error">
      <div class="summary-value" id="error-count">0</div>
      <div class="summary-label">Errors</div>
    </div>
    <div class="summary-item">
      <div class="summary-value" id="total-time">0ms</div>
      <div class="summary-label">Total Time</div>
    </div>
  </div>

  <div class="progress-bar" id="progress-bar" style="display: none;">
    <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
  </div>

  <div class="request-list" id="request-list">
    <div class="empty-state">Loading requests...</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let requests = [];
    let isRunning = false;
    let draggedItem = null;

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'init':
          requests = message.requests;
          renderRequests();
          break;
        case 'runStart':
          isRunning = true;
          updateControls();
          document.getElementById('summary').style.display = 'flex';
          document.getElementById('progress-bar').style.display = 'block';
          break;
        case 'requestStart':
          updateRequestStatus(message.index, 'running');
          break;
        case 'requestComplete':
          updateRequestResult(message.index, message.requestResult);
          break;
        case 'progress':
          updateProgress(message.result);
          break;
        case 'runComplete':
        case 'runStopped':
          isRunning = false;
          updateControls();
          updateProgress(message.result);
          break;
      }
    });

    // Store results for expansion
    let requestResults = {};

    function renderRequests() {
      const container = document.getElementById('request-list');
      if (requests.length === 0) {
        container.innerHTML = '<div class="empty-state">No requests in collection</div>';
        return;
      }

      container.innerHTML = requests.map((req, idx) => \`
        <div class="request-item request-row" data-id="\${req.id}" data-index="\${idx}"
             draggable="true"
             ondragstart="handleDragStart(event)"
             ondragend="handleDragEnd(event)"
             ondragover="handleDragOver(event)"
             ondrop="handleDrop(event)"
             onclick="toggleDetails(\${idx}, event)">
          <span class="expand-icon" id="expand-\${idx}">▶</span>
          <span class="drag-handle">⋮⋮</span>
          <span class="request-index">\${idx + 1}</span>
          <span class="request-method method-\${req.method.toLowerCase()}">\${req.method}</span>
          <span class="request-name">\${req.name}</span>
          \${req.hasTests ? '<span class="test-badge has-tests">Tests</span>' : ''}
          <span class="request-status status-pending" id="status-\${idx}">Pending</span>
          <span class="request-time" id="time-\${idx}">-</span>
          <span class="request-assertions" id="assertions-\${idx}">-</span>
        </div>
        <div class="request-details" id="details-\${idx}">
          <div class="detail-section">
            <div class="detail-title">Test Results</div>
            <div id="tests-detail-\${idx}">No results yet</div>
          </div>
        </div>
      \`).join('');
    }

    function toggleDetails(idx, event) {
      // Ignore clicks on drag handle
      if (event.target.classList.contains('drag-handle')) return;

      const details = document.getElementById('details-' + idx);
      const expandIcon = document.getElementById('expand-' + idx);

      if (details.classList.contains('expanded')) {
        details.classList.remove('expanded');
        expandIcon.classList.remove('expanded');
      } else {
        details.classList.add('expanded');
        expandIcon.classList.add('expanded');
      }
    }

    function updateRequestStatus(index, status) {
      const statusEl = document.getElementById('status-' + index);
      if (!statusEl) return;

      statusEl.className = 'request-status status-' + status;
      if (status === 'running') {
        statusEl.innerHTML = '<span class="spinner"></span>';
      } else {
        statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      }
    }

    function updateRequestResult(index, result) {
      updateRequestStatus(index, result.status);
      requestResults[index] = result;

      const timeEl = document.getElementById('time-' + index);
      if (timeEl && result.responseTime) {
        timeEl.textContent = result.responseTime + 'ms';
      }

      const assertionsEl = document.getElementById('assertions-' + index);
      if (assertionsEl && result.assertions) {
        const { passed, failed } = result.assertions;
        if (passed > 0 || failed > 0) {
          assertionsEl.innerHTML = \`
            <span style="color: #49cc90">\${passed}</span> /
            <span style="color: #f93e3e">\${failed}</span>
          \`;
        }
      }

      // Update test details section
      renderTestDetails(index, result);
    }

    function renderTestDetails(index, result) {
      const container = document.getElementById('tests-detail-' + index);
      if (!container) return;

      let html = '';

      // Python script test results (from assertions.tests)
      if (result.assertions && result.assertions.tests && result.assertions.tests.length > 0) {
        result.assertions.tests.forEach((t, i) => {
          const icon = t.passed ? '✓' : '✗';
          const iconClass = t.passed ? 'pass' : 'fail';
          const testId = 'runner-test-' + index + '-' + i;
          html += '<div class="test-detail-item" onclick="toggleRunnerTest(\\'' + testId + '\\')" style="cursor: pointer;">';
          html += '<span class="test-expand-icon" id="expand-' + testId + '">▶</span>';
          html += '<span class="test-detail-icon ' + iconClass + '">' + icon + '</span>';
          html += '<span style="flex: 1;">' + escapeHtml(t.name) + '</span>';
          html += '</div>';
          html += '<div class="test-debug-detail" id="' + testId + '" style="display: none; padding: 8px 8px 8px 40px; background: var(--vscode-editor-background); font-size: 0.85em; border-radius: 4px; margin: 4px 0;">';
          if (t.actual !== undefined && t.expected !== undefined) {
            html += '<div>Expected: <span style="color: #49cc90;">' + escapeHtml(t.expected) + '</span></div>';
            html += '<div>Actual: <span style="color: ' + (t.passed ? '#49cc90' : '#f93e3e') + ';">' + escapeHtml(t.actual) + '</span></div>';
          } else {
            html += '<div>Result: <span style="color: ' + (t.passed ? '#49cc90' : '#f93e3e') + '">' + (t.passed ? 'PASSED' : 'FAILED') + '</span></div>';
          }
          html += '</div>';
        });
      }

      // Response info
      if (result.httpStatus) {
        if (html) html += '<div style="margin-top: 12px;"></div>';
        html += '<div style="font-size: 0.85em; color: var(--vscode-descriptionForeground);">Response: ' + result.httpStatus + ' (' + (result.responseTime || 0) + 'ms)</div>';
      }

      // Error
      if (result.error) {
        html += '<div style="margin-top: 8px; color: #f93e3e;">' + escapeHtml(result.error) + '</div>';
      }

      container.innerHTML = html || '<div style="color: var(--vscode-descriptionForeground);">No test results</div>';
    }

    function toggleRunnerTest(testId) {
      const debugEl = document.getElementById(testId);
      const expandIcon = document.getElementById('expand-' + testId);
      if (!debugEl) return;

      if (debugEl.style.display === 'none') {
        debugEl.style.display = 'block';
        if (expandIcon) expandIcon.textContent = '▼';
      } else {
        debugEl.style.display = 'none';
        if (expandIcon) expandIcon.textContent = '▶';
      }
    }

    function escapeHtml(str) {
      if (typeof str !== 'string') return String(str);
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function updateProgress(result) {
      document.getElementById('total-count').textContent = result.totalRequests;
      document.getElementById('passed-count').textContent = result.passed;
      document.getElementById('failed-count').textContent = result.failed;
      document.getElementById('error-count').textContent = result.errors;
      document.getElementById('total-time').textContent = result.totalTime + 'ms';

      const percent = (result.completed / result.totalRequests) * 100;
      document.getElementById('progress-fill').style.width = percent + '%';
    }

    function updateControls() {
      document.getElementById('btn-run').disabled = isRunning;
      document.getElementById('btn-stop').disabled = !isRunning;
      document.getElementById('delay').disabled = isRunning;
      document.getElementById('stop-on-error').disabled = isRunning;

      // Disable drag during run
      document.querySelectorAll('.request-item').forEach(el => {
        el.draggable = !isRunning;
        el.querySelector('.drag-handle').style.opacity = isRunning ? 0.3 : 1;
      });
    }

    function run() {
      const delay = parseInt(document.getElementById('delay').value) || 0;
      const stopOnError = document.getElementById('stop-on-error').checked;

      // Reset UI
      requests.forEach((_, idx) => {
        updateRequestStatus(idx, 'pending');
        document.getElementById('time-' + idx).textContent = '-';
        document.getElementById('assertions-' + idx).textContent = '-';
      });

      vscode.postMessage({ type: 'run', delay, stopOnError });
    }

    function stop() {
      vscode.postMessage({ type: 'stop' });
    }

    // Drag and drop handlers
    function handleDragStart(e) {
      if (isRunning) return;
      draggedItem = e.target;
      e.target.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    }

    function handleDragEnd(e) {
      e.target.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      draggedItem = null;
    }

    function handleDragOver(e) {
      if (isRunning) return;
      e.preventDefault();
      const item = e.target.closest('.request-item');
      if (item && item !== draggedItem) {
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        item.classList.add('drag-over');
      }
    }

    function handleDrop(e) {
      if (isRunning) return;
      e.preventDefault();
      const target = e.target.closest('.request-item');
      if (!target || !draggedItem || target === draggedItem) return;

      const container = document.getElementById('request-list');
      const items = Array.from(container.querySelectorAll('.request-item'));
      const draggedIdx = items.indexOf(draggedItem);
      const targetIdx = items.indexOf(target);

      // Reorder requests array
      const [removed] = requests.splice(draggedIdx, 1);
      requests.splice(targetIdx, 0, removed);

      // Re-render
      renderRequests();

      // Notify extension
      vscode.postMessage({
        type: 'reorder',
        order: requests.map(r => r.id)
      });

      target.classList.remove('drag-over');
    }
  </script>
</body>
</html>`;
  }
}

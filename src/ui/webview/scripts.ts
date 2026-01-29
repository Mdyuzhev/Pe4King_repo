/**
 * JavaScript for Pe4King webview.
 */

export const WEBVIEW_SCRIPTS = `
const vscode = acquireVsCodeApi();

// SVG Icons
const ICONS = {
  folder: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 14.5 4H7.414l-1-1A2 2 0 0 0 4.914 2H1.5z"/></svg></span>',
  folderOpen: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764a1.5 1.5 0 0 1 1.06.44l.707.707H13.5A1.5 1.5 0 0 1 15 4.5v1H2.5A1.5 1.5 0 0 0 1 7v-3.5zm.646 4.354A.5.5 0 0 1 2 7.5h11a.5.5 0 0 1 .49.598l-1 5A.5.5 0 0 1 12 13.5H2.5a.5.5 0 0 1-.49-.402l-1-5a.5.5 0 0 1 .136-.244z"/></svg></span>',
  file: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5L9.5 0H4zm5.5 0v3a1.5 1.5 0 0 0 1.5 1.5h3L9.5 0z"/></svg></span>',
  key: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.5 0a5.5 5.5 0 0 0-4.97 7.862l-4.823 4.83A1 1 0 0 0 0 13.4V15a1 1 0 0 0 1 1h1.6a1 1 0 0 0 .708-.293l.293-.293H5v-1.5a.5.5 0 0 1 .5-.5H7v-1.5a.5.5 0 0 1 .5-.5h.585l.862-.863A5.5 5.5 0 1 0 10.5 0zm1.5 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/></svg></span>',
  python: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M7.8 1C4.5 1 4.6 2.4 4.6 2.4l.003 1.5H8v.4H3s-2.3-.2-2.3 3.3 2 3.4 2 3.4h1.2V9.4s-.1-2 2-2h3.4s1.9 0 1.9-1.8V2.8S11.6 1 7.8 1zm-1.9 1c.3 0 .6.3.6.6s-.3.6-.6.6-.6-.3-.6-.6.3-.6.6-.6z"/><path d="M8.2 15c3.3 0 3.2-1.4 3.2-1.4l-.003-1.5H8v-.4h5s2.3.2 2.3-3.3-2-3.4-2-3.4h-1.2v1.6s.1 2-2 2H6.7s-1.9 0-1.9 1.8v2.8S4.4 15 8.2 15zm1.9-1c-.3 0-.6-.3-.6-.6s.3-.6.6-.6.6.3.6.6-.3.6-.6.6z"/></svg></span>',
  java: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 9.5c0 .3.2.5.4.6.3.1.6.2 1 .2.3 0 .6 0 .9-.1.3-.1.4-.3.4-.6 0-.2-.1-.4-.3-.5-.2-.1-.5-.2-.9-.3-.6-.1-1.1-.3-1.4-.5s-.5-.6-.5-1c0-.5.2-.9.6-1.2.4-.3.9-.4 1.6-.4s1.2.1 1.6.4c.4.3.6.7.6 1.2h-1c0-.3-.1-.5-.3-.6-.2-.2-.5-.2-.9-.2-.3 0-.6.1-.8.2-.2.1-.3.3-.3.5 0 .2.1.3.3.4.2.1.5.2.9.3.6.1 1.1.3 1.4.5.3.3.5.6.5 1.1 0 .5-.2.9-.6 1.2-.4.3-1 .4-1.7.4-.7 0-1.3-.2-1.7-.5-.4-.3-.6-.7-.6-1.3h1.1zM12.3 5.4c-.2-.2-.5-.3-.8-.3-.4 0-.7.1-.9.4-.2.3-.3.6-.3 1.1v3.2h-1V4.6h1v.6c.3-.5.8-.7 1.4-.7.5 0 .9.2 1.2.5.3.3.4.8.4 1.4v3.4h-1V6.5c0-.5-.1-.8-.3-1.1zM4.5 13c.8.5 2 .9 3.5.9s2.7-.3 3.5-.9c-.8.3-2 .5-3.5.5s-2.7-.2-3.5-.5zM11.5 12c-.5.4-1.5.7-3.5.7s-3-.3-3.5-.7c.5.6 2 1 3.5 1s3-.4 3.5-1z"/></svg></span>',
  postman: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"/><path d="M10.5 5.5L8 8l-2 2v1.5L8.5 9l2.5-2.5-.5-1z"/><path d="M5 7l1-1 2.5 2.5L7 10 5 7z"/></svg></span>',
  collection: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 3A1.5 1.5 0 0 0 1 4.5v.793A.5.5 0 0 0 1 5.5v5A1.5 1.5 0 0 0 2.5 12h11a1.5 1.5 0 0 0 1.5-1.5v-5a.5.5 0 0 0 0-.207V4.5A1.5 1.5 0 0 0 13.5 3h-11zm0 1h11a.5.5 0 0 1 .5.5V5H2v-.5a.5.5 0 0 1 .5-.5zm-.5 3h12v3.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V7z"/></svg></span>',
  chevronDown: '<span class="icon icon-sm"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg></span>',
  add: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/></svg></span>',
  play: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5a.5.5 0 0 1 .764-.424l8.5 5.5a.5.5 0 0 1 0 .848l-8.5 5.5A.5.5 0 0 1 4 13.5v-11z"/></svg></span>',
  code: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.854 4.854a.5.5 0 1 0-.708-.708l-3.5 3.5a.5.5 0 0 0 0 .708l3.5 3.5a.5.5 0 0 0 .708-.708L2.707 8l3.147-3.146zm4.292 0a.5.5 0 0 1 .708-.708l3.5 3.5a.5.5 0 0 1 0 .708l-3.5 3.5a.5.5 0 0 1-.708-.708L13.293 8l-3.147-3.146z"/></svg></span>',
  upload: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/></svg></span>',
  trash: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg></span>',
  addFolder: '<span class="icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a.5.5 0 0 0 0-1h-8a.5.5 0 0 1-.5-.5v-7h13a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 14.5 4H7.414l-1-1A2 2 0 0 0 4.914 2H1.5zm11 7a.5.5 0 0 1 .5.5v2h2a.5.5 0 0 1 0 1h-2v2a.5.5 0 0 1-1 0v-2h-2a.5.5 0 0 1 0-1h2v-2a.5.5 0 0 1 .5-.5z"/></svg></span>',
};

let state = {
  tree: [],
  selectedCount: 0,
  totalCount: 0,
  framework: 'pytest',
  generateNegative: true,
  generateUniversal: true,
  searchQuery: '',
  urlInput: '',
  showAuth: false,
  authHeader: '',
  isLoading: false,
  loadingMessage: '',
  sourceUrl: '',
  activeTab: 'endpoints',
  collections: [],
  expandedCollections: new Set(),
  snippetLibrary: {},
  snippetPanelVisible: false,
  snippetTargetCollectionId: null,
  snippetTargetRequestId: null,
  evaResult: null,
  evaLoading: false,
  evaArchivePath: null
};

function init() {
  render();
  vscode.postMessage({ type: 'ready' });
}

window.addEventListener('message', event => {
  const message = event.data;
  switch (message.type) {
    case 'setEndpoints':
      try {
        state.tree = message.tree || [];
        state.totalCount = countEndpoints(state.tree);
        state.selectedCount = state.totalCount;
        state.isLoading = false;
        render();
      } catch (err) {
        console.error('[Webview] Error processing setEndpoints:', err);
        state.isLoading = false;
        render();
      }
      break;
    case 'generationComplete':
      enableUI();
      break;
    case 'loading':
      state.isLoading = true;
      state.loadingMessage = message.message || 'Loading...';
      render();
      break;
    case 'sourceUrl':
      state.sourceUrl = message.url || '';
      break;
    case 'error':
      state.isLoading = false;
      showError(message.error);
      render();
      break;
    case 'setCollections':
      state.collections = message.collections || [];
      render();
      break;
    case 'expandCollection':
      state.expandedCollections.add(message.collectionId);
      render();
      break;
    case 'setSnippetLibrary':
      state.snippetLibrary = message.library || {};
      render();
      break;
    case 'exportPreview':
      showExportPreview(message.code);
      break;
    case 'evaLoading':
      state.evaLoading = true;
      state.evaResult = null;
      render();
      break;
    case 'evaResult':
      state.evaLoading = false;
      state.evaResult = message.result;
      render();
      break;
    case 'evaError':
      state.evaLoading = false;
      state.evaResult = { error: message.error };
      render();
      break;
    case 'setEvaArchive':
      state.evaArchivePath = message.path;
      render();
      break;
  }
});

function countEndpoints(tree) {
  let count = 0;
  for (const folder of tree) { count += folder.children?.length || 0; }
  return count;
}

function countSelected(tree) {
  let count = 0;
  for (const folder of tree) {
    for (const child of folder.children || []) {
      if (child.checked) count++;
    }
  }
  return count;
}

function render() {
  try {
    renderInner();
  } catch (err) {
    console.error('[Webview] Render error:', err);
    document.getElementById('app').innerHTML = '<div class="empty-state">Error rendering: ' + err.message + '</div>';
  }
}

function renderInner() {
  const app = document.getElementById('app');
  const loadingHtml = state.isLoading ? \`<div class="loading-overlay"><div class="spinner"></div><div>\${state.loadingMessage}</div></div>\` : '';
  const tabsHtml = \`<div class="tabs"><button class="tab \${state.activeTab === 'endpoints' ? 'active' : ''}" onclick="switchTab('endpoints')">Endpoints</button><button class="tab \${state.activeTab === 'collections' ? 'active' : ''}" onclick="switchTab('collections')">Collections (\${state.collections.length})</button></div>\`;

  if (state.activeTab === 'collections') {
    app.innerHTML = tabsHtml + renderCollectionsTab() + loadingHtml;
    return;
  }

  if (state.tree.length === 0 && !state.isLoading) {
    app.innerHTML = tabsHtml + renderEmptyState() + loadingHtml;
    return;
  }

  state.selectedCount = countSelected(state.tree);
  app.innerHTML = tabsHtml + renderEndpointsTab() + loadingHtml;
}

function renderEmptyState() {
  return \`<div style="text-align: left;">
    <p style="margin-bottom: 16px; color: var(--vscode-foreground);">Load an OpenAPI specification to generate tests.</p>
    <div class="url-section">
      <input type="text" class="url-input \${state.urlInput ? 'has-url' : ''}" placeholder="Paste Swagger URL or spec URL..." value="\${state.urlInput}" oninput="handleUrlInput(this.value)" onkeypress="if(event.key==='Enter') loadFromUrl()">
      <button class="btn-secondary btn-browse" onclick="browseFile()" title="Open file">\${ICONS.folderOpen}</button>
      <button class="auth-toggle \${state.showAuth ? 'active' : ''}" onclick="toggleAuth()" title="Add authorization header">\${ICONS.key}</button>
      <button class="btn-primary btn-load" onclick="loadFromUrl()" \${!state.urlInput ? 'disabled' : ''}>Load</button>
    </div>
    <div class="auth-section \${state.showAuth ? 'visible' : ''}">
      <input type="text" class="auth-input" placeholder="Authorization header (e.g., Bearer token123...)" value="\${state.authHeader}" oninput="handleAuthInput(this.value)">
    </div>
    <p style="margin-top: 24px; font-size: 0.9em; color: var(--vscode-descriptionForeground);">Or right-click on a .json/.yaml file and select<br>"Pe4King: Select & Generate Tests"</p>
    <p style="margin-top: 16px; font-size: 0.85em; color: var(--vscode-descriptionForeground);"><strong>Supported URLs:</strong><br>• Direct spec: /v3/api-docs, /swagger.json<br>• Swagger UI: /swagger-ui/<br>• Base URL (auto-detects spec)</p>

    <div class="eva-section">
      <div class="eva-header">
        <span class="eva-title">EVA — Test Quality Analysis</span>
      </div>
      <p style="font-size: 0.85em; color: var(--vscode-descriptionForeground); margin: 8px 0;">Upload test archive (.zip) to evaluate quality</p>
      <div class="eva-controls">
        <button class="btn-secondary btn-eva-upload" onclick="browseTestArchive()" title="Select test archive">\${ICONS.upload} Select Archive</button>
        <button class="btn-primary btn-eva-run" onclick="runEva()" \${!state.evaArchivePath ? 'disabled' : ''}>Run EVA</button>
      </div>
      <div id="evaArchiveName" class="eva-archive-name">\${state.evaArchivePath ? state.evaArchivePath.split(/[\\\\/]/).pop() : ''}</div>
      \${renderEvaResult()}
    </div>
  </div>\`;
}

function renderEvaResult() {
  if (state.evaLoading) {
    return '<div class="eva-result eva-loading"><div class="spinner"></div> Analyzing tests...</div>';
  }
  if (!state.evaResult) return '';
  if (state.evaResult.error) {
    return '<div class="eva-result eva-error">Error: ' + state.evaResult.error + '</div>';
  }
  const r = state.evaResult;
  const gradeColors = { S: '#a855f7', A: '#22c55e', B: '#06b6d4', C: '#eab308', D: '#f97316', F: '#ef4444' };
  const gradeColor = gradeColors[r.grade] || '#888';
  const depthLevel = Math.ceil((r.oracleDepth || 0) / 25);
  const hasIssues = !r.compilation?.pass || r.antiPatterns?.found?.length > 0 || r.copyPaste?.detected || r.badNaming?.count > 0;

  return \`<div class="eva-result">
    <div class="eva-score-header">
      <span class="eva-score" style="color: \${gradeColor}">\${r.total}</span>
      <span class="eva-grade" style="background: \${gradeColor}">[\${r.grade}]</span>
      \${r.version ? '<span class="eva-version">v' + r.version + '</span>' : ''}
    </div>
    <div class="eva-grade-desc">\${r.gradeDesc || ''}</div>
    \${r.baseTotal !== undefined ? '<div class="eva-calc">Base: ' + r.baseTotal + ' - Penalties: ' + (r.totalPenalty || 0) + (r.compilation?.multiplier < 1 ? ' × 0.5' : '') + '</div>' : ''}

    \${hasIssues ? '<div class="eva-issues">' + renderEvaIssues(r) + '</div>' : ''}

    <div class="eva-metrics">
      <div class="eva-metric"><span class="metric-label">Files</span><span class="metric-value">\${r.summary.files}</span></div>
      <div class="eva-metric"><span class="metric-label">Tests</span><span class="metric-value">\${r.summary.tests}</span></div>
      <div class="eva-metric"><span class="metric-label">Strong</span><span class="metric-value">\${r.summary.strong}</span></div>
      <div class="eva-metric"><span class="metric-label">Weak</span><span class="metric-value">\${r.summary.weak}</span></div>
    </div>
    <div class="eva-coverage">
      <div class="eva-coverage-item"><span class="coverage-label">Negative</span><span class="coverage-value">\${r.negativeCovered}/\${r.negativeTotal}</span></div>
      <div class="eva-coverage-item"><span class="coverage-label">Edge Cases</span><span class="coverage-value">\${r.edgeCovered}/\${r.edgeTotal}</span></div>
      <div class="eva-coverage-item"><span class="coverage-label">Depth</span><span class="coverage-value">L\${depthLevel} (\${r.oracleDepth}/100)</span></div>
    </div>
    <div class="eva-bars">
      \${renderEvaBar('Oracle', r.scores.oracle, '30%')}
      \${renderEvaBar('Mutation', r.scores.mutation, '25%')}
      \${renderEvaBar('Negative', r.scores.negative, '20%')}
      \${renderEvaBar('Edge', r.scores.edge, '15%')}
      \${renderEvaBar('Structure', r.scores.structure, '10%')}
    </div>
    \${r.recommendations?.length ? '<div class="eva-recommendations"><strong>Рекомендации:</strong><ul>' + r.recommendations.map(rec => '<li>' + rec + '</li>').join('') + '</ul></div>' : ''}
  </div>\`;
}

function renderEvaIssues(r) {
  let html = '';

  // Compilation errors
  if (r.compilation && !r.compilation.pass) {
    html += '<div class="eva-issue eva-critical"><span class="issue-icon">⚠️</span><span class="issue-title">Compilation × 0.5</span>';
    html += '<div class="issue-details">' + r.compilation.errors.map(e => e.name + ' (×' + e.count + ')').join(', ') + '</div></div>';
  }

  // Anti-patterns
  if (r.antiPatterns?.found?.length > 0) {
    html += '<div class="eva-issue eva-warning"><span class="issue-icon">🚫</span><span class="issue-title">Anti-patterns -' + r.antiPatterns.totalPenalty + '</span>';
    html += '<div class="issue-details">' + r.antiPatterns.found.slice(0, 4).map(a => a.name).join(', ') + '</div></div>';
  }

  // Copy-paste
  if (r.copyPaste?.detected) {
    html += '<div class="eva-issue eva-warning"><span class="issue-icon">📋</span><span class="issue-title">Copy-paste -' + r.copyPaste.penalty + '</span>';
    html += '<div class="issue-details">' + r.copyPaste.sequence + ' sequential (' + r.copyPaste.prefix + '*)</div></div>';
  }

  // Bad naming
  if (r.badNaming?.count > 0) {
    html += '<div class="eva-issue eva-info"><span class="issue-icon">📛</span><span class="issue-title">Bad naming -' + r.badNaming.penalty + '</span>';
    html += '<div class="issue-details">' + r.badNaming.found.slice(0, 4).join(', ') + '</div></div>';
  }

  return html;
}

function renderEvaBar(label, score, weight) {
  const pct = Math.round(score);
  return \`<div class="eva-bar-row">
    <span class="eva-bar-label">\${label}</span>
    <div class="eva-bar"><div class="eva-bar-fill" style="width: \${pct}%"></div></div>
    <span class="eva-bar-value">\${pct}</span>
    <span class="eva-bar-weight">\${weight}</span>
  </div>\`;
}

function browseTestArchive() {
  vscode.postMessage({ type: 'browseTestArchive' });
}

function runEva() {
  if (!state.evaArchivePath) return;
  vscode.postMessage({ type: 'runEva', archivePath: state.evaArchivePath });
}

function renderEndpointsTab() {
  const sourceInfo = state.sourceUrl
    ? \`<div class="source-info"><span>\${ICONS.file} \${state.sourceUrl}</span><button class="btn-reset" onclick="resetSpec()" title="Load different spec">✕</button></div>\`
    : \`<div class="source-info"><span>\${ICONS.file} Local file</span><button class="btn-reset" onclick="resetSpec()" title="Load different spec">✕</button></div>\`;

  return \`\${sourceInfo}
    <div class="search-container"><input type="text" class="search-input" placeholder="Search endpoints..." value="\${state.searchQuery}" oninput="handleSearch(this.value)"></div>
    <div class="config-section">
      <div class="config-item"><input type="checkbox" id="neg" \${state.generateNegative ? 'checked' : ''} onchange="handleNegativeChange(this.checked)"><label for="neg">Negative tests</label></div>
      <div class="config-item"><input type="checkbox" id="univ" \${state.generateUniversal ? 'checked' : ''} onchange="handleUniversalChange(this.checked)"><label for="univ">Security tests</label></div>
    </div>
    <div class="toolbar">
      <div class="toolbar-buttons">
        <button class="btn-secondary" onclick="selectAll()">All</button>
        <button class="btn-secondary" onclick="deselectAll()">None</button>
        <button class="btn-secondary" onclick="toggleAllFolders()">Toggle</button>
      </div>
      <div class="toolbar-info">Selected: <strong>\${state.selectedCount}</strong> / \${state.totalCount}</div>
    </div>
    <div class="tree-container">\${renderTree(state.tree)}</div>
    <div class="generate-section">
      <button class="btn-gen btn-pytest" onclick="generate('pytest')" \${state.selectedCount === 0 ? 'disabled' : ''} title="Generate pytest tests">\${ICONS.python} pytest</button>
      <button class="btn-gen btn-java" onclick="generate('rest-assured')" \${state.selectedCount === 0 ? 'disabled' : ''} title="Generate REST Assured tests">\${ICONS.java} REST Assured</button>
      <button class="btn-gen btn-postman" onclick="generate('postman')" \${state.selectedCount === 0 ? 'disabled' : ''} title="Export Postman collection">\${ICONS.postman} Postman</button>
      <button class="btn-gen btn-collection" onclick="addToCollection()" \${state.selectedCount === 0 ? 'disabled' : ''} title="Add to collection">\${ICONS.collection} Collection</button>
    </div>\`;
}

function renderTree(tree) {
  return tree.map(folder => \`
    <div class="tree-node tree-folder" data-folder-id="\${folder.id}">
      <div class="tree-folder-header" onclick="toggleFolder('\${folder.id}')">
        <span class="tree-folder-icon">\${ICONS.chevronDown}</span>
        <span class="tree-folder-label">\${folder.label}</span>
        <input type="checkbox" class="tree-folder-checkbox" \${isFolderChecked(folder) ? 'checked' : ''} onclick="event.stopPropagation(); toggleFolderCheck('\${folder.id}')">
      </div>
      <div class="tree-children">\${(folder.children || []).map(ep => renderEndpoint(ep, folder.id)).join('')}</div>
    </div>
  \`).join('');
}

function renderEndpoint(endpoint, folderId) {
  const methodClass = 'method-' + endpoint.method.toLowerCase();
  const isHidden = state.searchQuery && !endpoint.path.toLowerCase().includes(state.searchQuery.toLowerCase()) && !endpoint.method.toLowerCase().includes(state.searchQuery.toLowerCase());
  return \`<div class="tree-node tree-endpoint \${isHidden ? 'hidden' : ''}" data-endpoint-id="\${endpoint.id}">
    <input type="checkbox" class="tree-endpoint-checkbox" \${endpoint.checked ? 'checked' : ''} onchange="toggleEndpoint('\${folderId}', '\${endpoint.id}')">
    <span class="tree-endpoint-method \${methodClass}">\${endpoint.method}</span>
    <span class="tree-endpoint-path">\${endpoint.path}</span>
    <button class="btn-send" onclick="event.stopPropagation(); openRequest('\${endpoint.id}')" title="Send Request">\${ICONS.play}</button>
  </div>\`;
}

function isFolderChecked(folder) { return folder.children?.every(c => c.checked) || false; }
function handleSearch(query) { state.searchQuery = query; render(); }
function handleNegativeChange(checked) { state.generateNegative = checked; }
function handleUniversalChange(checked) { state.generateUniversal = checked; }
function handleUrlInput(value) {
  state.urlInput = value;
  const btn = document.querySelector('.btn-load');
  if (btn) btn.disabled = !value;
  const input = document.querySelector('.url-input');
  if (input) input.classList.toggle('has-url', !!value);
}
function handleAuthInput(value) { state.authHeader = value; }
function toggleAuth() { state.showAuth = !state.showAuth; render(); }
function loadFromUrl() {
  if (!state.urlInput) return;
  state.isLoading = true;
  state.loadingMessage = 'Loading specification...';
  render();
  vscode.postMessage({ type: 'loadUrl', url: state.urlInput, authHeader: state.authHeader || undefined });
}
function browseFile() { vscode.postMessage({ type: 'browseFile' }); }
function openRequest(endpointId) { vscode.postMessage({ type: 'openRequest', endpointId }); }
function toggleFolder(folderId) { document.querySelector('[data-folder-id="' + folderId + '"]').classList.toggle('collapsed'); }
function toggleAllFolders() {
  const folders = document.querySelectorAll('.tree-folder');
  const allCollapsed = Array.from(folders).every(f => f.classList.contains('collapsed'));
  folders.forEach(f => allCollapsed ? f.classList.remove('collapsed') : f.classList.add('collapsed'));
}
function toggleFolderCheck(folderId) {
  const folder = state.tree.find(f => f.id === folderId);
  if (!folder) return;
  const newState = !isFolderChecked(folder);
  folder.children?.forEach(c => { c.checked = newState; });
  render();
}
function toggleEndpoint(folderId, endpointId) {
  const folder = state.tree.find(f => f.id === folderId);
  if (!folder) return;
  const endpoint = folder.children?.find(e => e.id === endpointId);
  if (!endpoint) return;
  endpoint.checked = !endpoint.checked;
  render();
}
function selectAll() { state.tree.forEach(f => f.children?.forEach(c => { c.checked = true; })); render(); }
function deselectAll() { state.tree.forEach(f => f.children?.forEach(c => { c.checked = false; })); render(); }
function generate(framework) {
  const selectedIds = [];
  state.tree.forEach(folder => { folder.children?.forEach(ep => { if (ep.checked) selectedIds.push(ep.id); }); });
  if (selectedIds.length === 0) return;
  disableUI();
  vscode.postMessage({ type: 'generate', selectedIds, framework, generateNegative: state.generateNegative, generateUniversal: state.generateUniversal });
}
function addToCollection() {
  const selectedIds = [];
  state.tree.forEach(folder => { folder.children?.forEach(ep => { if (ep.checked) selectedIds.push(ep.id); }); });
  if (selectedIds.length === 0) return;
  vscode.postMessage({ type: 'addToCollection', selectedIds });
}
function disableUI() { document.querySelectorAll('.btn-gen').forEach(btn => btn.disabled = true); }
function enableUI() { document.querySelectorAll('.btn-gen').forEach(btn => btn.disabled = state.selectedCount === 0); }
function showError(error) { enableUI(); console.error(error); }
function resetSpec() {
  state.tree = []; state.selectedCount = 0; state.totalCount = 0;
  state.sourceUrl = ''; state.urlInput = ''; state.authHeader = '';
  state.showAuth = false; state.searchQuery = '';
  vscode.postMessage({ type: 'reset' });
  render();
}

// ========== Collections ==========
function switchTab(tab) { state.activeTab = tab; vscode.postMessage({ type: 'switchTab', tab }); render(); }

function renderCollectionsTab() {
  return \`<div class="collection-toolbar">
    <span style="font-weight: 500;">Saved Requests</span>
    <button class="btn-secondary" onclick="createCollection()">+ New Collection</button>
  </div>
  <div class="tree-container" style="max-height: 500px;">
    \${state.collections.length === 0 ? '<div class="empty-state"><p>No collections yet</p><p style="font-size: 0.9em; margin-top: 8px;">Create a collection to save your requests</p></div>' : state.collections.map(c => renderCollection(c)).join('')}
  </div>
  \${renderSnippetsPanel()}\`;
}

function renderCollection(collection) {
  const isExpanded = state.expandedCollections.has(collection.id);
  const childrenHtml = isExpanded ? \`<div class="tree-children">
    \${collection.children?.length === 0 ? '<div class="empty-collection">Empty collection - send a request and save it here</div>' : (collection.children || []).map(child => child.type === 'folder' ? renderCollectionFolder(child, collection.id) : renderSavedRequest(child, collection.id)).join('')}
  </div>\` : '';
  return \`<div class="tree-node tree-folder \${isExpanded ? '' : 'collapsed'}">
    <div class="tree-folder-header" onclick="toggleCollection('\${collection.id}')">
      <span class="tree-folder-icon">\${ICONS.chevronDown}</span>
      <span class="collection-icon">\${ICONS.folder}</span>
      <span class="tree-folder-label">\${collection.name}</span>
      <div class="collection-actions">
        <button class="btn-icon btn-run" onclick="event.stopPropagation(); runCollection('\${collection.id}')" title="Run Collection">\${ICONS.play}</button>
        <button class="btn-icon" onclick="event.stopPropagation(); addFolder('\${collection.id}')" title="Add folder">\${ICONS.addFolder}</button>
        <button class="btn-icon" onclick="event.stopPropagation(); showExportCodeModal('\${collection.id}')" title="Export to Code">\${ICONS.code}</button>
        <button class="btn-icon" onclick="event.stopPropagation(); exportCollection('\${collection.id}')" title="Export to Postman">\${ICONS.upload}</button>
        <button class="btn-icon" onclick="event.stopPropagation(); deleteCollection('\${collection.id}')" title="Delete">\${ICONS.trash}</button>
      </div>
    </div>
    \${childrenHtml}
  </div>\`;
}

function renderCollectionFolder(folder, collectionId) {
  return \`<div class="folder-item" onclick="event.stopPropagation();">
    <span class="folder-icon">\${ICONS.folderOpen}</span>
    <span class="collection-name">\${folder.name}</span>
    <div class="collection-actions"><button class="btn-icon" onclick="event.stopPropagation(); deleteFolder('\${collectionId}', '\${folder.id}')" title="Delete">\${ICONS.trash}</button></div>
  </div>
  \${(folder.children || []).map(child => child.type === 'folder' ? '<div class="nested-folder">' + renderCollectionFolder(child, collectionId) + '</div>' : renderSavedRequest(child, collectionId, true)).join('')}\`;
}

function renderSavedRequest(request, collectionId, nested = false) {
  const methodClass = 'method-' + request.method.toLowerCase();
  const tests = request.tests || [];
  const extractions = request.extractVariables || [];
  const extractionsHtml = extractions.length > 0 ? \`<div class="extractions-list"><div class="section-label">Variables:</div>\${extractions.map((ext, i) => \`<div class="extraction-item"><span class="var-name">{{\${ext.name}}}</span><span class="var-path">\${ext.path}</span><button class="remove-btn" onclick="event.stopPropagation(); removeExtraction('\${collectionId}', '\${request.id}', \${i})">×</button></div>\`).join('')}</div>\` : '';
  const hasTestScript = request.scripts?.test?.trim();
  const testsHtml = \`<div class="request-tests">\${extractionsHtml}\${hasTestScript ? \`<div class="tests-list"><div class="test-item test-pending"><span class="test-icon">○</span><span class="test-name">Python Tests</span></div></div>\` : ''}</div>\`;
  return \`<div class="request-item \${nested ? 'nested-request' : ''}" onclick="openSavedRequest('\${collectionId}', '\${request.id}')">
    <span class="request-method \${methodClass}">\${request.method}</span>
    <span class="request-name" title="\${request.url}">\${request.name}</span>
    <span class="tests-badge" style="font-size:10px;color:var(--vscode-descriptionForeground);">\${hasTestScript ? '(tests)' : ''}</span>
    <div class="collection-actions"><button class="btn-icon" onclick="event.stopPropagation(); deleteSavedRequest('\${collectionId}', '\${request.id}')" title="Delete">\${ICONS.trash}</button></div>
  </div>\${testsHtml}\`;
}

function getTestDisplayName(test) {
  switch (test.type) {
    case 'status': return 'Status = ' + test.expected;
    case 'statusFamily': return 'Status is ' + test.expected;
    case 'notEmpty': return 'Body not empty';
    case 'hasJsonBody': return 'Body is JSON';
    case 'hasField': return 'Has "' + test.field + '"';
    case 'fieldNotNull': return '"' + test.field + '" not null';
    case 'fieldEquals': return '"' + test.field + '" = ' + test.expected;
    case 'responseTime': return 'Time < ' + test.maxMs + 'ms';
    case 'headerExists': return 'Has "' + test.header + '"';
    case 'headerEquals': return '"' + test.header + '" = ' + test.expected;
    case 'custom': return test.description || test.expression?.substring(0, 30) + '...';
    default: return test.type;
  }
}

function toggleCollection(collectionId) {
  if (state.expandedCollections.has(collectionId)) state.expandedCollections.delete(collectionId);
  else state.expandedCollections.add(collectionId);
  render();
}
function createCollection() { vscode.postMessage({ type: 'promptCreateCollection' }); }
function deleteCollection(collectionId) { state.expandedCollections.delete(collectionId); vscode.postMessage({ type: 'deleteCollection', collectionId }); }
function addFolder(collectionId, parentFolderId) { vscode.postMessage({ type: 'promptCreateFolder', collectionId, parentFolderId }); }
function deleteFolder(collectionId, folderId) { vscode.postMessage({ type: 'deleteFolder', collectionId, folderId }); }
function openSavedRequest(collectionId, requestId) { vscode.postMessage({ type: 'openSavedRequest', collectionId, requestId }); }
function deleteSavedRequest(collectionId, requestId) { vscode.postMessage({ type: 'deleteRequest', collectionId, requestId }); }
function exportCollection(collectionId) { vscode.postMessage({ type: 'exportCollection', collectionId }); }
function runCollection(collectionId) { vscode.postMessage({ type: 'runCollection', collectionId }); }

// ========== Variables Extraction ==========
let currentExtractionCollectionId = null;
let currentExtractionRequestId = null;

function showAddExtraction(collectionId, requestId) {
  currentExtractionCollectionId = collectionId;
  currentExtractionRequestId = requestId;
  document.getElementById('extractionName').value = '';
  document.getElementById('extractionPath').value = '';
  document.getElementById('addExtractionModal').style.display = 'flex';
}
function closeExtractionModal() { document.getElementById('addExtractionModal').style.display = 'none'; }
function setExtractionPath(path) { document.getElementById('extractionPath').value = path; }
function saveExtraction() {
  const name = document.getElementById('extractionName').value.trim();
  const path = document.getElementById('extractionPath').value.trim();
  const scope = document.getElementById('extractionScope').value;
  if (!name || !path) { alert('Name and path are required'); return; }
  vscode.postMessage({ type: 'addExtraction', collectionId: currentExtractionCollectionId, requestId: currentExtractionRequestId, extraction: { name, path, scope } });
  closeExtractionModal();
}
function removeExtraction(collectionId, requestId, index) { vscode.postMessage({ type: 'removeExtraction', collectionId, requestId, index }); }

// ========== Export to Code ==========
let selectedExportFormat = null;
let exportingCollectionId = null;

function showExportCodeModal(collectionId) {
  exportingCollectionId = collectionId;
  selectedExportFormat = null;
  document.querySelectorAll('.format-option').forEach(el => el.classList.remove('selected'));
  document.getElementById('exportCodeOptions').style.display = 'none';
  document.getElementById('exportCodePreview').style.display = 'none';
  document.getElementById('previewCodeBtn').style.display = 'none';
  document.getElementById('saveCodeBtn').style.display = 'none';
  document.getElementById('exportBaseUrl').value = '';
  document.getElementById('exportClassName').value = '';
  document.getElementById('exportCodeModal').style.display = 'flex';
}
function closeExportCodeModal() { document.getElementById('exportCodeModal').style.display = 'none'; exportingCollectionId = null; }
function selectExportFormat(format) {
  selectedExportFormat = format;
  document.querySelectorAll('.format-option').forEach(el => el.classList.toggle('selected', el.dataset.format === format));
  document.getElementById('exportCodeOptions').style.display = 'block';
  document.getElementById('previewCodeBtn').style.display = 'inline-flex';
  document.getElementById('saveCodeBtn').style.display = 'inline-flex';
  document.getElementById('exportClassName').placeholder = format === 'pytest' ? 'test_api' : 'ApiTest';
}
function getExportConfig() {
  return {
    format: selectedExportFormat,
    baseUrl: document.getElementById('exportBaseUrl').value || 'http://localhost:8080',
    className: document.getElementById('exportClassName').value || (selectedExportFormat === 'pytest' ? 'test_api' : 'ApiTest'),
    moduleName: document.getElementById('exportClassName').value || 'test_api',
    includeVariables: document.getElementById('exportIncludeVariables').checked,
    includeSetup: document.getElementById('exportIncludeSetup').checked
  };
}
function previewExportCode() {
  if (!selectedExportFormat || !exportingCollectionId) return;
  vscode.postMessage({ type: 'previewExportCode', collectionId: exportingCollectionId, config: getExportConfig() });
}
function saveExportCode() {
  if (!selectedExportFormat || !exportingCollectionId) return;
  vscode.postMessage({ type: 'saveExportCode', collectionId: exportingCollectionId, config: getExportConfig() });
  closeExportCodeModal();
}
function showExportPreview(code) {
  document.getElementById('exportCodeContent').textContent = code;
  document.getElementById('exportCodePreview').style.display = 'block';
}
function copyExportCode() { navigator.clipboard.writeText(document.getElementById('exportCodeContent').textContent); }

// ========== Custom Snippet ==========
let customSnippetCollectionId = null;
let customSnippetRequestId = null;

function showCustomSnippetModal(collectionId, requestId) {
  customSnippetCollectionId = collectionId;
  customSnippetRequestId = requestId;
  document.getElementById('customSnippetDescription').value = '';
  document.getElementById('customSnippetExpression').value = '';
  document.getElementById('customSnippetModal').style.display = 'flex';
}
function closeCustomSnippetModal() { document.getElementById('customSnippetModal').style.display = 'none'; }
function setCustomExpression(expr) { document.getElementById('customSnippetExpression').value = expr; }
function saveCustomSnippet() {
  const expression = document.getElementById('customSnippetExpression').value.trim();
  const description = document.getElementById('customSnippetDescription').value.trim();
  if (!expression) { alert('Expression is required'); return; }
  vscode.postMessage({ type: 'addTestSnippet', collectionId: customSnippetCollectionId, requestId: customSnippetRequestId, snippet: { type: 'custom', enabled: true, expression, description: description || expression.substring(0, 50) } });
  closeCustomSnippetModal();
}

// ========== Test Snippets ==========
function showSnippetsPanel(collectionId, requestId) {
  state.snippetTargetCollectionId = collectionId;
  state.snippetTargetRequestId = requestId;
  state.snippetPanelVisible = true;
  if (Object.keys(state.snippetLibrary).length === 0) vscode.postMessage({ type: 'getSnippetLibrary' });
  render();
}
function hideSnippetsPanel() { state.snippetPanelVisible = false; state.snippetTargetCollectionId = null; state.snippetTargetRequestId = null; render(); }
function addSnippet(type, config) {
  if (!state.snippetTargetCollectionId || !state.snippetTargetRequestId) return;
  vscode.postMessage({ type: 'addTestSnippet', collectionId: state.snippetTargetCollectionId, requestId: state.snippetTargetRequestId, snippet: { type, enabled: true, ...config } });
  hideSnippetsPanel();
}
function removeTest(collectionId, requestId, index) { vscode.postMessage({ type: 'removeTestSnippet', collectionId, requestId, index }); }

function renderSnippetsPanel() {
  if (!state.snippetPanelVisible) return '';
  const lib = state.snippetLibrary;
  return \`<div class="snippets-panel visible">
    <div class="panel-header"><span>Add Test</span><button class="btn-icon" onclick="hideSnippetsPanel()">×</button></div>
    \${Object.entries(lib).map(([category, snippets]) => \`<div class="snippet-category"><div class="category-header">\${category}</div>\${(snippets || []).map(s => \`<div class="snippet-item" onclick="addSnippet('\${s.type}', \${JSON.stringify(s.defaultConfig).replace(/"/g, '&quot;')})"><span>\${s.name}</span></div>\`).join('')}</div>\`).join('')}
    <div class="snippet-category"><div class="category-header">Custom</div><div class="snippet-item" onclick="hideSnippetsPanel(); showCustomSnippetModal(state.snippetTargetCollectionId, state.snippetTargetRequestId)"><span>Custom JS Expression...</span></div></div>
  </div>\`;
}

init();
`;

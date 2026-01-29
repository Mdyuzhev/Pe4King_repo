/**
 * CSS styles for Pe4King webview.
 */

export const WEBVIEW_STYLES = `
:root {
  --vscode-font-family: var(--vscode-editor-font-family, system-ui, -apple-system, sans-serif);
  --vscode-font-size: var(--vscode-editor-font-size, 13px);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  padding: 16px;
  line-height: 1.5;
  position: relative;
}
h2 { font-size: 1.2em; font-weight: 600; margin-bottom: 16px; }

/* URL input section */
.url-section { display: flex; gap: 8px; margin-bottom: 12px; }
.url-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--vscode-input-border, #3c3c3c);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 4px;
  font-size: inherit;
}
.url-input:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
.url-input.has-url { border-color: var(--vscode-textLink-foreground); }
.btn-load { padding: 8px 16px; white-space: nowrap; }
.auth-toggle {
  display: flex; align-items: center; gap: 4px; padding: 8px;
  background: transparent;
  border: 1px solid var(--vscode-input-border, #3c3c3c);
  border-radius: 4px; cursor: pointer; color: var(--vscode-foreground);
}
.auth-toggle.active { background: var(--vscode-button-secondaryBackground); border-color: var(--vscode-focusBorder); }
.auth-section { display: none; margin-bottom: 12px; }
.auth-section.visible { display: block; }
.auth-input {
  width: 100%; padding: 8px 12px;
  border: 1px solid var(--vscode-input-border, #3c3c3c);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 4px; font-size: inherit; font-family: monospace;
}
.source-info {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; font-size: 0.85em; color: var(--vscode-descriptionForeground);
  margin-bottom: 8px; padding: 4px 8px;
  background: var(--vscode-textBlockQuote-background); border-radius: 4px;
}
.source-info span { word-break: break-all; flex: 1; }
.btn-reset {
  padding: 2px 6px; font-size: 0.9em; background: transparent;
  border: 1px solid var(--vscode-input-border);
  color: var(--vscode-foreground); cursor: pointer; border-radius: 3px; opacity: 0.7;
}
.btn-reset:hover { opacity: 1; background: var(--vscode-button-secondaryBackground); }

.search-container { margin-bottom: 12px; }
.search-input {
  width: 100%; padding: 8px 12px;
  border: 1px solid var(--vscode-input-border, #3c3c3c);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 4px; font-size: inherit;
}
.search-input:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
.config-section { display: flex; gap: 16px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.config-item { display: flex; align-items: center; gap: 8px; }
.config-item label { font-weight: 500; }
select {
  padding: 6px 10px;
  border: 1px solid var(--vscode-dropdown-border, #3c3c3c);
  background: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  border-radius: 4px; font-size: inherit; min-width: 120px;
}
.toolbar {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px; padding: 8px 0;
  border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
}
.toolbar-buttons { display: flex; gap: 8px; }
.toolbar-info { font-size: 0.9em; color: var(--vscode-descriptionForeground); }
.toolbar-info strong { color: var(--vscode-foreground); }
button {
  padding: 6px 12px; border: none; border-radius: 4px;
  font-size: inherit; cursor: pointer; transition: opacity 0.15s;
}
button:hover { opacity: 0.9; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); font-weight: 500; }
.tree-container {
  max-height: 400px; overflow-y: auto;
  border: 1px solid var(--vscode-panel-border, #3c3c3c);
  border-radius: 4px; margin-bottom: 16px;
}
.tree-node { user-select: none; }
.tree-folder { border-bottom: 1px solid var(--vscode-panel-border, #2d2d2d); }
.tree-folder:last-child { border-bottom: none; }
.tree-folder-header {
  display: flex; align-items: center; padding: 8px 12px; cursor: pointer;
  background: var(--vscode-sideBar-background, #252526);
}
.tree-folder-header:hover { background: var(--vscode-list-hoverBackground); }
.tree-folder-icon { margin-right: 8px; transition: transform 0.15s; }
.tree-folder.collapsed .tree-folder-icon { transform: rotate(-90deg); }
.tree-folder-label { flex: 1; font-weight: 500; }
.tree-folder-checkbox { margin-left: 8px; }
.tree-children { padding-left: 24px; }
.tree-folder.collapsed .tree-children { display: none; }
.tree-endpoint { display: flex; align-items: center; padding: 6px 12px; cursor: pointer; }
.tree-endpoint:hover { background: var(--vscode-list-hoverBackground); }
.tree-endpoint.hidden { display: none; }
.tree-endpoint-checkbox { margin-right: 8px; }
.tree-endpoint-method {
  font-family: monospace; font-size: 0.85em; font-weight: 600;
  padding: 2px 6px; border-radius: 3px; margin-right: 8px;
  min-width: 60px; text-align: center;
}
.method-get { background: #61affe22; color: #61affe; }
.method-post { background: #49cc9022; color: #49cc90; }
.method-put { background: #fca13022; color: #fca130; }
.method-patch { background: #50e3c222; color: #50e3c2; }
.method-delete { background: #f93e3e22; color: #f93e3e; }
.tree-endpoint-path { font-family: monospace; font-size: 0.9em; color: var(--vscode-foreground); flex: 1; }
.btn-send {
  background: transparent;
  border: 1px solid var(--vscode-button-secondaryBackground);
  color: var(--vscode-descriptionForeground);
  padding: 2px 8px; font-size: 0.75em; border-radius: 3px;
  margin-left: auto; cursor: pointer; transition: all 0.15s;
}
.btn-send:hover {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: var(--vscode-button-background);
}
input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: var(--vscode-checkbox-background); }
.generate-section { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; padding-top: 12px; }
.btn-gen {
  padding: 8px 12px; font-size: 0.9em; border: none; border-radius: 4px;
  cursor: pointer; font-weight: 500; transition: all 0.15s;
}
.btn-gen:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-pytest { background: #306998; color: white; }
.btn-pytest:hover:not(:disabled) { background: #4B8BBE; }
.btn-java { background: #f89820; color: white; }
.btn-java:hover:not(:disabled) { background: #E76F00; }
.btn-postman { background: #FF6C37; color: white; }
.btn-postman:hover:not(:disabled) { background: #E85A2A; }
.btn-collection { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.btn-collection:hover:not(:disabled) { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.loading-overlay {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--vscode-editor-background); opacity: 0.95;
  display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 100;
}
.spinner {
  display: inline-block; width: 24px; height: 24px;
  border: 3px solid var(--vscode-progressBar-background);
  border-top-color: transparent; border-radius: 50%;
  animation: spin 1s linear infinite; margin-bottom: 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.empty-state { text-align: center; padding: 40px; color: var(--vscode-descriptionForeground); }

/* Tabs */
.tabs { display: flex; border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c); margin-bottom: 16px; }
.tab {
  padding: 8px 16px; cursor: pointer; border: none; background: transparent;
  color: var(--vscode-descriptionForeground); font-size: inherit;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab:hover { color: var(--vscode-foreground); }
.tab.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder); }

/* Collections */
.collection-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.collection-item { display: flex; align-items: center; padding: 6px 12px; cursor: pointer; border-radius: 4px; }
.collection-item:hover { background: var(--vscode-list-hoverBackground); }
.collection-icon { margin-right: 8px; font-size: 1.1em; }
.collection-name { flex: 1; }
.collection-actions { display: flex; gap: 4px; }
.btn-icon {
  background: transparent; border: none; color: var(--vscode-descriptionForeground);
  cursor: pointer; padding: 2px 6px; border-radius: 3px; font-size: 0.9em;
}
.btn-icon:hover { background: var(--vscode-button-secondaryBackground); color: var(--vscode-foreground); }
.btn-icon.btn-run { color: #49cc90; }
.btn-icon.btn-run:hover { background: #49cc9022; color: #49cc90; }
.request-item { display: flex; align-items: center; padding: 4px 12px 4px 36px; cursor: pointer; }
.request-item:hover { background: var(--vscode-list-hoverBackground); }
.request-method {
  font-family: monospace; font-size: 0.8em; font-weight: 600;
  padding: 1px 4px; border-radius: 2px; margin-right: 8px; min-width: 40px; text-align: center;
}
.request-name { flex: 1; font-size: 0.9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.folder-item { display: flex; align-items: center; padding: 4px 12px 4px 24px; cursor: pointer; }
.folder-item:hover { background: var(--vscode-list-hoverBackground); }
.folder-icon { margin-right: 6px; }
.nested-folder { padding-left: 48px; }
.nested-request { padding-left: 60px; }
.empty-collection { padding: 12px 24px; color: var(--vscode-descriptionForeground); font-size: 0.9em; font-style: italic; }

/* Snippets Panel */
.snippets-panel {
  position: fixed; right: 0; top: 0; width: 280px; height: 100%;
  background: var(--vscode-sideBar-background);
  border-left: 1px solid var(--vscode-panel-border);
  z-index: 100; overflow-y: auto;
  transform: translateX(100%); transition: transform 0.2s ease;
}
.snippets-panel.visible { transform: translateX(0); }
.panel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px; border-bottom: 1px solid var(--vscode-panel-border); font-weight: 600;
}
.snippet-category { margin-bottom: 8px; }
.category-header {
  font-weight: 600; padding: 8px 12px;
  background: var(--vscode-sideBarSectionHeader-background);
  border-bottom: 1px solid var(--vscode-panel-border);
  font-size: 0.85em; color: var(--vscode-descriptionForeground);
}
.snippet-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; font-size: 0.9em; }
.snippet-item:hover { background: var(--vscode-list-hoverBackground); }

/* Tests List in Request */
.request-tests { padding: 4px 12px 8px 48px; }
.tests-list { margin-bottom: 4px; }
.test-item { display: flex; align-items: center; gap: 6px; padding: 2px 6px; font-size: 11px; border-radius: 3px; margin-bottom: 2px; }
.test-passed { background: rgba(40, 167, 69, 0.15); }
.test-passed .test-icon { color: #28a745; }
.test-failed { background: rgba(220, 53, 69, 0.15); }
.test-failed .test-icon { color: #dc3545; }
.test-pending { opacity: 0.7; }
.test-name { flex: 1; }
.test-actual { margin-left: auto; color: var(--vscode-errorForeground); font-size: 10px; }
.add-test-btn {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
  background: transparent; border: 1px dashed var(--vscode-panel-border);
  color: var(--vscode-descriptionForeground); cursor: pointer; font-size: 11px; border-radius: 3px;
}
.add-test-btn:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
.remove-test-btn {
  background: transparent; border: none; color: var(--vscode-foreground);
  opacity: 0.4; cursor: pointer; padding: 0 2px; font-size: 10px;
}
.remove-test-btn:hover { opacity: 1; color: var(--vscode-errorForeground); }

/* Modal Base */
.modal {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.modal-content {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 8px; width: 450px; max-width: 90%; max-height: 90vh; overflow: auto;
}
.modal-large { width: 600px; }
.modal-header {
  display: flex; align-items: center; gap: 8px; padding: 12px 16px;
  border-bottom: 1px solid var(--vscode-panel-border); font-weight: 600;
}
.modal-header .close-btn {
  margin-left: auto; background: transparent; border: none;
  color: var(--vscode-foreground); font-size: 18px; cursor: pointer; padding: 4px 8px;
}
.modal-body { padding: 16px; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px;
  border-top: 1px solid var(--vscode-panel-border);
}

/* Form Elements */
.form-group { margin-bottom: 16px; }
.form-group label { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 500; }
.form-group input, .form-group select, .form-group textarea {
  width: 100%; padding: 8px 10px;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  color: var(--vscode-input-foreground);
  border-radius: 4px; font-size: 13px;
}
.form-group textarea { font-family: var(--vscode-editor-font-family); resize: vertical; min-height: 80px; }
.form-group small { display: block; margin-top: 4px; color: var(--vscode-descriptionForeground); font-size: 11px; }

/* Format Selector */
.format-selector { display: flex; gap: 12px; }
.format-option {
  flex: 1; padding: 16px;
  border: 2px solid var(--vscode-panel-border);
  border-radius: 8px; cursor: pointer; text-align: center;
}
.format-option:hover { border-color: var(--vscode-focusBorder); }
.format-option.selected { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); }
.format-icon { font-size: 28px; margin-bottom: 8px; }
.format-name { font-weight: 600; }
.format-desc { font-size: 11px; color: var(--vscode-descriptionForeground); }

/* Export Preview */
.export-preview { margin-top: 16px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
.preview-header {
  display: flex; justify-content: space-between; align-items: center; padding: 8px 12px;
  background: var(--vscode-sideBarSectionHeader-background);
  border-bottom: 1px solid var(--vscode-panel-border);
}
.export-preview pre {
  margin: 0; padding: 12px; max-height: 250px; overflow: auto;
  font-family: var(--vscode-editor-font-family); font-size: 12px; line-height: 1.4;
}

/* Path Examples */
.path-examples { margin-top: 12px; padding: 10px; background: var(--vscode-textBlockQuote-background); border-radius: 4px; }
.path-examples .example-header { font-weight: 500; margin-bottom: 8px; font-size: 12px; }
.path-examples .example { padding: 4px 8px; cursor: pointer; font-size: 12px; border-radius: 3px; }
.path-examples .example:hover { background: var(--vscode-list-hoverBackground); }
.path-examples code { font-family: var(--vscode-editor-font-family); color: var(--vscode-textLink-foreground); }

/* Expression Help */
.expression-help { margin-top: 16px; }
.help-section { margin-bottom: 12px; padding: 10px; background: var(--vscode-textBlockQuote-background); border-radius: 4px; }
.help-title { font-weight: 600; margin-bottom: 6px; font-size: 12px; }
.help-section code {
  font-family: var(--vscode-editor-font-family);
  background: var(--vscode-textCodeBlock-background);
  padding: 2px 6px; border-radius: 3px; font-size: 12px;
}
.examples-list .example-item { padding: 6px 8px; cursor: pointer; border-radius: 3px; margin-top: 4px; }
.examples-list .example-item:hover { background: var(--vscode-list-hoverBackground); }

/* Extractions List */
.extractions-list { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--vscode-panel-border); }
.extractions-list .section-label { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
.extraction-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }
.extraction-item .var-name { font-family: var(--vscode-editor-font-family); color: var(--vscode-symbolIcon-variableForeground); }
.extraction-item .var-path { color: var(--vscode-descriptionForeground); flex: 1; }
.extraction-item .remove-btn {
  background: transparent; border: none; color: var(--vscode-foreground);
  opacity: 0.5; cursor: pointer; padding: 2px 6px;
}
.extraction-item .remove-btn:hover { opacity: 1; color: var(--vscode-errorForeground); }

/* EVA Section */
.eva-section {
  margin-top: 32px; padding-top: 24px;
  border-top: 1px solid var(--vscode-panel-border);
}
.eva-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.eva-title { font-weight: 600; font-size: 1em; }
.eva-controls { display: flex; gap: 8px; margin-bottom: 8px; }
.btn-eva-upload { display: flex; align-items: center; gap: 6px; }
.eva-archive-name {
  font-size: 0.85em; color: var(--vscode-descriptionForeground);
  font-family: monospace; margin-bottom: 12px; min-height: 1.2em;
}
.eva-result {
  margin-top: 12px; padding: 12px;
  background: var(--vscode-textBlockQuote-background);
  border-radius: 6px; border: 1px solid var(--vscode-panel-border);
}
.eva-result.eva-loading { display: flex; align-items: center; gap: 12px; justify-content: center; padding: 24px; }
.eva-result.eva-error { color: var(--vscode-errorForeground); }
.eva-score-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.eva-score { font-size: 2em; font-weight: 700; }
.eva-grade { padding: 4px 10px; border-radius: 4px; color: white; font-weight: 600; font-size: 0.9em; }
.eva-metrics { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.eva-metric {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 12px; background: var(--vscode-sideBar-background);
  border-radius: 4px; min-width: 70px;
}
.metric-label { font-size: 0.75em; color: var(--vscode-descriptionForeground); }
.metric-value { font-size: 1.1em; font-weight: 600; }
.eva-bars { margin-bottom: 12px; }
.eva-bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.eva-bar-label { width: 60px; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
.eva-bar { flex: 1; height: 8px; background: var(--vscode-scrollbarSlider-background); border-radius: 4px; overflow: hidden; }
.eva-bar-fill { height: 100%; background: var(--vscode-progressBar-background); border-radius: 4px; transition: width 0.3s; }
.eva-bar-value { width: 28px; text-align: right; font-size: 0.85em; font-weight: 500; }
.eva-bar-weight { width: 30px; font-size: 0.75em; color: var(--vscode-descriptionForeground); }
.eva-grade-desc { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 8px; font-style: italic; }
.eva-version { font-size: 0.7em; color: var(--vscode-descriptionForeground); margin-left: 8px; }
.eva-calc { font-size: 0.8em; color: var(--vscode-descriptionForeground); font-family: monospace; margin-bottom: 12px; }
.eva-issues { margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px; }
.eva-issue { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 4px; font-size: 0.85em; }
.eva-issue.eva-critical { background: rgba(239, 68, 68, 0.15); border-left: 3px solid #ef4444; }
.eva-issue.eva-warning { background: rgba(249, 115, 22, 0.15); border-left: 3px solid #f97316; }
.eva-issue.eva-info { background: rgba(234, 179, 8, 0.15); border-left: 3px solid #eab308; }
.issue-icon { font-size: 1em; }
.issue-title { font-weight: 600; white-space: nowrap; }
.issue-details { color: var(--vscode-descriptionForeground); font-size: 0.9em; overflow: hidden; text-overflow: ellipsis; }
.eva-coverage { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; padding: 8px 0; border-top: 1px dashed var(--vscode-panel-border); border-bottom: 1px dashed var(--vscode-panel-border); }
.eva-coverage-item { display: flex; gap: 8px; align-items: center; }
.coverage-label { font-size: 0.8em; color: var(--vscode-descriptionForeground); }
.coverage-value { font-size: 0.9em; font-weight: 600; font-family: monospace; }
.eva-recommendations { font-size: 0.85em; margin-top: 12px; }
.eva-recommendations ul { margin: 8px 0 0 20px; }
.eva-recommendations li { margin-bottom: 4px; color: var(--vscode-descriptionForeground); }
`;

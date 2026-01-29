/**
 * HTML templates for Pe4King webview.
 */

export const WEBVIEW_MODALS = `
<!-- Add Extraction Modal -->
<div class="modal" id="addExtractionModal" style="display: none;">
  <div class="modal-content">
    <div class="modal-header">
      <span>Extract Variable from Response</span>
      <button class="close-btn" onclick="closeExtractionModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Variable Name</label>
        <input type="text" id="extractionName" placeholder="userId" />
        <small>Use as {{userId}} in other requests</small>
      </div>
      <div class="form-group">
        <label>Path to Value</label>
        <input type="text" id="extractionPath" placeholder="$.id or user.name" />
        <small>JSONPath or dot notation</small>
      </div>
      <div class="form-group">
        <label>Scope</label>
        <select id="extractionScope">
          <option value="collection">Collection (available everywhere)</option>
          <option value="folder">Folder (current folder only)</option>
        </select>
      </div>
      <div class="path-examples">
        <div class="example-header">Examples:</div>
        <div class="example" onclick="setExtractionPath('$.id')"><code>$.id</code> — root field</div>
        <div class="example" onclick="setExtractionPath('$.user.name')"><code>$.user.name</code> — nested</div>
        <div class="example" onclick="setExtractionPath('$.items[0].id')"><code>$.items[0].id</code> — array</div>
        <div class="example" onclick="setExtractionPath('$status')"><code>$status</code> — HTTP status</div>
        <div class="example" onclick="setExtractionPath('$header.Authorization')"><code>$header.X</code> — header</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeExtractionModal()">Cancel</button>
      <button class="btn-primary" onclick="saveExtraction()">Add</button>
    </div>
  </div>
</div>

<!-- Export Modal -->
<div class="modal" id="exportCodeModal" style="display: none;">
  <div class="modal-content modal-large">
    <div class="modal-header">
      <span>Export Collection to Code</span>
      <button class="close-btn" onclick="closeExportCodeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Format</label>
        <div class="format-selector">
          <div class="format-option" data-format="pytest" onclick="selectExportFormat('pytest')">
            <div class="format-icon">🐍</div>
            <div class="format-name">pytest</div>
            <div class="format-desc">Python + requests</div>
          </div>
          <div class="format-option" data-format="rest-assured" onclick="selectExportFormat('rest-assured')">
            <div class="format-icon">☕</div>
            <div class="format-name">REST Assured</div>
            <div class="format-desc">Java + JUnit 5</div>
          </div>
        </div>
      </div>
      <div id="exportCodeOptions" style="display: none;">
        <div class="form-group">
          <label>Base URL</label>
          <input type="text" id="exportBaseUrl" placeholder="http://localhost:8080" />
        </div>
        <div class="form-group">
          <label>Class/Module Name</label>
          <input type="text" id="exportClassName" placeholder="ApiTest" />
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="exportIncludeVariables" checked /> Include variable handling</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="exportIncludeSetup" checked /> Include setup/teardown</label>
        </div>
      </div>
      <div id="exportCodePreview" class="export-preview" style="display: none;">
        <div class="preview-header">
          <span>Preview</span>
          <button class="btn-secondary btn-sm" onclick="copyExportCode()">Copy</button>
        </div>
        <pre><code id="exportCodeContent"></code></pre>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeExportCodeModal()">Cancel</button>
      <button class="btn-secondary" id="previewCodeBtn" onclick="previewExportCode()" style="display: none;">Preview</button>
      <button class="btn-primary" id="saveCodeBtn" onclick="saveExportCode()" style="display: none;">Save Files</button>
    </div>
  </div>
</div>

<!-- Custom Snippet Modal -->
<div class="modal" id="customSnippetModal" style="display: none;">
  <div class="modal-content modal-large">
    <div class="modal-header">
      <span>Custom Test Expression</span>
      <button class="close-btn" onclick="closeCustomSnippetModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="customSnippetDescription" placeholder="What this test checks" />
      </div>
      <div class="form-group">
        <label>JavaScript Expression</label>
        <textarea id="customSnippetExpression" rows="4" placeholder="response.body.items.length > 0"></textarea>
        <small>Expression must return truthy value to pass</small>
      </div>
      <div class="expression-help">
        <div class="help-section">
          <div class="help-title">Available Variables</div>
          <code>response.status</code> — HTTP status code<br>
          <code>response.body</code> — Parsed response body<br>
          <code>response.headers</code> — Response headers<br>
          <code>response.time</code> — Response time (ms)
        </div>
        <div class="help-section">
          <div class="help-title">Helper Functions</div>
          <code>len(arr)</code> — Array/string length<br>
          <code>all(arr, fn)</code> — All items match<br>
          <code>any(arr, fn)</code> — Any item matches<br>
          <code>between(val, min, max)</code> — Range check
        </div>
        <div class="help-section">
          <div class="help-title">Examples (click to use)</div>
          <div class="examples-list">
            <div class="example-item" onclick="setCustomExpression('response.body.items.length > 0')">
              <code>response.body.items.length > 0</code>
            </div>
            <div class="example-item" onclick="setCustomExpression('response.status === 200 && response.time < 500')">
              <code>response.status === 200 && response.time < 500</code>
            </div>
            <div class="example-item" onclick="setCustomExpression('all(response.body.users, u => u.active)')">
              <code>all(response.body.users, u => u.active)</code>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeCustomSnippetModal()">Cancel</button>
      <button class="btn-primary" onclick="saveCustomSnippet()">Add Test</button>
    </div>
  </div>
</div>
`;

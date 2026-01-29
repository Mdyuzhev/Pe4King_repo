/**
 * Request Panel for sending API requests.
 * Opens as a separate panel to the right of the endpoint tree.
 */

import * as vscode from 'vscode';
import { EndpointInfo } from '../core/models';
import { RequestExecutor, RequestResult } from '../core/request-executor';
import { SampleGenerator } from '../core/sample-generator';
import { PythonRunner, ScriptContext } from '../core/python-runner';
import { CollectionManager, SavedRequest, RequestScripts, ScriptResult, TestSnippet } from '../collections';
import { SNIPPET_LIBRARY, getSnippetDisplayName, createSnippetFromDefinition, snippetToPython } from '../collections/snippets';

export interface RequestPanelOptions {
  endpoint: EndpointInfo;
  baseUrl: string;
  authHeader?: string;
}

export class RequestPanelProvider {
  private _panel?: vscode.WebviewPanel;
  private _executor: RequestExecutor;
  private _sampleGenerator: SampleGenerator;
  private _pythonRunner: PythonRunner;
  private _options?: RequestPanelOptions;
  private _collectionManager: CollectionManager;
  private _currentCollectionId?: string;
  private _currentScripts?: RequestScripts;
  private _currentRequestId?: string;
  private _currentTests: TestSnippet[] = [];

  constructor(collectionManager: CollectionManager) {
    this._executor = new RequestExecutor();
    this._sampleGenerator = new SampleGenerator();
    this._pythonRunner = new PythonRunner();
    this._collectionManager = collectionManager;
  }

  /**
   * Opens the request panel for an endpoint.
   */
  public open(options: RequestPanelOptions): void {
    this._options = options;
    this._sampleGenerator.reset();

    // Create or reveal panel
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Beside);
    } else {
      this._panel = vscode.window.createWebviewPanel(
        'pe4kingRequest',
        `${options.endpoint.method} ${this.getShortPath(options.endpoint.path)}`,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      this._panel.onDidDispose(() => {
        this._panel = undefined;
      });

      // Handle messages from webview
      this._panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.type) {
          case 'sendRequest':
            await this._handleSendRequest(message);
            break;
          case 'copyAsCurl':
            this._handleCopyAsCurl(message);
            break;
          case 'saveToCollection':
            await this._handleSaveToCollection(message);
            break;
          case 'getCollections':
            this._sendCollections();
            break;
          case 'createCollection':
            this._collectionManager.createCollection(message.name);
            this._sendCollections();
            break;
        }
      });
    }

    // Update panel title and content
    this._panel.title = `${options.endpoint.method} ${this.getShortPath(options.endpoint.path)}`;
    this._panel.webview.html = this._getHtmlContent(options);
  }

  /**
   * Gets short path for panel title.
   */
  private getShortPath(path: string): string {
    const parts = path.split('/').filter(Boolean);
    if (parts.length > 3) {
      return '/.../' + parts.slice(-2).join('/');
    }
    return path;
  }

  /**
   * Handles send request message from webview.
   */
  private async _handleSendRequest(message: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    scripts?: RequestScripts;
  }): Promise<void> {
    // Show loading state
    this._panel?.webview.postMessage({ type: 'loading' });

    let requestUrl = message.url;
    let requestHeaders = { ...message.headers };
    let requestBody = message.body;

    const scripts = message.scripts || this._currentScripts;

    // Run pre-request script if present
    let preRequestResult: ScriptResult | undefined;
    if (scripts?.preRequest) {
      const context: ScriptContext = {
        request: {
          method: message.method,
          url: requestUrl,
          headers: requestHeaders,
          body: requestBody
        },
        env: {}
      };

      preRequestResult = await this._pythonRunner.execute(scripts.preRequest, context);

      // Send pre-request result to webview
      this._panel?.webview.postMessage({
        type: 'preRequestResult',
        result: preRequestResult
      });

      // Apply modifications from pre-request script
      if (preRequestResult.modifiedRequest) {
        if (preRequestResult.modifiedRequest.url) {
          requestUrl = preRequestResult.modifiedRequest.url;
        }
        if (preRequestResult.modifiedRequest.headers) {
          requestHeaders = { ...requestHeaders, ...preRequestResult.modifiedRequest.headers };
        }
        if (preRequestResult.modifiedRequest.body !== undefined) {
          requestBody = preRequestResult.modifiedRequest.body;
        }
      }
    }

    // Execute the request
    const result = await this._executor.execute({
      method: message.method,
      url: requestUrl,
      headers: requestHeaders,
      body: requestBody,
      rejectUnauthorized: false // Allow self-signed certs
    });

    // Send response result to webview
    this._panel?.webview.postMessage({
      type: 'response',
      result
    });

    // Run test script if present and request succeeded
    if (scripts?.test && result.success) {
      const testContext: ScriptContext = {
        request: {
          method: message.method,
          url: requestUrl,
          headers: requestHeaders,
          body: requestBody
        },
        response: {
          status: result.status || 0,
          statusText: result.statusText || '',
          headers: result.headers || {},
          body: result.body || '',
          time_ms: result.time || 0,
          size: result.size || 0
        },
        env: {}
      };

      const testResult = await this._pythonRunner.execute(scripts.test, testContext);

      // Send test result to webview
      console.log('[Pe4King] Test result:', JSON.stringify(testResult, null, 2));
      this._panel?.webview.postMessage({
        type: 'testResult',
        result: testResult
      });
    }

    // Run snippet tests if present and request succeeded
    if (this._currentTests.length > 0 && result.success) {
      const snippetResults = this._executeSnippets(this._currentTests, {
        status: result.status || 0,
        headers: result.headers || {},
        body: result.body || '',
        time: result.time || 0
      });

      this._panel?.webview.postMessage({
        type: 'snippetResults',
        results: snippetResults
      });
    }
  }

  /**
   * Execute test snippets.
   */
  private _executeSnippets(
    snippets: TestSnippet[],
    response: { status: number; headers: Record<string, string | string[]>; body: string; time: number }
  ): { name: string; passed: boolean; error?: string }[] {
    return snippets.filter(s => s.enabled).map(snippet => {
      try {
        let parsedBody: unknown;
        try { parsedBody = JSON.parse(response.body); } catch { parsedBody = response.body; }

        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.headers)) {
          headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
        }

        let passed = false;
        const name = getSnippetDisplayName(snippet);

        switch (snippet.type) {
          case 'status':
            passed = response.status === snippet.expected;
            break;
          case 'statusFamily': {
            const family = snippet.expected as string;
            passed = String(response.status).startsWith(family.charAt(0));
            break;
          }
          case 'notEmpty':
            passed = response.body !== '' && response.body !== null;
            break;
          case 'hasJsonBody':
            passed = (headers['content-type'] || '').includes('application/json');
            break;
          case 'hasField':
            passed = this._getNestedValue(parsedBody, snippet.field!) !== undefined;
            break;
          case 'fieldNotNull': {
            const val = this._getNestedValue(parsedBody, snippet.field!);
            passed = val !== null && val !== undefined;
            break;
          }
          case 'fieldEquals':
            passed = this._getNestedValue(parsedBody, snippet.field!) === snippet.expected;
            break;
          case 'responseTime':
            passed = response.time < (snippet.maxMs || 1000);
            break;
          case 'headerExists':
            passed = snippet.header!.toLowerCase() in headers;
            break;
          case 'headerEquals':
            passed = headers[snippet.header!.toLowerCase()] === snippet.expected;
            break;
        }

        return { name, passed };
      } catch (error) {
        return { name: getSnippetDisplayName(snippet), passed: false, error: (error as Error).message };
      }
    });
  }

  /**
   * Get nested value from object.
   */
  private _getNestedValue(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /**
   * Handles copy as curl command.
   */
  private _handleCopyAsCurl(message: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }): void {
    let curl = `curl -X ${message.method} '${message.url}'`;

    for (const [key, value] of Object.entries(message.headers)) {
      if (value) {
        curl += ` \\\n  -H '${key}: ${value}'`;
      }
    }

    if (message.body) {
      curl += ` \\\n  -d '${message.body.replace(/'/g, "\\'")}'`;
    }

    vscode.env.clipboard.writeText(curl);
    vscode.window.showInformationMessage('Curl command copied to clipboard');
  }

  /**
   * Handles save to collection request.
   */
  private async _handleSaveToCollection(message: {
    name: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    bodyType: SavedRequest['bodyType'];
    collectionId: string;
    folderId?: string;
    scripts?: RequestScripts;
  }): Promise<void> {
    const request = this._collectionManager.saveRequest(
      message.collectionId,
      message.name,
      message.method,
      message.url,
      message.headers,
      message.body,
      message.bodyType,
      message.folderId,
      message.scripts
    );

    if (request) {
      vscode.window.showInformationMessage(`Saved "${message.name}" to collection`);
      this._panel?.webview.postMessage({ type: 'savedToCollection', requestId: request.id });
    } else {
      vscode.window.showErrorMessage('Failed to save request');
    }
  }

  /**
   * Sends collections list to webview.
   */
  private _sendCollections(): void {
    const collections = this._collectionManager.collections.map(c => ({
      id: c.id,
      name: c.name,
      folders: this._flattenFolders(c.folders, c.id)
    }));

    this._panel?.webview.postMessage({
      type: 'collectionsData',
      collections
    });
  }

  /**
   * Sends snippet library to webview.
   */
  private _sendSnippetLibrary(): void {
    this._panel?.webview.postMessage({
      type: 'snippetLibrary',
      library: SNIPPET_LIBRARY,
      currentTests: this._currentTests
    });
  }

  /**
   * Handles adding a snippet to current request.
   * Converts snippet to Python code and inserts into textarea.
   */
  private _handleAddSnippet(snippetType: string, config: Partial<TestSnippet>): void {
    const snippet: TestSnippet = {
      type: snippetType as TestSnippet['type'],
      enabled: true,
      ...config
    };

    // Convert snippet to Python code
    const pythonCode = snippetToPython(snippet);

    // Send code to webview to insert into textarea
    this._panel?.webview.postMessage({
      type: 'insertSnippetCode',
      code: pythonCode
    });
  }

  /**
   * Handles removing a snippet from current request.
   */
  private _handleRemoveSnippet(index: number): void {
    if (index >= 0 && index < this._currentTests.length) {
      this._currentTests.splice(index, 1);

      // Save to collection if we have context
      if (this._currentCollectionId && this._currentRequestId) {
        this._collectionManager.updateRequestTests(
          this._currentCollectionId,
          this._currentRequestId,
          this._currentTests
        );
      }

      // Update webview
      this._panel?.webview.postMessage({
        type: 'testsUpdated',
        tests: this._currentTests
      });
    }
  }

  /**
   * Handles updating scripts for a saved request.
   */
  private _handleUpdateScripts(collectionId: string, requestId: string, scripts: RequestScripts): void {
    this._collectionManager.updateRequest(collectionId, requestId, { scripts });
  }

  /**
   * Handles adding a variable extraction to a request.
   */
  private _handleAddExtraction(collectionId: string, requestId: string, extraction: { name: string; path: string }): void {
    this._collectionManager.addExtractionToRequest(collectionId, requestId, { ...extraction, scope: 'request' });
    const request = this._collectionManager.getRequest(collectionId, requestId);
    if (request) {
      this._panel?.webview.postMessage({
        type: 'variablesUpdated',
        variables: request.extractVariables || []
      });
    }
  }

  /**
   * Handles removing a variable extraction from a request.
   */
  private _handleRemoveExtraction(collectionId: string, requestId: string, index: number): void {
    this._collectionManager.removeExtractionFromRequest(collectionId, requestId, index);
    const request = this._collectionManager.getRequest(collectionId, requestId);
    if (request) {
      this._panel?.webview.postMessage({
        type: 'variablesUpdated',
        variables: request.extractVariables || []
      });
    }
  }

  /**
   * Flattens folders for dropdown.
   */
  private _flattenFolders(
    folders: { id: string; name: string; folders: unknown[] }[],
    collectionId: string,
    prefix = ''
  ): { id: string; name: string }[] {
    const result: { id: string; name: string }[] = [];
    for (const folder of folders) {
      const displayName = prefix ? `${prefix} / ${folder.name}` : folder.name;
      result.push({ id: folder.id, name: displayName });
      result.push(...this._flattenFolders(
        folder.folders as { id: string; name: string; folders: unknown[] }[],
        collectionId,
        displayName
      ));
    }
    return result;
  }

  /**
   * Opens a saved request in the panel.
   */
  public openSavedRequest(request: SavedRequest, collectionId: string): void {
    this._currentCollectionId = collectionId;
    this._currentScripts = request.scripts;

    // Create or reveal panel
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Beside);
    } else {
      this._panel = vscode.window.createWebviewPanel(
        'pe4kingRequest',
        `${request.method} ${request.name}`,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      this._panel.onDidDispose(() => {
        this._panel = undefined;
      });

      // Handle messages from webview
      this._panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.type) {
          case 'sendRequest':
            await this._handleSendRequest(message);
            break;
          case 'copyAsCurl':
            this._handleCopyAsCurl(message);
            break;
          case 'saveToCollection':
            await this._handleSaveToCollection(message);
            break;
          case 'getCollections':
            this._sendCollections();
            break;
          case 'createCollection':
            this._collectionManager.createCollection(message.name);
            this._sendCollections();
            break;
          case 'addSnippet':
            this._handleAddSnippet(message.snippetType, message.config);
            break;
          case 'removeSnippet':
            this._handleRemoveSnippet(message.index);
            break;
          case 'getSnippetLibrary':
            this._sendSnippetLibrary();
            break;
          case 'updateScripts':
            this._handleUpdateScripts(message.collectionId, message.requestId, message.scripts);
            break;
          case 'addExtraction':
            this._handleAddExtraction(message.collectionId, message.requestId, message.extraction);
            break;
          case 'removeExtraction':
            this._handleRemoveExtraction(message.collectionId, message.requestId, message.index);
            break;
        }
      });
    }

    // Update panel title and content for saved request
    this._panel.title = `${request.method} ${request.name}`;
    this._currentRequestId = request.id;
    this._currentTests = request.tests || [];
    this._panel.webview.html = this._getSavedRequestHtmlContent(request, collectionId);
  }

  /**
   * Extracts path parameters from endpoint path.
   */
  private extractPathParams(path: string): string[] {
    const matches = path.match(/\{([^}]+)\}/g) || [];
    return matches.map(m => m.slice(1, -1));
  }

  /**
   * Generates sample values for path parameters.
   * Only uses examples from spec, does not auto-generate values.
   */
  private generatePathParamSamples(endpoint: EndpointInfo): Record<string, string> {
    const samples: Record<string, string> = {};

    // Only use values from spec (example or default), don't auto-generate
    for (const param of endpoint.pathParams || []) {
      if (param.example !== undefined) {
        samples[param.name] = String(param.example);
      }
      // Leave empty if no example - user will fill manually
    }

    return samples;
  }

  /**
   * Generates sample values for query parameters.
   */
  private generateQueryParamSamples(endpoint: EndpointInfo): Record<string, string> {
    const samples: Record<string, string> = {};

    for (const param of endpoint.queryParams || []) {
      if (param.required) {
        const value = this._sampleGenerator.generateParamValue(param.schema, param.example);
        samples[param.name] = String(value);
      }
    }

    return samples;
  }

  /**
   * Generates sample request body.
   * Prefers example from OpenAPI spec if available.
   */
  private generateBodySample(endpoint: EndpointInfo): string | undefined {
    // Use example from spec if available
    if (endpoint.requestBodyExample !== undefined) {
      return JSON.stringify(endpoint.requestBodyExample, null, 2);
    }

    // Fall back to generated sample from schema
    if (!endpoint.requestBodySchema || endpoint.requestBodySchema.length === 0) {
      return undefined;
    }

    const body = this._sampleGenerator.generateRequestBody(endpoint.requestBodySchema);
    return JSON.stringify(body, null, 2);
  }

  /**
   * Generates sample values for form data parameters.
   */
  private generateFormDataSamples(endpoint: EndpointInfo): Record<string, string> {
    const samples: Record<string, string> = {};

    for (const param of endpoint.formDataParams || []) {
      const value = this._sampleGenerator.generateParamValue(param.schema, param.example);
      samples[param.name] = String(value);
    }

    return samples;
  }

  /**
   * Checks if endpoint uses form-urlencoded content type.
   */
  private isFormData(endpoint: EndpointInfo): boolean {
    // Has formData params (Swagger 2.0)
    if (endpoint.formDataParams && endpoint.formDataParams.length > 0) {
      return true;
    }
    // Explicit consumes header
    if (endpoint.consumes?.includes('application/x-www-form-urlencoded')) {
      return true;
    }
    return false;
  }

  /**
   * Gets HTML content for the request panel.
   */
  private _getHtmlContent(options: RequestPanelOptions): string {
    const { endpoint, baseUrl, authHeader } = options;

    // DEBUG: Log ALL endpoint data for troubleshooting
    console.log('[Pe4King] ========== ENDPOINT DEBUG ==========');
    console.log('[Pe4King] Method:', endpoint.method);
    console.log('[Pe4King] Path:', endpoint.path);
    console.log('[Pe4King] formDataParams:', JSON.stringify(endpoint.formDataParams));
    console.log('[Pe4King] consumes:', JSON.stringify(endpoint.consumes));
    console.log('[Pe4King] requestBodySchema:', JSON.stringify(endpoint.requestBodySchema));
    console.log('[Pe4King] requestBodyExample:', JSON.stringify(endpoint.requestBodyExample));
    console.log('[Pe4King] pathParams:', JSON.stringify(endpoint.pathParams));
    console.log('[Pe4King] =====================================');

    const pathParamSamples = this.generatePathParamSamples(endpoint);
    const queryParams = this.generateQueryParamSamples(endpoint);
    const formDataParams = this.generateFormDataSamples(endpoint);
    const bodySample = this.generateBodySample(endpoint);

    const isFormEndpoint = this.isFormData(endpoint);
    console.log('[Pe4King] isFormEndpoint:', isFormEndpoint);

    const hasBody = ['POST', 'PUT', 'PATCH'].includes(endpoint.method);
    const allQueryParams = endpoint.queryParams || [];
    const allFormDataParams = endpoint.formDataParams || [];
    // Always default to JSON (like Postman)
    const defaultContentType = 'application/json';
    // Default body type: raw (JSON) - user can switch to form-data if needed
    const defaultBodyType = 'raw';

    // Extract path params from URL pattern (e.g., {petId})
    const pathParamNames = this.extractPathParams(endpoint.path);

    // Build content type options from consumes or defaults
    const defaultContentTypes = ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
    const contentTypes = endpoint.consumes && endpoint.consumes.length > 0
      ? [...new Set([...endpoint.consumes, ...defaultContentTypes])]
      : defaultContentTypes;

    const pathParamsHtml = pathParamNames.length > 0 ? `
  <div class="section" id="pathParamsSection">
    <div class="section-header" onclick="toggleSection('pathParamsSection')">
      <span class="section-title">
        <span class="section-toggle">▼</span>
        Path Parameters
      </span>
    </div>
    <div class="section-content">
      <table class="params-table">
        <thead>
          <tr>
            <th style="width: 30%">Name</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          ${pathParamNames.map(name => `
          <tr>
            <td>
              <span class="param-name">{${name}}</span>
              <span class="param-required">*</span>
            </td>
            <td>
              <input type="text" id="path_${name}" value="${this.escapeHtml(pathParamSamples[name] || '')}" placeholder="Required" onchange="updateUrl()">
            </td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
  ` : '';

    const queryParamsHtml = allQueryParams.length > 0 ? `
  <div class="section" id="queryParamsSection">
    <div class="section-header" onclick="toggleSection('queryParamsSection')">
      <span class="section-title">
        <span class="section-toggle">▼</span>
        Query Parameters
      </span>
    </div>
    <div class="section-content">
      <table class="params-table">
        <thead>
          <tr>
            <th style="width: 30%">Name</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          ${allQueryParams.map(param => `
          <tr>
            <td>
              <span class="param-name">${this.escapeHtml(param.name)}</span>
              ${param.required ? '<span class="param-required">*</span>' : ''}
              <div class="param-type">${param.schema?.fieldType || 'string'}</div>
            </td>
            <td>
              <input type="text" id="query_${param.name}" value="${this.escapeHtml(queryParams[param.name] || '')}" onchange="updateUrl()">
            </td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
  ` : '';

    // Build form data sample for form-data body type
    const formDataSampleStr = allFormDataParams.length > 0
      ? JSON.stringify(Object.fromEntries(allFormDataParams.map(p => [p.name, formDataParams[p.name] || ''])), null, 2)
      : '{}';

    // Body section with type selector (like Postman)
    const bodyHtml = hasBody ? `
  <div class="section" id="bodySection">
    <div class="section-header" onclick="toggleSection('bodySection')">
      <span class="section-title">
        <span class="section-toggle">▼</span>
        Body
      </span>
    </div>
    <div class="section-content">
      <div class="body-type-selector">
        <label class="body-type-option">
          <input type="radio" name="bodyType" value="none" onchange="onBodyTypeChange(this.value)">
          <span>none</span>
        </label>
        <label class="body-type-option">
          <input type="radio" name="bodyType" value="form-data" onchange="onBodyTypeChange(this.value)">
          <span>form-data</span>
        </label>
        <label class="body-type-option">
          <input type="radio" name="bodyType" value="x-www-form-urlencoded" onchange="onBodyTypeChange(this.value)">
          <span>x-www-form-urlencoded</span>
        </label>
        <label class="body-type-option">
          <input type="radio" name="bodyType" value="raw" checked onchange="onBodyTypeChange(this.value)">
          <span>raw (JSON)</span>
        </label>
      </div>

      <!-- Raw body editor (shown by default) -->
      <div id="rawBodyContainer">
        <textarea class="body-editor" id="bodyEditor">${this.escapeHtml(bodySample || '{}')}</textarea>
      </div>

      <!-- Form data key-value editor (hidden by default) -->
      <div id="formDataContainer" style="display: none;">
        <table class="params-table" id="formDataTable">
          <thead>
            <tr>
              <th style="width: 30%">Key</th>
              <th>Value</th>
              <th style="width: 40px"></th>
            </tr>
          </thead>
          <tbody id="formDataBody">
            ${allFormDataParams.map(param => `
            <tr>
              <td><input type="text" class="form-key" value="${this.escapeHtml(param.name)}"></td>
              <td><input type="text" class="form-value" value="${this.escapeHtml(formDataParams[param.name] || '')}"></td>
              <td><button class="btn-icon" onclick="removeFormRow(this)" title="Remove">×</button></td>
            </tr>
            `).join('')}
            ${allFormDataParams.length === 0 ? `
            <tr>
              <td><input type="text" class="form-key" value="" placeholder="key"></td>
              <td><input type="text" class="form-value" value="" placeholder="value"></td>
              <td><button class="btn-icon" onclick="removeFormRow(this)" title="Remove">×</button></td>
            </tr>
            ` : ''}
          </tbody>
        </table>
        <button class="btn-secondary btn-small" onclick="addFormRow()" style="margin-top: 8px;">+ Add Row</button>
      </div>

      <!-- None body message -->
      <div id="noneBodyContainer" style="display: none;">
        <div class="empty-body-message">This request does not have a body</div>
      </div>
    </div>
  </div>
  ` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Request Panel</title>
  <style>
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
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
    }
    .method-badge {
      font-family: monospace;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    .method-get { background: #61affe22; color: #61affe; }
    .method-post { background: #49cc9022; color: #49cc90; }
    .method-put { background: #fca13022; color: #fca130; }
    .method-patch { background: #50e3c222; color: #50e3c2; }
    .method-delete { background: #f93e3e22; color: #f93e3e; }
    .endpoint-path {
      font-family: monospace;
      font-size: 1em;
      flex: 1;
      word-break: break-all;
    }

    /* URL Bar */
    .url-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .url-input {
      flex: 1;
      padding: 10px 12px;
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-family: monospace;
      font-size: inherit;
    }
    .url-input:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }

    /* Buttons */
    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: inherit;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-weight: 500;
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    /* Sections */
    .section {
      margin-bottom: 16px;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      cursor: pointer;
      user-select: none;
    }
    .section-title {
      font-weight: 600;
      font-size: 0.95em;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-toggle {
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
    }
    .section-content {
      padding-left: 4px;
    }
    .section.collapsed .section-content {
      display: none;
    }
    .section.collapsed .section-toggle {
      transform: rotate(-90deg);
    }

    /* Params table */
    .params-table {
      width: 100%;
      border-collapse: collapse;
    }
    .params-table th,
    .params-table td {
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid var(--vscode-panel-border, #2d2d2d);
    }
    .params-table th {
      font-weight: 500;
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    .params-table input {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 3px;
      font-family: monospace;
      font-size: inherit;
    }
    .params-table input:focus,
    .params-table select:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    .params-table select {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 3px;
      font-family: monospace;
      font-size: inherit;
      cursor: pointer;
    }
    .param-name {
      font-family: monospace;
      font-weight: 500;
    }
    .param-required {
      color: #f93e3e;
      margin-left: 2px;
    }
    .param-type {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }

    /* Body type selector */
    .body-type-selector {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--vscode-panel-border, #2d2d2d);
    }
    .body-type-option {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 0.9em;
    }
    .body-type-option input[type="radio"] {
      margin: 0;
      cursor: pointer;
    }
    .body-type-option span {
      color: var(--vscode-foreground);
    }
    .empty-body-message {
      padding: 20px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    .btn-icon {
      background: transparent;
      border: none;
      color: var(--vscode-descriptionForeground);
      font-size: 16px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 3px;
    }
    .btn-icon:hover {
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-errorForeground);
    }

    /* Body editor */
    .body-editor {
      width: 100%;
      min-height: 150px;
      padding: 12px;
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-family: monospace;
      font-size: inherit;
      resize: vertical;
      line-height: 1.4;
    }
    .body-editor:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    /* Response section */
    .response-section {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-panel-border, #3c3c3c);
    }
    .response-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .status-badge {
      padding: 4px 10px;
      border-radius: 4px;
      font-weight: 600;
      font-family: monospace;
    }
    .status-2xx { background: #49cc9022; color: #49cc90; }
    .status-3xx { background: #61affe22; color: #61affe; }
    .status-4xx { background: #fca13022; color: #fca130; }
    .status-5xx { background: #f93e3e22; color: #f93e3e; }
    .response-meta {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    .response-body {
      background: var(--vscode-textBlockQuote-background);
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
      border-radius: 4px;
      padding: 12px;
      font-family: monospace;
      font-size: 0.9em;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 400px;
      overflow-y: auto;
    }
    .response-headers-content {
      background: var(--vscode-textBlockQuote-background);
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
      border-radius: 4px;
      padding: 8px 12px;
      font-family: monospace;
      font-size: 0.85em;
      max-height: 150px;
      overflow-y: auto;
    }

    /* Loading state */
    .loading {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px;
      color: var(--vscode-descriptionForeground);
    }
    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--vscode-progressBar-background);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Error state */
    .error {
      background: #f93e3e22;
      border: 1px solid #f93e3e44;
      color: #f93e3e;
      padding: 12px;
      border-radius: 4px;
      font-family: monospace;
    }

    /* JSON syntax highlighting */
    .json-key { color: #9cdcfe; }
    .json-string { color: #ce9178; }
    .json-number { color: #b5cea8; }
    .json-boolean { color: #569cd6; }
    .json-null { color: #569cd6; }

    /* Empty state */
    .empty-response {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
    }

    /* Actions bar */
    .actions-bar {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .btn-small {
      padding: 4px 8px;
      font-size: 0.85em;
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-content {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      width: 400px;
      max-width: 90%;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .modal-header h3 {
      margin: 0;
      font-size: 1em;
    }
    .btn-close {
      background: transparent;
      border: none;
      font-size: 1.5em;
      cursor: pointer;
      color: var(--vscode-foreground);
      padding: 0 4px;
    }
    .modal-body {
      padding: 16px;
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .form-group {
      margin-bottom: 12px;
    }
    .form-group label {
      display: block;
      margin-bottom: 4px;
      font-size: 0.9em;
      color: var(--vscode-foreground);
    }
    .form-input {
      width: 100%;
      padding: 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: inherit;
    }

    /* Scripts section */
    .scripts-tabs { display: flex; border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 8px; }
    .script-tab { padding: 6px 12px; cursor: pointer; border: none; background: transparent; color: var(--vscode-descriptionForeground); border-bottom: 2px solid transparent; margin-bottom: -1px; }
    .script-tab:hover { color: var(--vscode-foreground); }
    .script-tab.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder); }
    .script-editor { width: 100%; min-height: 120px; padding: 12px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical; }
    .script-content { display: none; }
    .script-content.active { display: block; }
    .script-help { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
    .test-results { margin-top: 12px; padding: 12px; border-radius: 4px; }
    .test-results.success { background: #49cc9022; border: 1px solid #49cc9044; }
    .test-results.failure { background: #f93e3e22; border: 1px solid #f93e3e44; }
    .test-summary { font-weight: 500; margin-bottom: 8px; }
    .test-passed { color: #49cc90; }
    .test-failed { color: #f93e3e; }
    .test-list { margin-top: 8px; }
    .test-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--vscode-panel-border); }
    .test-item:last-child { border-bottom: none; }
    .test-icon { font-size: 14px; width: 18px; }
    .test-icon.pass { color: #49cc90; }
    .test-icon.fail { color: #f93e3e; }
    .test-name { font-family: monospace; font-size: 0.9em; flex: 1; }
    .test-expand { font-size: 10px; color: var(--vscode-descriptionForeground); width: 12px; transition: transform 0.2s; }
    .script-output { background: var(--vscode-textBlockQuote-background); padding: 8px; border-radius: 4px; font-family: monospace; font-size: 0.85em; margin-top: 8px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="header">
    <span class="method-badge method-${endpoint.method.toLowerCase()}">${endpoint.method}</span>
    <span class="endpoint-path">${this.escapeHtml(endpoint.path)}</span>
  </div>

  <div class="url-bar">
    <input type="text" class="url-input" id="urlInput" value="${this.escapeHtml(this.buildInitialUrl(baseUrl, endpoint.path, pathParamSamples))}">
    <button class="btn-primary" onclick="sendRequest()">Send</button>
    <button class="btn-secondary" onclick="copyAsCurl()" title="Copy as curl">Copy</button>
    <button class="btn-secondary" onclick="showSaveModal()" title="Save to collection">Save</button>
  </div>

  <!-- Save to Collection Modal -->
  <div id="saveModal" class="modal-overlay" style="display: none;">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Save to Collection</h3>
        <button class="btn-close" onclick="hideSaveModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Request Name</label>
          <input type="text" id="saveRequestName" class="form-input" value="${this.escapeHtml(endpoint.operationId || endpoint.path)}">
        </div>
        <div class="form-group">
          <label>Collection</label>
          <div style="display: flex; gap: 8px;">
            <select id="saveCollectionId" class="form-input" style="flex: 1;" onchange="loadFolders()">
              <option value="">Select collection...</option>
            </select>
            <button class="btn-secondary" onclick="createNewCollection()" title="New collection">+</button>
          </div>
        </div>
        <div class="form-group" id="folderGroup" style="display: none;">
          <label>Folder (optional)</label>
          <select id="saveFolderId" class="form-input">
            <option value="">Root</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="hideSaveModal()">Cancel</button>
        <button class="btn-primary" onclick="saveToCollection()">Save</button>
      </div>
    </div>
  </div>

  ${pathParamsHtml}
  ${queryParamsHtml}

  <div class="section" id="headersSection">
    <div class="section-header" onclick="toggleSection('headersSection')">
      <span class="section-title">
        <span class="section-toggle">▼</span>
        Headers (v2)
      </span>
    </div>
    <div class="section-content">
      <table class="params-table">
        <thead>
          <tr>
            <th style="width: 30%">Name</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="param-name">Authorization</span></td>
            <td><input type="text" id="header_Authorization" value="${this.escapeHtml(authHeader || '')}" placeholder="Bearer token..."></td>
          </tr>
          <tr>
            <td><span class="param-name">Content-Type</span></td>
            <td>
              <select id="header_Content-Type">
                ${contentTypes.map(ct => `<option value="${ct}"${ct === defaultContentType ? ' selected' : ''}>${ct}</option>`).join('')}
              </select>
            </td>
          </tr>
          <tr>
            <td><span class="param-name">Accept</span></td>
            <td><input type="text" id="header_Accept" value="application/json"></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  ${bodyHtml}

  <div class="section" id="scriptsSection">
    <div class="section-header" onclick="toggleSection('scriptsSection')">
      <span class="section-title">
        <span class="section-toggle">▼</span>
        Scripts (Python)
      </span>
    </div>
    <div class="section-content">
      <div class="scripts-tabs">
        <button class="script-tab active" onclick="switchScriptTab('preRequest')">Pre-request</button>
        <button class="script-tab" onclick="switchScriptTab('test')">Tests</button>
      </div>
      <div id="preRequestContent" class="script-content active">
        <div class="script-help">
          Runs before the request. Available: <code>request</code> (method, url, headers, body), <code>set_header(name, value)</code>, <code>set_body(body)</code>, <code>log(...)</code>
        </div>
        <textarea class="script-editor" id="preRequestScript" placeholder="# Pre-request script (Python)
# Example: set_header('X-Timestamp', str(int(time.time())))"></textarea>
      </div>
      <div id="testContent" class="script-content">
        <div class="script-help">
          Runs after response. Available: <code>response</code> (status, headers, body, time_ms), <code>test(condition, message)</code>, <code>log(...)</code>
        </div>
        <textarea class="script-editor" id="testScript" placeholder="# Test script (Python)
# Example:
# test(response['status'] == 200, 'Status should be 200')
# test('id' in response['body'], 'Response should have id')"></textarea>
      </div>
      <div id="scriptResults"></div>
    </div>
  </div>

  <div class="response-section" id="responseSection">
    <div class="response-header">
      <span class="section-title">Response</span>
    </div>
    <div id="responseContent">
      <div class="empty-response">
        Click "Send" to execute the request
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    const state = {
      baseUrl: ${JSON.stringify(baseUrl)},
      path: ${JSON.stringify(endpoint.path)},
      method: ${JSON.stringify(endpoint.method)},
      pathParams: ${JSON.stringify(pathParamNames)},
      queryParams: ${JSON.stringify(allQueryParams.map(p => p.name))},
      formDataParams: ${JSON.stringify(allFormDataParams.map(p => p.name))},
      bodyType: 'raw', // none, form-data, x-www-form-urlencoded, raw
      activeScriptTab: 'preRequest'
    };

    function toggleSection(sectionId) {
      const section = document.getElementById(sectionId);
      section.classList.toggle('collapsed');
    }

    function switchScriptTab(tab) {
      state.activeScriptTab = tab;
      document.querySelectorAll('.script-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.script-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.script-tab[onclick*="' + tab + '"]').classList.add('active');
      document.getElementById(tab + 'Content').classList.add('active');
    }

    function getScripts() {
      const preRequest = document.getElementById('preRequestScript')?.value?.trim() || '';
      const test = document.getElementById('testScript')?.value?.trim() || '';
      if (!preRequest && !test) return undefined;
      return { preRequest: preRequest || undefined, test: test || undefined };
    }

    function renderScriptResult(result, type) {
      const container = document.getElementById('scriptResults');
      if (!result) return;

      const isSuccess = result.success;
      const assertions = result.assertions || { passed: 0, failed: 0, errors: [], tests: [] };
      const tests = assertions.tests || [];

      let html = '<div class="test-results ' + (isSuccess ? 'success' : 'failure') + '">';
      html += '<div class="test-summary">';
      html += type === 'preRequest' ? 'Pre-request: ' : 'Tests: ';
      html += '<span class="test-passed">' + assertions.passed + ' passed</span>';
      if (assertions.failed > 0) {
        html += ', <span class="test-failed">' + assertions.failed + ' failed</span>';
      }
      html += '</div>';

      // Show individual test results
      if (tests.length > 0) {
        html += '<div class="test-list">';
        for (var i = 0; i < tests.length; i++) {
          var t = tests[i];
          var icon = t.passed ? '✓' : '✗';
          var iconClass = t.passed ? 'pass' : 'fail';
          html += '<div class="test-item" onclick="toggleTestDebug(' + i + ')" style="cursor: pointer;">';
          html += '<span class="test-expand">▶</span>';
          html += '<span class="test-icon ' + iconClass + '">' + icon + '</span>';
          html += '<span class="test-name">' + escapeHtml(t.name) + '</span>';
          html += '</div>';
          html += '<div class="test-debug" id="test-debug-' + i + '" style="display: none; padding: 8px 8px 8px 32px; background: var(--vscode-textBlockQuote-background); font-family: monospace; font-size: 0.8em; border-radius: 4px; margin: 4px 0;">';
          if (t.actual !== undefined && t.expected !== undefined) {
            html += '<div>Expected: <span style="color: #49cc90;">' + escapeHtml(t.expected) + '</span></div>';
            html += '<div>Actual: <span style="color: ' + (t.passed ? '#49cc90' : '#f93e3e') + ';">' + escapeHtml(t.actual) + '</span></div>';
          } else {
            html += '<div>Result: <span style="color: ' + (t.passed ? '#49cc90' : '#f93e3e') + '">' + (t.passed ? 'PASSED' : 'FAILED') + '</span></div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }

      if (result.output) {
        html += '<div class="script-output">' + escapeHtml(result.output) + '</div>';
      }

      if (result.error) {
        html += '<div class="error" style="margin-top: 8px;">' + escapeHtml(result.error) + '</div>';
      }

      html += '</div>';

      if (type === 'preRequest') {
        container.innerHTML = html;
      } else {
        container.innerHTML += html;
      }
    }

    function toggleTestDebug(index) {
      const debugEl = document.getElementById('test-debug-' + index);
      const items = document.querySelectorAll('.test-item');
      if (!debugEl || !items[index]) return;

      const expandIcon = items[index].querySelector('.test-expand');
      if (debugEl.style.display === 'none') {
        debugEl.style.display = 'block';
        if (expandIcon) expandIcon.textContent = '▼';
      } else {
        debugEl.style.display = 'none';
        if (expandIcon) expandIcon.textContent = '▶';
      }
    }

    function updateUrl() {
      let url = state.baseUrl + state.path;

      // Replace path parameters
      for (const param of state.pathParams) {
        const input = document.getElementById('path_' + param);
        if (input && input.value) {
          url = url.replace('{' + param + '}', encodeURIComponent(input.value));
        }
      }

      // Add query parameters
      const queryParts = [];
      for (const param of state.queryParams) {
        const input = document.getElementById('query_' + param);
        if (input && input.value) {
          queryParts.push(encodeURIComponent(param) + '=' + encodeURIComponent(input.value));
        }
      }
      if (queryParts.length > 0) {
        url += '?' + queryParts.join('&');
      }

      document.getElementById('urlInput').value = url;
    }

    function getHeaders() {
      const headers = {};
      const authInput = document.getElementById('header_Authorization');
      const contentTypeInput = document.getElementById('header_Content-Type');
      const acceptInput = document.getElementById('header_Accept');

      if (authInput && authInput.value) {
        headers['Authorization'] = authInput.value;
      }
      if (contentTypeInput && contentTypeInput.value) {
        headers['Content-Type'] = contentTypeInput.value;
      }
      if (acceptInput && acceptInput.value) {
        headers['Accept'] = acceptInput.value;
      }

      return headers;
    }

    function getBody() {
      // No body for 'none' type
      if (state.bodyType === 'none') {
        return undefined;
      }

      // For form-data and x-www-form-urlencoded, encode form fields
      if (state.bodyType === 'form-data' || state.bodyType === 'x-www-form-urlencoded') {
        const rows = document.querySelectorAll('#formDataBody tr');
        const parts = [];
        rows.forEach(row => {
          const keyInput = row.querySelector('.form-key');
          const valueInput = row.querySelector('.form-value');
          if (keyInput && valueInput && keyInput.value.trim()) {
            parts.push(encodeURIComponent(keyInput.value) + '=' + encodeURIComponent(valueInput.value));
          }
        });
        return parts.length > 0 ? parts.join('&') : undefined;
      }

      // For raw body (JSON)
      const bodyEditor = document.getElementById('bodyEditor');
      return bodyEditor ? bodyEditor.value : undefined;
    }

    function onBodyTypeChange(type) {
      state.bodyType = type;

      // Show/hide appropriate containers
      const rawContainer = document.getElementById('rawBodyContainer');
      const formContainer = document.getElementById('formDataContainer');
      const noneContainer = document.getElementById('noneBodyContainer');

      if (rawContainer) rawContainer.style.display = type === 'raw' ? 'block' : 'none';
      if (formContainer) formContainer.style.display = (type === 'form-data' || type === 'x-www-form-urlencoded') ? 'block' : 'none';
      if (noneContainer) noneContainer.style.display = type === 'none' ? 'block' : 'none';

      // Update Content-Type header
      const contentTypeSelect = document.getElementById('header_Content-Type');
      if (contentTypeSelect) {
        switch (type) {
          case 'none':
            // Keep current or remove
            break;
          case 'form-data':
            contentTypeSelect.value = 'multipart/form-data';
            break;
          case 'x-www-form-urlencoded':
            contentTypeSelect.value = 'application/x-www-form-urlencoded';
            break;
          case 'raw':
            contentTypeSelect.value = 'application/json';
            break;
        }
      }
    }

    function addFormRow() {
      const tbody = document.getElementById('formDataBody');
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td><input type="text" class="form-key" value="" placeholder="key"></td>
        <td><input type="text" class="form-value" value="" placeholder="value"></td>
        <td><button class="btn-icon" onclick="removeFormRow(this)" title="Remove">×</button></td>
      \`;
      tbody.appendChild(tr);
    }

    function removeFormRow(btn) {
      const row = btn.closest('tr');
      const tbody = document.getElementById('formDataBody');
      // Keep at least one row
      if (tbody.children.length > 1) {
        row.remove();
      } else {
        // Clear values instead of removing
        row.querySelector('.form-key').value = '';
        row.querySelector('.form-value').value = '';
      }
    }

    function sendRequest() {
      const url = document.getElementById('urlInput').value;
      const headers = getHeaders();
      const body = getBody();
      const scripts = getScripts();

      // Clear previous script results
      document.getElementById('scriptResults').innerHTML = '';

      vscode.postMessage({
        type: 'sendRequest',
        url,
        method: state.method,
        headers,
        body: body && body.trim() ? body : undefined,
        scripts
      });
    }

    function copyAsCurl() {
      const url = document.getElementById('urlInput').value;
      const headers = getHeaders();
      const body = getBody();

      vscode.postMessage({
        type: 'copyAsCurl',
        url,
        method: state.method,
        headers,
        body: body && body.trim() ? body : undefined
      });
    }

    function formatJson(json) {
      try {
        const obj = typeof json === 'string' ? JSON.parse(json) : json;
        return syntaxHighlight(JSON.stringify(obj, null, 2));
      } catch {
        return escapeHtml(json);
      }
    }

    function syntaxHighlight(json) {
      json = escapeHtml(json);
      return json.replace(
        /("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g,
        function (match) {
          let cls = 'json-number';
          if (/^"/.test(match)) {
            if (/:$/.test(match)) {
              cls = 'json-key';
            } else {
              cls = 'json-string';
            }
          } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
          } else if (/null/.test(match)) {
            cls = 'json-null';
          }
          return '<span class="' + cls + '">' + match + '</span>';
        }
      );
    }

    function escapeHtml(str) {
      if (typeof str !== 'string') return String(str);
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function getStatusClass(status) {
      if (status >= 200 && status < 300) return 'status-2xx';
      if (status >= 300 && status < 400) return 'status-3xx';
      if (status >= 400 && status < 500) return 'status-4xx';
      return 'status-5xx';
    }

    function formatHeaders(headers) {
      if (!headers) return '';
      return Object.entries(headers)
        .map(([key, value]) => key + ': ' + (Array.isArray(value) ? value.join(', ') : value))
        .join('\\n');
    }

    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      const responseContent = document.getElementById('responseContent');

      switch (message.type) {
        case 'loading':
          responseContent.innerHTML = \`
            <div class="loading">
              <div class="spinner"></div>
              <span>Sending request...</span>
            </div>
          \`;
          break;

        case 'preRequestResult':
          renderScriptResult(message.result, 'preRequest');
          break;

        case 'testResult':
          renderScriptResult(message.result, 'test');
          break;

        case 'response':
          const result = message.result;

          if (!result.success) {
            responseContent.innerHTML = \`
              <div class="error">\${escapeHtml(result.error || 'Request failed')}</div>
              <div class="response-meta" style="margin-top: 8px;">
                Time: \${result.time || 0}ms
              </div>
            \`;
            return;
          }

          const headersHtml = result.headers ? \`
            <div class="section collapsed" id="responseHeadersSection">
              <div class="section-header" onclick="toggleSection('responseHeadersSection')">
                <span class="section-title">
                  <span class="section-toggle">▼</span>
                  Response Headers
                </span>
              </div>
              <div class="section-content">
                <div class="response-headers-content">\${escapeHtml(formatHeaders(result.headers))}</div>
              </div>
            </div>
          \` : '';

          responseContent.innerHTML = \`
            <div class="response-header">
              <span class="status-badge \${getStatusClass(result.status)}">\${result.status} \${result.statusText}</span>
              <span class="response-meta">\${result.time}ms · \${formatSize(result.size || 0)}</span>
            </div>
            \${headersHtml}
            <div class="response-body">\${formatJson(result.body || '')}</div>
            <div class="actions-bar">
              <button class="btn-secondary btn-small" onclick="copyResponse()">Copy Response</button>
            </div>
          \`;
          break;
      }
    });

    function copyResponse() {
      const responseBody = document.querySelector('.response-body');
      if (responseBody) {
        // Get text content without HTML formatting
        const text = responseBody.textContent || '';
        navigator.clipboard.writeText(text);
      }
    }

    // ========== Save to Collection ==========
    let collectionsData = [];

    function showSaveModal() {
      vscode.postMessage({ type: 'getCollections' });
      document.getElementById('saveModal').style.display = 'flex';
    }

    function hideSaveModal() {
      document.getElementById('saveModal').style.display = 'none';
    }

    function loadFolders() {
      const collectionId = document.getElementById('saveCollectionId').value;
      const folderGroup = document.getElementById('folderGroup');
      const folderSelect = document.getElementById('saveFolderId');

      if (!collectionId) {
        folderGroup.style.display = 'none';
        return;
      }

      const collection = collectionsData.find(c => c.id === collectionId);
      if (collection && collection.folders.length > 0) {
        folderSelect.innerHTML = '<option value="">Root</option>' +
          collection.folders.map(f => '<option value="' + f.id + '">' + f.name + '</option>').join('');
        folderGroup.style.display = 'block';
      } else {
        folderGroup.style.display = 'none';
      }
    }

    function saveToCollection() {
      const name = document.getElementById('saveRequestName').value.trim();
      const collectionId = document.getElementById('saveCollectionId').value;
      const folderId = document.getElementById('saveFolderId').value || undefined;

      if (!name) {
        alert('Please enter a request name');
        return;
      }
      if (!collectionId) {
        alert('Please select a collection');
        return;
      }

      const url = document.getElementById('urlInput').value;
      const headers = getHeaders();
      const body = getBody();

      vscode.postMessage({
        type: 'saveToCollection',
        name,
        url,
        method: state.method,
        headers,
        body,
        bodyType: state.bodyType,
        collectionId,
        folderId
      });

      hideSaveModal();
    }

    function createNewCollection() {
      const name = prompt('New collection name:');
      if (name && name.trim()) {
        vscode.postMessage({ type: 'createCollection', name: name.trim() });
      }
    }

    // Handle collections data from extension
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'collectionsData') {
        collectionsData = message.collections || [];
        const select = document.getElementById('saveCollectionId');
        const currentValue = select.value;
        select.innerHTML = '<option value="">Select collection...</option>' +
          collectionsData.map(c => '<option value="' + c.id + '">' + c.name + '</option>').join('');
        // Restore or select new collection
        if (currentValue) {
          select.value = currentValue;
        } else if (collectionsData.length > 0) {
          select.value = collectionsData[collectionsData.length - 1].id;
          loadFolders();
        }
      }
    });

    // Initialize URL
    updateUrl();
  </script>
</body>
</html>`;
  }

  /**
   * Builds initial URL with path parameters replaced.
   */
  private buildInitialUrl(baseUrl: string, path: string, pathParams: Record<string, string>): string {
    let url = baseUrl + path;
    for (const [name, value] of Object.entries(pathParams)) {
      url = url.replace(`{${name}}`, encodeURIComponent(value));
    }
    return url;
  }

  /**
   * Escapes HTML special characters.
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Gets display name for a test snippet.
   */
  private _getSnippetDisplayName(snippet: TestSnippet): string {
    return getSnippetDisplayName(snippet);
  }

  /**
   * Gets HTML content for a saved request.
   */
  private _getSavedRequestHtmlContent(request: SavedRequest, collectionId: string): string {
    const headersEntries = Object.entries(request.headers || {});
    const preRequestScript = request.scripts?.preRequest || '';
    const testScript = request.scripts?.test || '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>${request.method} ${request.name}</title>
  <style>
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
    }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .method-badge { font-family: monospace; font-weight: 600; padding: 4px 10px; border-radius: 4px; }
    .method-get { background: #61affe22; color: #61affe; }
    .method-post { background: #49cc9022; color: #49cc90; }
    .method-put { background: #fca13022; color: #fca130; }
    .method-patch { background: #50e3c222; color: #50e3c2; }
    .method-delete { background: #f93e3e22; color: #f93e3e; }
    .request-name { font-size: 1.1em; font-weight: 500; }
    .url-bar { display: flex; gap: 8px; margin-bottom: 16px; }
    .url-input { flex: 1; padding: 10px 12px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-family: monospace; }
    button { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .section { margin-bottom: 16px; }
    .section-header { cursor: pointer; margin-bottom: 8px; font-weight: 600; }
    .section-toggle { margin-right: 6px; }
    .params-table { width: 100%; border-collapse: collapse; }
    .params-table th, .params-table td { padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); }
    .params-table input { width: 100%; padding: 6px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-family: monospace; }
    .body-editor { width: 100%; min-height: 150px; padding: 12px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-family: monospace; resize: vertical; }
    .response-section { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--vscode-panel-border); }
    .status-badge { padding: 4px 10px; border-radius: 4px; font-weight: 600; font-family: monospace; }
    .status-2xx { background: #49cc9022; color: #49cc90; }
    .status-4xx { background: #fca13022; color: #fca130; }
    .status-5xx { background: #f93e3e22; color: #f93e3e; }
    .response-body { background: var(--vscode-textBlockQuote-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 12px; font-family: monospace; overflow-x: auto; white-space: pre-wrap; max-height: 400px; overflow-y: auto; }
    .loading { display: flex; align-items: center; gap: 12px; padding: 20px; color: var(--vscode-descriptionForeground); }
    .spinner { width: 20px; height: 20px; border: 2px solid var(--vscode-progressBar-background); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error { background: #f93e3e22; border: 1px solid #f93e3e44; color: #f93e3e; padding: 12px; border-radius: 4px; font-family: monospace; }
    .json-key { color: #9cdcfe; }
    .json-string { color: #ce9178; }
    .json-number { color: #b5cea8; }
    .json-boolean { color: #569cd6; }

    /* Scripts section */
    .scripts-tabs { display: flex; border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 8px; }
    .script-tab { padding: 6px 12px; cursor: pointer; border: none; background: transparent; color: var(--vscode-descriptionForeground); border-bottom: 2px solid transparent; margin-bottom: -1px; }
    .script-tab:hover { color: var(--vscode-foreground); }
    .script-tab.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder); }
    .script-editor { width: 100%; min-height: 120px; padding: 12px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical; }
    .script-content { display: none; }
    .script-content.active { display: block; }
    .script-help { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
    .test-results { margin-top: 12px; padding: 12px; border-radius: 4px; }
    .test-results.success { background: #49cc9022; border: 1px solid #49cc9044; }
    .test-results.failure { background: #f93e3e22; border: 1px solid #f93e3e44; }
    .test-summary { font-weight: 500; margin-bottom: 8px; }
    .test-passed { color: #49cc90; }
    .test-failed { color: #f93e3e; }
    .test-list { margin-top: 8px; }
    .test-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--vscode-panel-border); }
    .test-item:last-child { border-bottom: none; }
    .test-icon { font-size: 14px; width: 18px; }
    .test-icon.pass { color: #49cc90; }
    .test-icon.fail { color: #f93e3e; }
    .test-name { font-family: monospace; font-size: 0.9em; flex: 1; }
    .test-expand { font-size: 10px; color: var(--vscode-descriptionForeground); width: 12px; transition: transform 0.2s; }
    .script-output { background: var(--vscode-textBlockQuote-background); padding: 8px; border-radius: 4px; font-family: monospace; font-size: 0.85em; margin-top: 8px; white-space: pre-wrap; }

    /* Snippets section */
    .snippets-section { margin-bottom: 16px; }
    .snippets-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .snippets-title { font-weight: 600; }
    .btn-add-test { padding: 4px 8px; font-size: 0.85em; }
    .snippet-list { border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
    .snippet-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
    .snippet-item:last-child { border-bottom: none; }
    .snippet-icon { color: var(--vscode-textLink-foreground); }
    .snippet-name { flex: 1; font-family: monospace; font-size: 0.9em; }
    .snippet-remove { background: transparent; border: none; color: var(--vscode-descriptionForeground); cursor: pointer; padding: 2px 6px; border-radius: 3px; }
    .snippet-remove:hover { background: var(--vscode-list-hoverBackground); color: #f93e3e; }
    .empty-snippets { padding: 20px; text-align: center; color: var(--vscode-descriptionForeground); }

    /* Snippet picker modal */
    .snippet-picker { display: none; position: fixed; top: 0; right: 0; bottom: 0; width: 320px; background: var(--vscode-sideBar-background); border-left: 1px solid var(--vscode-panel-border); z-index: 1000; overflow-y: auto; }
    .snippet-picker.open { display: block; }
    .picker-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--vscode-panel-border); }
    .picker-title { font-weight: 600; }
    .picker-close { background: transparent; border: none; font-size: 1.5em; cursor: pointer; color: var(--vscode-foreground); }
    .picker-category { padding: 8px 16px; font-weight: 500; color: var(--vscode-descriptionForeground); background: var(--vscode-editor-background); }
    .picker-item { display: flex; align-items: center; gap: 10px; padding: 10px 16px; cursor: pointer; border-bottom: 1px solid var(--vscode-panel-border); }
    .picker-item:hover { background: var(--vscode-list-hoverBackground); }
    .picker-item-name { font-weight: 500; }
    .picker-item-desc { font-size: 0.85em; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <div class="header">
    <span class="method-badge method-${request.method.toLowerCase()}">${request.method}</span>
    <span class="request-name">${this.escapeHtml(request.name)}</span>
  </div>

  <div class="url-bar">
    <input type="text" class="url-input" id="urlInput" value="${this.escapeHtml(request.url)}">
    <button class="btn-primary" onclick="sendRequest()">Send</button>
    <button class="btn-secondary" onclick="copyAsCurl()">Copy</button>
  </div>

  <div class="section">
    <div class="section-header">Headers</div>
    <table class="params-table">
      <tbody>
        ${headersEntries.map(([key, value]) => `
        <tr>
          <td style="width: 30%"><input type="text" id="hkey_${key}" value="${this.escapeHtml(key)}"></td>
          <td><input type="text" id="hval_${key}" value="${this.escapeHtml(value)}"></td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  ${request.body ? `
  <div class="section">
    <div class="section-header">Body</div>
    <textarea class="body-editor" id="bodyEditor">${this.escapeHtml(request.body)}</textarea>
  </div>
  ` : ''}

  <!-- Snippet Picker Panel -->
  <div id="snippetPicker" class="snippet-picker">
    <div class="picker-header">
      <span class="picker-title">Add Test Snippet</span>
      <button class="picker-close" onclick="closeSnippetPicker()">×</button>
    </div>
    <div id="snippetPickerContent">Loading...</div>
  </div>

  <div class="section">
    <div class="section-header" style="display: flex; justify-content: space-between; align-items: center;">
      <span>Scripts (Python)</span>
      <button class="btn-secondary btn-add-test" onclick="openSnippetPicker()" title="Insert test snippet">+ Snippet</button>
    </div>
    <div class="scripts-tabs">
      <button class="script-tab active" onclick="switchScriptTab('preRequest')">Pre-request</button>
      <button class="script-tab" onclick="switchScriptTab('test')">Tests</button>
    </div>
    <div id="preRequestContent" class="script-content active">
      <div class="script-help">
        Runs before the request. Available: <code>request</code> (method, url, headers, body), <code>set_header(name, value)</code>, <code>set_body(body)</code>, <code>log(...)</code>
      </div>
      <textarea class="script-editor" id="preRequestScript" placeholder="# Pre-request script (Python)
# Example: set_header('X-Timestamp', str(int(time.time())))">${this.escapeHtml(preRequestScript)}</textarea>
    </div>
    <div id="testContent" class="script-content">
      <div class="script-help">
        Runs after response. Available: <code>response</code> (status, headers, body, time_ms), <code>test(condition, message)</code>, <code>log(...)</code>
      </div>
      <textarea class="script-editor" id="testScript" placeholder="# Test script (Python)
# Example:
# test(response['status'] == 200, 'Status should be 200')
# test('id' in response['body'], 'Response should have id')">${this.escapeHtml(testScript)}</textarea>
    </div>
    <div id="scriptResults"></div>
  </div>

  <div class="section">
    <div class="section-header" style="display: flex; justify-content: space-between; align-items: center;">
      <span>Variables</span>
      <button class="btn-secondary btn-add-test" onclick="showAddVariable()">+ Variable</button>
    </div>
    <div id="variablesList">
      ${(request.extractVariables || []).map((v: { name: string; path: string }, i: number) => `
        <div class="variable-item" style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border);">
          <span style="color: #fca130; font-family: monospace;">{{${this.escapeHtml(v.name)}}}</span>
          <span style="flex: 1; color: var(--vscode-descriptionForeground); font-family: monospace; font-size: 0.85em;">${this.escapeHtml(v.path)}</span>
          <button class="btn-icon" onclick="removeVariable(${i})" title="Remove">×</button>
        </div>
      `).join('')}
    </div>
    <div id="addVariableForm" style="display: none; margin-top: 8px; padding: 8px; background: var(--vscode-input-background); border-radius: 4px;">
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <input type="text" id="varName" placeholder="Variable name" style="flex: 1; padding: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px;">
        <input type="text" id="varPath" placeholder="JSONPath (e.g. $.data.id)" style="flex: 2; padding: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px;">
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button class="btn-secondary" onclick="hideAddVariable()">Cancel</button>
        <button class="btn-primary" onclick="addVariable()">Add</button>
      </div>
    </div>
  </div>

  <div class="response-section">
    <div class="section-header">Response</div>
    <div id="responseContent">
      <div style="text-align: center; padding: 40px; color: var(--vscode-descriptionForeground);">
        Click "Send" to execute the request
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const currentCollectionId = ${JSON.stringify(collectionId)};
    const currentRequestId = ${JSON.stringify(request.id)};
    let currentVariables = ${JSON.stringify(request.extractVariables || [])};
    const state = {
      method: ${JSON.stringify(request.method)},
      headerKeys: ${JSON.stringify(headersEntries.map(([k]) => k))},
      activeScriptTab: 'preRequest'
    };

    let saveTimeout = null;
    function saveScripts() {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        const scripts = getScripts();
        vscode.postMessage({
          type: 'updateScripts',
          collectionId: currentCollectionId,
          requestId: currentRequestId,
          scripts: scripts
        });
      }, 500);
    }

    function switchScriptTab(tab) {
      state.activeScriptTab = tab;
      document.querySelectorAll('.script-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.script-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.script-tab[onclick*="' + tab + '"]').classList.add('active');
      document.getElementById(tab + 'Content').classList.add('active');
    }

    function getScripts() {
      const preRequest = document.getElementById('preRequestScript')?.value?.trim() || '';
      const test = document.getElementById('testScript')?.value?.trim() || '';
      if (!preRequest && !test) return undefined;
      return { preRequest: preRequest || undefined, test: test || undefined };
    }

    let lastScriptResult = null;

    function renderScriptResult(result, type) {
      const container = document.getElementById('scriptResults');
      if (!result) return;

      lastScriptResult = result;

      const isSuccess = result.success;
      const assertions = result.assertions || { passed: 0, failed: 0, errors: [], tests: [] };
      const tests = assertions.tests || [];

      let html = '<div class="test-results ' + (isSuccess ? 'success' : 'failure') + '">';
      html += '<div class="test-summary">';
      html += type === 'preRequest' ? 'Pre-request: ' : 'Tests: ';
      html += '<span class="test-passed">' + assertions.passed + ' passed</span>';
      if (assertions.failed > 0) {
        html += ', <span class="test-failed">' + assertions.failed + ' failed</span>';
      }
      html += '</div>';

      // Show individual test results
      if (tests.length > 0) {
        html += '<div class="test-list">';
        for (var i = 0; i < tests.length; i++) {
          var t = tests[i];
          var icon = t.passed ? '✓' : '✗';
          var iconClass = t.passed ? 'pass' : 'fail';
          html += '<div class="test-item" onclick="toggleTestDebug(' + i + ')" style="cursor: pointer;">';
          html += '<span class="test-expand">▶</span>';
          html += '<span class="test-icon ' + iconClass + '">' + icon + '</span>';
          html += '<span class="test-name">' + escapeHtml(t.name) + '</span>';
          html += '</div>';
          html += '<div class="test-debug" id="test-debug-' + i + '" style="display: none; padding: 8px 8px 8px 32px; background: var(--vscode-textBlockQuote-background); font-family: monospace; font-size: 0.8em; border-radius: 4px; margin: 4px 0;">';
          if (t.actual !== undefined && t.expected !== undefined) {
            html += '<div>Expected: <span style="color: #49cc90;">' + escapeHtml(t.expected) + '</span></div>';
            html += '<div>Actual: <span style="color: ' + (t.passed ? '#49cc90' : '#f93e3e') + ';">' + escapeHtml(t.actual) + '</span></div>';
          } else {
            html += '<div>Result: <span style="color: ' + (t.passed ? '#49cc90' : '#f93e3e') + '">' + (t.passed ? 'PASSED' : 'FAILED') + '</span></div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }

      if (result.output) {
        html += '<div class="script-output">' + escapeHtml(result.output) + '</div>';
      }

      if (result.error) {
        html += '<div class="error" style="margin-top: 8px;">' + escapeHtml(result.error) + '</div>';
      }

      html += '</div>';

      if (type === 'preRequest') {
        container.innerHTML = html;
      } else {
        container.innerHTML += html;
      }
    }

    function toggleTestDebug(index) {
      const debugEl = document.getElementById('test-debug-' + index);
      const items = document.querySelectorAll('.test-item');
      if (!debugEl || !items[index]) return;

      const expandIcon = items[index].querySelector('.test-expand');
      if (debugEl.style.display === 'none') {
        debugEl.style.display = 'block';
        if (expandIcon) expandIcon.textContent = '▼';
      } else {
        debugEl.style.display = 'none';
        if (expandIcon) expandIcon.textContent = '▶';
      }
    }

    function showAddVariable() {
      document.getElementById('addVariableForm').style.display = 'block';
      document.getElementById('varName').focus();
    }

    function hideAddVariable() {
      document.getElementById('addVariableForm').style.display = 'none';
      document.getElementById('varName').value = '';
      document.getElementById('varPath').value = '';
    }

    function addVariable() {
      const name = document.getElementById('varName').value.trim();
      const path = document.getElementById('varPath').value.trim();
      if (!name || !path) return;

      vscode.postMessage({
        type: 'addExtraction',
        collectionId: currentCollectionId,
        requestId: currentRequestId,
        extraction: { name, path }
      });
      hideAddVariable();
    }

    function removeVariable(index) {
      vscode.postMessage({
        type: 'removeExtraction',
        collectionId: currentCollectionId,
        requestId: currentRequestId,
        index: index
      });
    }

    function renderVariables(variables) {
      const container = document.getElementById('variablesList');
      if (!variables || variables.length === 0) {
        container.innerHTML = '<div style="color: var(--vscode-descriptionForeground); padding: 8px 0;">No variables defined</div>';
        return;
      }
      container.innerHTML = variables.map((v, i) =>
        '<div class="variable-item" style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border);">' +
        '<span style="color: #fca130; font-family: monospace;">{{' + escapeHtml(v.name) + '}}</span>' +
        '<span style="flex: 1; color: var(--vscode-descriptionForeground); font-family: monospace; font-size: 0.85em;">' + escapeHtml(v.path) + '</span>' +
        '<button class="btn-icon" onclick="removeVariable(' + i + ')" title="Remove">×</button>' +
        '</div>'
      ).join('');
    }

    function getHeaders() {
      const headers = {};
      for (const key of state.headerKeys) {
        const keyInput = document.getElementById('hkey_' + key);
        const valInput = document.getElementById('hval_' + key);
        if (keyInput && valInput && keyInput.value) {
          headers[keyInput.value] = valInput.value;
        }
      }
      return headers;
    }

    function getBody() {
      const editor = document.getElementById('bodyEditor');
      return editor ? editor.value : undefined;
    }

    function sendRequest() {
      const url = document.getElementById('urlInput').value;
      document.getElementById('scriptResults').innerHTML = '';
      vscode.postMessage({
        type: 'sendRequest',
        url,
        method: state.method,
        headers: getHeaders(),
        body: getBody(),
        scripts: getScripts()
      });
    }

    function copyAsCurl() {
      const url = document.getElementById('urlInput').value;
      vscode.postMessage({
        type: 'copyAsCurl',
        url,
        method: state.method,
        headers: getHeaders(),
        body: getBody()
      });
    }

    function formatJson(json) {
      try {
        const obj = typeof json === 'string' ? JSON.parse(json) : json;
        return syntaxHighlight(JSON.stringify(obj, null, 2));
      } catch { return escapeHtml(json); }
    }

    function syntaxHighlight(json) {
      json = escapeHtml(json);
      return json.replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) { cls = /:$/.test(match) ? 'json-key' : 'json-string'; }
        else if (/true|false/.test(match)) { cls = 'json-boolean'; }
        return '<span class="' + cls + '">' + match + '</span>';
      });
    }

    function escapeHtml(str) {
      if (typeof str !== 'string') return String(str);
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function getStatusClass(status) {
      if (status >= 200 && status < 300) return 'status-2xx';
      if (status >= 400 && status < 500) return 'status-4xx';
      return 'status-5xx';
    }

    // ========== Snippet Functions ==========
    let snippetLibrary = {};

    function openSnippetPicker() {
      // Switch to Tests tab first
      switchScriptTab('test');
      vscode.postMessage({ type: 'getSnippetLibrary' });
      document.getElementById('snippetPicker').classList.add('open');
    }

    function closeSnippetPicker() {
      document.getElementById('snippetPicker').classList.remove('open');
    }

    function renderSnippetPicker(library) {
      let html = '';
      for (const [category, snippets] of Object.entries(library)) {
        html += '<div class="picker-category">' + escapeHtml(category) + '</div>';
        for (const snippet of snippets) {
          const configJson = JSON.stringify(snippet.defaultConfig).replace(/"/g, '&quot;');
          html += '<div class="picker-item" data-type="' + snippet.type + '" data-config="' + configJson + '">';
          html += '<div>';
          html += '<div class="picker-item-name">' + escapeHtml(snippet.name) + '</div>';
          html += '<div class="picker-item-desc">' + escapeHtml(snippet.description) + '</div>';
          html += '</div>';
          html += '</div>';
        }
      }
      document.getElementById('snippetPickerContent').innerHTML = html;

      // Add click handlers via delegation
      document.getElementById('snippetPickerContent').onclick = function(e) {
        const item = e.target.closest('.picker-item');
        if (item) {
          const type = item.dataset.type;
          const config = JSON.parse(item.dataset.config);
          addSnippet(type, config);
        }
      };
    }

    function addSnippet(type, config) {
      vscode.postMessage({ type: 'addSnippet', snippetType: type, config: config });
    }

    function insertSnippetCode(code) {
      const textarea = document.getElementById('testScript');
      if (!textarea) return;

      // Get current content
      const currentValue = textarea.value;

      // Add newline if textarea has content
      const prefix = currentValue.trim() ? '\\n\\n' : '';

      // Insert code
      textarea.value = currentValue + prefix + code;

      // Close picker
      closeSnippetPicker();

      // Auto-save
      saveScripts();
    }

    window.addEventListener('message', event => {
      const message = event.data;
      const responseContent = document.getElementById('responseContent');
      switch (message.type) {
        case 'loading':
          responseContent.innerHTML = '<div class="loading"><div class="spinner"></div><span>Sending...</span></div>';
          break;
        case 'preRequestResult':
          renderScriptResult(message.result, 'preRequest');
          break;
        case 'testResult':
          renderScriptResult(message.result, 'test');
          break;
        case 'response':
          const result = message.result;
          if (!result.success) {
            responseContent.innerHTML = '<div class="error">' + escapeHtml(result.error) + '</div>';
            return;
          }
          responseContent.innerHTML = '<div style="margin-bottom: 8px;"><span class="status-badge ' + getStatusClass(result.status) + '">' + result.status + ' ' + result.statusText + '</span> <span style="color: var(--vscode-descriptionForeground);">' + result.time + 'ms</span></div><div class="response-body">' + formatJson(result.body || '') + '</div>';
          break;
        case 'snippetLibrary':
          snippetLibrary = message.library;
          currentTests = message.currentTests || [];
          renderSnippetPicker(snippetLibrary);
          break;
        case 'testsUpdated':
          currentTests = message.tests || [];
          renderSnippetList(currentTests);
          break;
        case 'insertSnippetCode':
          insertSnippetCode(message.code);
          break;
        case 'variablesUpdated':
          currentVariables = message.variables || [];
          renderVariables(currentVariables);
          break;
        case 'snippetResults':
          renderSnippetResults(message.results);
          break;
      }
    });

    function renderSnippetResults(results) {
      if (!results || results.length === 0) return;

      const container = document.getElementById('scriptResults');
      const passed = results.filter(r => r.passed).length;
      const failed = results.filter(r => !r.passed).length;
      const isSuccess = failed === 0;

      let html = '<div class="test-results ' + (isSuccess ? 'success' : 'failure') + '">';
      html += '<div class="test-summary">';
      html += 'Snippets: <span class="test-passed">' + passed + ' passed</span>';
      if (failed > 0) {
        html += ', <span class="test-failed">' + failed + ' failed</span>';
      }
      html += '</div>';
      html += '<div class="test-list">';
      results.forEach(function(r) {
        const icon = r.passed ? '✓' : '✗';
        const iconClass = r.passed ? 'pass' : 'fail';
        html += '<div class="test-item">';
        html += '<span class="test-icon ' + iconClass + '">' + icon + '</span>';
        html += '<span class="test-name">' + escapeHtml(r.name) + '</span>';
        html += '</div>';
        if (r.error) {
          html += '<div style="padding-left: 26px; color: #f93e3e; font-size: 0.85em;">' + escapeHtml(r.error) + '</div>';
        }
      });
      html += '</div></div>';

      // Update snippet icons in the list
      const snippetList = document.getElementById('snippetList');
      if (snippetList) {
        const items = snippetList.querySelectorAll('.snippet-item');
        results.forEach(function(r, i) {
          if (items[i]) {
            const icon = items[i].querySelector('.snippet-icon');
            if (icon) {
              icon.textContent = r.passed ? '✓' : '✗';
              icon.style.color = r.passed ? '#49cc90' : '#f93e3e';
            }
          }
        });
      }

      container.innerHTML += html;
    }

    // Auto-save on textarea change
    document.getElementById('testScript')?.addEventListener('input', saveScripts);
    document.getElementById('preRequestScript')?.addEventListener('input', saveScripts);
  </script>
</body>
</html>`;
  }
}

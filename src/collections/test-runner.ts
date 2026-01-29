/**
 * Test Runner for executing collection requests sequentially.
 * Like Postman Collection Runner.
 */

import { EventEmitter } from 'events';
import { RequestExecutor, RequestResult } from '../core/request-executor';
import { PythonRunner, ScriptContext } from '../core/python-runner';
import {
  Collection,
  CollectionFolder,
  SavedRequest,
  CollectionRunResult,
  RequestRunResult,
  RunnerOptions,
  TestSnippet,
  SnippetTestResult
} from './models';
import { jsonPath, jsonPathFirst, jsonPathExists } from './jsonpath';
import { getSnippetDisplayName } from './snippets';

export interface RunnerEvents {
  'start': (result: CollectionRunResult) => void;
  'request-start': (requestResult: RequestRunResult, index: number) => void;
  'request-complete': (requestResult: RequestRunResult, index: number) => void;
  'progress': (result: CollectionRunResult) => void;
  'complete': (result: CollectionRunResult) => void;
  'stop': (result: CollectionRunResult) => void;
}

export class TestRunner extends EventEmitter {
  private executor: RequestExecutor;
  private pythonRunner: PythonRunner;
  private isRunning = false;
  private shouldStop = false;
  private currentResult: CollectionRunResult | null = null;
  private environment: Record<string, string> = {};

  constructor() {
    super();
    this.executor = new RequestExecutor();
    this.pythonRunner = new PythonRunner();
  }

  /**
   * Check if runner is currently executing.
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get current run result.
   */
  get result(): CollectionRunResult | null {
    return this.currentResult;
  }

  /**
   * Run all requests in a collection.
   */
  async runCollection(
    collection: Collection,
    options: RunnerOptions = {}
  ): Promise<CollectionRunResult> {
    // Flatten all requests from collection
    const requests = this.flattenRequests(collection);
    return this.runRequests(requests, collection.id, collection.name, options);
  }

  /**
   * Run specific requests in order.
   */
  async runRequests(
    requests: SavedRequest[],
    collectionId: string,
    collectionName: string,
    options: RunnerOptions = {}
  ): Promise<CollectionRunResult> {
    if (this.isRunning) {
      throw new Error('Runner is already executing');
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.environment = options.environment || {};

    const result: CollectionRunResult = {
      collectionId,
      collectionName,
      status: 'running',
      startedAt: new Date().toISOString(),
      totalRequests: requests.length,
      completed: 0,
      passed: 0,
      failed: 0,
      errors: 0,
      skipped: 0,
      totalTime: 0,
      results: requests.map(req => ({
        requestId: req.id,
        requestName: req.name,
        method: req.method,
        url: req.url,
        status: 'pending' as const
      }))
    };

    this.currentResult = result;
    this.emit('start', result);

    const startTime = Date.now();

    for (let i = 0; i < requests.length; i++) {
      if (this.shouldStop) {
        // Mark remaining as skipped
        for (let j = i; j < requests.length; j++) {
          result.results[j].status = 'skipped';
          result.skipped++;
        }
        break;
      }

      const request = requests[i];
      const requestResult = result.results[i];

      requestResult.status = 'running';
      this.emit('request-start', requestResult, i);

      try {
        await this.executeRequest(request, requestResult, options);
        result.completed++;

        const status = requestResult.status as RequestRunResult['status'];
        if (status === 'passed') {
          result.passed++;
        } else if (status === 'failed') {
          result.failed++;
          if (options.stopOnError) {
            this.shouldStop = true;
          }
        } else if (status === 'error') {
          result.errors++;
          if (options.stopOnError) {
            this.shouldStop = true;
          }
        }
      } catch (err) {
        requestResult.status = 'error';
        requestResult.error = (err as Error).message;
        result.errors++;
        result.completed++;

        if (options.stopOnError) {
          this.shouldStop = true;
        }
      }

      this.emit('request-complete', requestResult, i);
      this.emit('progress', result);

      // Delay between requests
      if (options.delay && i < requests.length - 1 && !this.shouldStop) {
        await this.sleep(options.delay);
      }
    }

    result.totalTime = Date.now() - startTime;
    result.completedAt = new Date().toISOString();
    result.status = this.shouldStop ? 'stopped' : 'completed';

    this.isRunning = false;
    this.emit(this.shouldStop ? 'stop' : 'complete', result);

    return result;
  }

  /**
   * Stop current execution.
   */
  stop(): void {
    if (this.isRunning) {
      this.shouldStop = true;
    }
  }

  /**
   * Execute single request with scripts.
   */
  private async executeRequest(
    request: SavedRequest,
    result: RequestRunResult,
    _options: RunnerOptions
  ): Promise<void> {
    let url = request.url;
    let headers = { ...request.headers };
    let body = request.body;

    // Run pre-request script
    if (request.scripts?.preRequest) {
      const scriptContext: ScriptContext = {
        request: { method: request.method, url, headers, body },
        env: this.environment
      };

      const preResult = await this.pythonRunner.execute(
        request.scripts.preRequest,
        scriptContext
      );

      if (preResult.modifiedRequest) {
        if (preResult.modifiedRequest.url) url = preResult.modifiedRequest.url;
        if (preResult.modifiedRequest.headers) headers = preResult.modifiedRequest.headers;
        if (preResult.modifiedRequest.body) body = preResult.modifiedRequest.body;
      }

      // Update environment from pre-request script output
      if (preResult.output) {
        console.log('[TestRunner] Pre-request output:', preResult.output);
      }
    }

    // Execute HTTP request
    const httpResult: RequestResult = await this.executor.execute({
      method: request.method,
      url,
      headers,
      body
    });

    result.url = url;
    result.httpStatus = httpResult.status;
    result.httpStatusText = httpResult.statusText;
    result.responseTime = httpResult.time;
    result.responseSize = httpResult.size;

    if (httpResult.headers || httpResult.body) {
      result.response = {
        headers: httpResult.headers || {},
        body: httpResult.body || ''
      };
    }

    if (!httpResult.success) {
      result.status = 'error';
      result.error = httpResult.error;
      return;
    }

    // Run test script
    if (request.scripts?.test) {
      const testContext: ScriptContext = {
        request: { method: request.method, url, headers, body },
        response: {
          status: httpResult.status!,
          statusText: httpResult.statusText!,
          headers: httpResult.headers!,
          body: httpResult.body!,
          time_ms: httpResult.time!,
          size: httpResult.size!
        },
        env: this.environment
      };

      const testResult = await this.pythonRunner.execute(
        request.scripts.test,
        testContext
      );

      result.assertions = {
        passed: testResult.assertions?.passed || 0,
        failed: testResult.assertions?.failed || 0,
        tests: testResult.assertions?.tests || []
      };

      // Determine pass/fail based on assertions
      if (testResult.assertions && testResult.assertions.failed > 0) {
        result.status = 'failed';
      } else if (testResult.assertions && testResult.assertions.passed > 0) {
        result.status = 'passed';
      } else {
        // No assertions, check HTTP status
        result.status = this.isSuccessStatus(httpResult.status) ? 'passed' : 'failed';
      }
    }

    // Run test snippets (Postman-style)
    if (request.tests && request.tests.length > 0) {
      const snippetResults = this.executeSnippets(request.tests, {
        status: httpResult.status!,
        headers: httpResult.headers || {},
        body: httpResult.body || '',
        time: httpResult.time || 0
      });

      result.snippetResults = snippetResults;

      // Count passed/failed snippets
      const snippetsFailed = snippetResults.filter(r => !r.passed).length;
      const snippetsPassed = snippetResults.filter(r => r.passed).length;

      // Merge with script assertions if any
      if (!result.assertions) {
        result.assertions = { passed: 0, failed: 0, tests: [] };
      }
      result.assertions.passed += snippetsPassed;
      result.assertions.failed += snippetsFailed;

      // Update status based on snippets
      if (snippetsFailed > 0) {
        result.status = 'failed';
      } else if (snippetsPassed > 0 && result.status !== 'failed') {
        result.status = 'passed';
      }
    }

    // Default status if no tests
    if (!request.scripts?.test && (!request.tests || request.tests.length === 0)) {
      result.status = this.isSuccessStatus(httpResult.status) ? 'passed' : 'failed';
    }
  }

  /**
   * Flatten all requests from collection (including folders).
   */
  private flattenRequests(collection: Collection): SavedRequest[] {
    const requests: SavedRequest[] = [];

    // Add root-level requests
    requests.push(...collection.requests);

    // Recursively add folder requests
    const addFolderRequests = (folders: CollectionFolder[]) => {
      for (const folder of folders) {
        requests.push(...folder.requests);
        if (folder.folders.length > 0) {
          addFolderRequests(folder.folders);
        }
      }
    };

    addFolderRequests(collection.folders);
    return requests;
  }

  /**
   * Check if HTTP status is success (2xx).
   */
  private isSuccessStatus(status?: number): boolean {
    return status !== undefined && status >= 200 && status < 300;
  }

  /**
   * Sleep helper.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute test snippets against response.
   */
  private executeSnippets(
    snippets: TestSnippet[],
    response: {
      status: number;
      headers: Record<string, string | string[]>;
      body: string;
      time: number;
    }
  ): SnippetTestResult[] {
    return snippets
      .filter(s => s.enabled)
      .map(snippet => this.executeSnippet(snippet, response));
  }

  /**
   * Execute single snippet.
   */
  private executeSnippet(
    snippet: TestSnippet,
    response: { status: number; headers: Record<string, string | string[]>; body: string; time: number }
  ): SnippetTestResult {
    const name = getSnippetDisplayName(snippet);

    try {
      // Parse body if JSON
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(response.body);
      } catch {
        parsedBody = response.body;
      }

      // Normalize headers to lowercase keys
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(response.headers)) {
        headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
      }

      switch (snippet.type) {
        case 'status':
          return {
            snippet,
            name,
            passed: response.status === snippet.expected,
            actual: response.status
          };

        case 'statusFamily': {
          const family = snippet.expected as string; // '2xx', '4xx', etc.
          const firstDigit = family.charAt(0);
          const passed = String(response.status).startsWith(firstDigit);
          return { snippet, name, passed, actual: response.status };
        }

        case 'notEmpty': {
          const notEmpty = response.body !== null &&
            response.body !== undefined &&
            response.body !== '' &&
            (typeof parsedBody !== 'object' || Object.keys(parsedBody as object).length > 0);
          return { snippet, name, passed: notEmpty, actual: typeof parsedBody };
        }

        case 'hasJsonBody': {
          const contentType = headers['content-type'] || '';
          return {
            snippet,
            name,
            passed: contentType.includes('application/json'),
            actual: contentType
          };
        }

        case 'hasField': {
          const hasField = this.getNestedValue(parsedBody, snippet.field!) !== undefined;
          return { snippet, name, passed: hasField };
        }

        case 'fieldNotNull': {
          const fieldValue = this.getNestedValue(parsedBody, snippet.field!);
          return {
            snippet,
            name,
            passed: fieldValue !== null && fieldValue !== undefined,
            actual: fieldValue
          };
        }

        case 'fieldEquals': {
          const actualValue = this.getNestedValue(parsedBody, snippet.field!);
          return {
            snippet,
            name,
            passed: actualValue === snippet.expected,
            actual: actualValue
          };
        }

        case 'responseTime':
          return {
            snippet,
            name,
            passed: response.time < (snippet.maxMs || 1000),
            actual: response.time
          };

        case 'headerExists': {
          const headerKey = snippet.header!.toLowerCase();
          const headerExists = headerKey in headers;
          return { snippet, name, passed: headerExists };
        }

        case 'headerEquals': {
          const headerKey = snippet.header!.toLowerCase();
          const headerValue = headers[headerKey];
          return {
            snippet,
            name,
            passed: headerValue === snippet.expected,
            actual: headerValue
          };
        }

        case 'custom':
          return this.executeCustomSnippet(snippet, {
            status: response.status,
            body: parsedBody,
            headers,
            time: response.time
          });

        case 'arrayLength': {
          const arr = this.getAllValues(parsedBody, snippet.field!);
          const actualLength = arr.length;
          const expectedLength = snippet.expected as number;
          const op = snippet.operator || '==';
          let lengthPassed = false;
          switch (op) {
            case '>':  lengthPassed = actualLength > expectedLength; break;
            case '>=': lengthPassed = actualLength >= expectedLength; break;
            case '<':  lengthPassed = actualLength < expectedLength; break;
            case '<=': lengthPassed = actualLength <= expectedLength; break;
            case '!=': lengthPassed = actualLength !== expectedLength; break;
            default:   lengthPassed = actualLength === expectedLength;
          }
          return { snippet, name, passed: lengthPassed, actual: actualLength };
        }

        case 'allMatch': {
          const allItems = this.getAllValues(parsedBody, snippet.field!);
          if (allItems.length === 0) {
            return { snippet, name, passed: false, actual: 'empty array' };
          }
          const allPass = allItems.every(item =>
            this.evaluateItemCondition(item, snippet.condition!)
          );
          return { snippet, name, passed: allPass, actual: `${allItems.length} items` };
        }

        case 'anyMatch': {
          const anyItems = this.getAllValues(parsedBody, snippet.field!);
          const anyPass = anyItems.some(item =>
            this.evaluateItemCondition(item, snippet.condition!)
          );
          return { snippet, name, passed: anyPass, actual: `${anyItems.length} items` };
        }

        default:
          return { snippet, name, passed: false, error: `Unknown snippet type: ${snippet.type}` };
      }
    } catch (error) {
      return {
        snippet,
        name,
        passed: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Get nested value from object by path (e.g., "user.address.city")
   * Supports both simple paths and JSONPath
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;

    // Use JSONPath if path starts with $
    if (path.startsWith('$')) {
      return jsonPathFirst(obj, path);
    }

    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;

      // Handle array notation: items[0]
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, key, index] = arrayMatch;
        current = (current as Record<string, unknown>)[key];
        if (Array.isArray(current)) {
          current = current[parseInt(index, 10)];
        } else {
          return undefined;
        }
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }

  /**
   * Get all values matching a path (for array operations)
   */
  private getAllValues(obj: unknown, path: string): unknown[] {
    if (path.startsWith('$')) {
      return jsonPath(obj, path);
    }
    return jsonPath(obj, '$.' + path);
  }

  /**
   * Execute custom JS expression safely
   */
  private executeCustomSnippet(
    snippet: TestSnippet,
    response: { status: number; headers: Record<string, string>; body: unknown; time: number }
  ): SnippetTestResult {
    const name = getSnippetDisplayName(snippet);

    if (!snippet.expression) {
      return { snippet, name, passed: false, error: 'No expression provided' };
    }

    try {
      // Create safe evaluation context
      const context = {
        response: {
          status: response.status,
          body: response.body,
          headers: response.headers,
          time: response.time
        },
        // Utility functions
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Math,
        Date,
        RegExp,
        // Helper functions
        ...this.expressionHelpers
      };

      // Execute expression in isolated context
      const result = this.evaluateExpression(snippet.expression, context);

      return {
        snippet,
        name,
        passed: Boolean(result),
        actual: result
      };
    } catch (error) {
      return {
        snippet,
        name,
        passed: false,
        error: `Expression error: ${(error as Error).message}`
      };
    }
  }

  /**
   * Pre-defined helper functions available in custom expressions
   */
  private expressionHelpers = {
    /**
     * Check if value matches regex
     */
    matches: (value: unknown, pattern: RegExp): boolean => {
      return pattern.test(String(value));
    },

    /**
     * Check if array contains value
     */
    contains: (arr: unknown[], value: unknown): boolean => {
      return Array.isArray(arr) && arr.includes(value);
    },

    /**
     * Check if all items in array match predicate
     */
    all: <T>(arr: T[], predicate: (item: T) => boolean): boolean => {
      return Array.isArray(arr) && arr.every(predicate);
    },

    /**
     * Check if any item in array matches predicate
     */
    any: <T>(arr: T[], predicate: (item: T) => boolean): boolean => {
      return Array.isArray(arr) && arr.some(predicate);
    },

    /**
     * Get length of array or string
     */
    len: (value: unknown): number => {
      if (Array.isArray(value)) return value.length;
      if (typeof value === 'string') return value.length;
      if (typeof value === 'object' && value !== null) return Object.keys(value).length;
      return 0;
    },

    /**
     * Check if value is between min and max (inclusive)
     */
    between: (value: number, min: number, max: number): boolean => {
      return value >= min && value <= max;
    }
  };

  /**
   * Evaluate expression with given context
   */
  private evaluateExpression(
    expression: string,
    context: Record<string, unknown>
  ): unknown {
    // Validate expression doesn't contain dangerous patterns
    const forbidden = [
      'eval', 'Function', 'setTimeout', 'setInterval',
      'fetch', 'XMLHttpRequest', 'import', 'require',
      'process', 'global', 'window', 'document',
      '__proto__', 'constructor', 'prototype'
    ];

    for (const pattern of forbidden) {
      if (expression.includes(pattern)) {
        throw new Error(`Forbidden pattern: ${pattern}`);
      }
    }

    // Create function with context variables
    const contextKeys = Object.keys(context);
    const contextValues = Object.values(context);

    // Wrap expression to return result
    const wrappedExpression = `
      "use strict";
      return (${expression});
    `;

    try {
      // Create function with context as parameters
      const fn = new Function(...contextKeys, wrappedExpression);
      return fn(...contextValues);
    } catch (error) {
      throw new Error(`Invalid expression: ${(error as Error).message}`);
    }
  }

  /**
   * Evaluate condition on item (for allMatch/anyMatch)
   */
  private evaluateItemCondition(item: unknown, condition: string): boolean {
    if (typeof item !== 'object' || item === null) return false;

    const match = condition.match(/^(\w+(?:\.\w+)*)\s*(===?|!==?|>=?|<=?)\s*(.+)$/);
    if (!match) {
      // Just check field exists
      return jsonPathExists(item, '$.' + condition);
    }

    const [, fieldPath, op, expectedStr] = match;
    const actual = jsonPathFirst(item, '$.' + fieldPath);
    const expected = this.parseConditionValue(expectedStr.trim());

    switch (op) {
      case '==':
      case '===':
        return actual === expected;
      case '!=':
      case '!==':
        return actual !== expected;
      case '>':
        return Number(actual) > Number(expected);
      case '>=':
        return Number(actual) >= Number(expected);
      case '<':
        return Number(actual) < Number(expected);
      case '<=':
        return Number(actual) <= Number(expected);
      default:
        return false;
    }
  }

  /**
   * Parse condition value string
   */
  private parseConditionValue(str: string): unknown {
    if (str === 'true') return true;
    if (str === 'false') return false;
    if (str === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(str)) return parseFloat(str);
    if (str.match(/^['"](.*)['"]$/)) return str.slice(1, -1);
    return str;
  }
}

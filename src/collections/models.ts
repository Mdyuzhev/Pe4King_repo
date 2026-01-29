/**
 * Collection models for saved requests (like Postman).
 */

// ========== Variable System ==========

/**
 * Variable extraction rule - what to extract from response
 */
export interface VariableExtraction {
  /** Variable name (without brackets) */
  name: string;
  /** JSONPath or simple path to value */
  path: string;
  /** Variable scope */
  scope: 'collection' | 'folder' | 'request';
}

/**
 * Variable reference - stored variable value
 */
export interface Variable {
  name: string;
  value: unknown;
  source: string;  // requestId where extracted
}

/**
 * Variable store - storage for run session
 */
export interface VariableStore {
  /** Collection-level variables */
  collection: Map<string, Variable>;
  /** Folder-level variables (folderId → variables) */
  folders: Map<string, Map<string, Variable>>;
  /** Last values for display */
  lastValues: Record<string, unknown>;
}

// ========== Test Snippets (Postman-style) ==========

/**
 * Test snippet types for collection requests
 */
export type TestSnippetType =
  | 'status'           // Status code equals
  | 'statusFamily'     // 2xx, 4xx, 5xx
  | 'notEmpty'         // Body is not empty
  | 'hasJsonBody'      // Content-Type is application/json
  | 'hasField'         // Body contains field
  | 'fieldEquals'      // Field equals value
  | 'fieldNotNull'     // Field is not null
  | 'responseTime'     // Response time < max
  | 'headerExists'     // Header present
  | 'headerEquals'     // Header equals value
  | 'custom'           // Custom JS expression
  | 'arrayLength'      // Check array length
  | 'allMatch'         // All items match condition
  | 'anyMatch';        // Any item matches condition

/**
 * Test snippet configuration
 */
export interface TestSnippet {
  type: TestSnippetType;
  enabled: boolean;

  // Type-specific params
  expected?: number | string;    // For status, fieldEquals, headerEquals
  field?: string;                // For hasField, fieldEquals, fieldNotNull
  header?: string;               // For headerExists, headerEquals
  maxMs?: number;                // For responseTime

  // Custom snippets
  expression?: string;           // JS expression to evaluate
  description?: string;          // Human-readable description

  // Array/JSONPath operations
  operator?: '==' | '!=' | '>' | '>=' | '<' | '<=';
  condition?: string;            // For allMatch/anyMatch
}

/**
 * Test result after snippet execution
 */
export interface SnippetTestResult {
  snippet: TestSnippet;
  name: string;           // Human-readable test name
  passed: boolean;
  actual?: unknown;
  error?: string;
}

export interface RequestScripts {
  preRequest?: string;  // Python code executed before request
  test?: string;        // Python code executed after response
}

export interface TestResult {
  name: string;
  passed: boolean;
}

export interface ScriptResult {
  success: boolean;
  output?: string;
  error?: string;
  assertions?: {
    passed: number;
    failed: number;
    errors: string[];
    tests: TestResult[];
  };
  modifiedRequest?: {
    headers?: Record<string, string>;
    body?: string;
    url?: string;
  };
}

export interface SavedRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  bodyType: 'none' | 'raw' | 'form-data' | 'x-www-form-urlencoded';
  scripts?: RequestScripts;
  tests?: TestSnippet[];  // Postman-style test snippets
  extractVariables?: VariableExtraction[];  // Variable extractions
  createdAt: string;
  updatedAt: string;
}

export interface CollectionFolder {
  id: string;
  name: string;
  requests: SavedRequest[];
  folders: CollectionFolder[];
  createdAt: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  folders: CollectionFolder[];
  requests: SavedRequest[];  // Root-level requests
  variables?: Record<string, string>;  // Initial variables (like environment)
  createdAt: string;
  updatedAt: string;
}

export interface CollectionsData {
  version: string;
  collections: Collection[];
}

/**
 * Generate unique ID.
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * Create new collection.
 */
export function createCollection(name: string, description?: string): Collection {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    description,
    folders: [],
    requests: [],
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Create new folder.
 */
export function createFolder(name: string): CollectionFolder {
  return {
    id: generateId(),
    name,
    requests: [],
    folders: [],
    createdAt: new Date().toISOString()
  };
}

/**
 * Create saved request from current request state.
 */
export function createSavedRequest(
  name: string,
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
  bodyType: SavedRequest['bodyType'] = 'raw',
  scripts?: RequestScripts
): SavedRequest {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    method,
    url,
    headers,
    body,
    bodyType,
    scripts,
    createdAt: now,
    updatedAt: now
  };
}

// ========== Test Runner Models ==========

export interface RequestRunResult {
  requestId: string;
  requestName: string;
  method: string;
  url: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'skipped';
  httpStatus?: number;
  httpStatusText?: string;
  responseTime?: number;
  responseSize?: number;
  assertions?: {
    passed: number;
    failed: number;
    tests: TestResult[];
  };
  snippetResults?: SnippetTestResult[];  // Results of test snippets
  error?: string;
  response?: {
    headers: Record<string, string | string[]>;
    body: string;
  };
}

export interface CollectionRunResult {
  collectionId: string;
  collectionName: string;
  status: 'idle' | 'running' | 'completed' | 'stopped';
  startedAt?: string;
  completedAt?: string;
  totalRequests: number;
  completed: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  totalTime: number;
  results: RequestRunResult[];
}

export interface RunnerOptions {
  delay?: number;           // Delay between requests (ms)
  stopOnError?: boolean;    // Stop execution on first error
  environment?: Record<string, string>;  // Environment variables
}

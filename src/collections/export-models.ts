/**
 * Models for exporting collections to test code
 */

import { Collection, SavedRequest, TestSnippet } from './models';

/**
 * Supported export formats
 */
export type ExportFormat = 'pytest' | 'rest-assured' | 'postman';

/**
 * Export configuration
 */
export interface ExportConfig {
  format: ExportFormat;

  // Output settings
  outputDir?: string;
  singleFile?: boolean;         // All tests in one file vs separate

  // Code generation options
  className?: string;           // Class name for REST Assured
  moduleName?: string;          // Module name for pytest
  baseUrl?: string;             // Override base URL
  javaPackage?: string;         // Java package name
  collectionName?: string;      // Collection name for comments

  // Feature flags
  includeVariables?: boolean;   // Generate variable handling code
  includeSetup?: boolean;       // Generate setup/teardown
  generateMocks?: boolean;      // Generate mock server setup

  // Formatting
  indent?: string;              // Indentation (default: 4 spaces)
}

/**
 * Default export configs per format
 */
export const DEFAULT_EXPORT_CONFIGS: Record<ExportFormat, Partial<ExportConfig>> = {
  'pytest': {
    singleFile: false,
    moduleName: 'test_api',
    indent: '    ',
    includeVariables: true,
    includeSetup: true
  },
  'rest-assured': {
    singleFile: true,
    className: 'ApiTest',
    indent: '    ',
    includeVariables: true,
    includeSetup: true
  },
  'postman': {
    singleFile: true
  }
};

/**
 * Intermediate representation of a test case
 */
export interface ExportTestCase {
  name: string;
  description?: string;

  // Request
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;

  // Assertions
  assertions: ExportAssertion[];

  // Variables
  extractVariables?: ExportVariableExtraction[];

  // Metadata
  tags?: string[];
  order?: number;
}

/**
 * Assertion in export-friendly format
 */
export interface ExportAssertion {
  type: 'status' | 'body' | 'header' | 'time' | 'custom';

  // Status assertions
  statusCode?: number;
  statusFamily?: string;

  // Body assertions
  path?: string;           // JSONPath
  exists?: boolean;
  equals?: unknown;
  notNull?: boolean;
  contains?: string;
  matches?: string;        // Regex pattern

  // Array assertions
  arrayLength?: number;
  arrayOp?: string;
  allMatch?: string;
  anyMatch?: string;

  // Header assertions
  headerName?: string;
  headerValue?: string;

  // Time assertions
  maxMs?: number;

  // Custom
  expression?: string;
  description?: string;
}

/**
 * Variable extraction in export format
 */
export interface ExportVariableExtraction {
  name: string;
  path: string;
  scope: 'global' | 'local';
}

/**
 * Result of export operation
 */
export interface ExportResult {
  success: boolean;
  files: ExportFile[];
  errors?: string[];
}

/**
 * Single exported file
 */
export interface ExportFile {
  filename: string;
  content: string;
  language: 'python' | 'java' | 'json' | 'xml';
}

/**
 * Convert Collection to export test cases
 */
export function collectionToTestCases(
  collection: Collection,
  _config: ExportConfig
): ExportTestCase[] {
  const testCases: ExportTestCase[] = [];
  let order = 0;

  // Process root-level requests
  for (const request of collection.requests) {
    testCases.push(requestToTestCase(request, ++order));
  }

  // Process folder requests
  for (const folder of collection.folders) {
    for (const request of folder.requests) {
      testCases.push(requestToTestCase(request, ++order, folder.name));
    }
  }

  return testCases;
}

/**
 * Convert SavedRequest to ExportTestCase
 */
function requestToTestCase(
  request: SavedRequest,
  order: number,
  folderName?: string
): ExportTestCase {
  return {
    name: sanitizeTestName(request.name),
    description: request.name,
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body,
    assertions: (request.tests || []).map(snippetToAssertion),
    extractVariables: (request.extractVariables || []).map(v => ({
      name: v.name,
      path: v.path,
      scope: v.scope === 'collection' ? 'global' : 'local'
    })),
    tags: folderName ? [folderName] : undefined,
    order
  };
}

/**
 * Convert TestSnippet to ExportAssertion
 */
function snippetToAssertion(snippet: TestSnippet): ExportAssertion {
  switch (snippet.type) {
    case 'status':
      return { type: 'status', statusCode: snippet.expected as number };

    case 'statusFamily':
      return { type: 'status', statusFamily: snippet.expected as string };

    case 'notEmpty':
      return { type: 'body', path: '$', exists: true };

    case 'hasJsonBody':
      return { type: 'header', headerName: 'Content-Type', contains: 'application/json' };

    case 'hasField':
      return { type: 'body', path: toJsonPath(snippet.field!), exists: true };

    case 'fieldNotNull':
      return { type: 'body', path: toJsonPath(snippet.field!), notNull: true };

    case 'fieldEquals':
      return { type: 'body', path: toJsonPath(snippet.field!), equals: snippet.expected };

    case 'responseTime':
      return { type: 'time', maxMs: snippet.maxMs };

    case 'headerExists':
      return { type: 'header', headerName: snippet.header!, exists: true };

    case 'headerEquals':
      return { type: 'header', headerName: snippet.header!, headerValue: snippet.expected as string };

    case 'arrayLength':
      return {
        type: 'body',
        path: toJsonPath(snippet.field!),
        arrayLength: snippet.expected as number,
        arrayOp: snippet.operator || '=='
      };

    case 'allMatch':
      return { type: 'body', path: toJsonPath(snippet.field!), allMatch: snippet.condition };

    case 'anyMatch':
      return { type: 'body', path: toJsonPath(snippet.field!), anyMatch: snippet.condition };

    case 'custom':
      return {
        type: 'custom',
        expression: snippet.expression,
        description: snippet.description
      };

    default:
      return { type: 'custom', description: `Unknown: ${snippet.type}` };
  }
}

/**
 * Ensure path is in JSONPath format
 */
function toJsonPath(path: string): string {
  if (path.startsWith('$')) return path;
  return '$.' + path;
}

/**
 * Sanitize test name for use as function/method name
 */
function sanitizeTestName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 60);
}

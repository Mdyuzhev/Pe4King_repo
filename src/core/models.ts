/**
 * Core models for Pe4King Generator.
 * These interfaces define the universal Test Model that renders to any framework.
 */

// ============================================================================
// OpenAPI Parsing Models
// ============================================================================

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE'
}

export enum FieldType {
  STRING = 'string',
  INTEGER = 'integer',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  OBJECT = 'object'
}

export interface SchemaField {
  name: string;
  path: string;           // JSON path: "user.email", "items[0].id"
  fieldType: FieldType;
  format?: string;        // uuid, email, date-time, uri, etc.
  required: boolean;
  nullable: boolean;
  enumValues?: string[];  // For enum fields
  description?: string;
  nested?: SchemaField[]; // For object/array types

  // Numeric constraints
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;

  // String constraints
  minLength?: number;
  maxLength?: number;
  pattern?: string;       // Regex pattern from schema

  // Array constraints
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // Example value from schema
  example?: unknown;
}

export interface EndpointInfo {
  method: HttpMethod;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];

  // Request
  pathParams: ParameterInfo[];
  queryParams: ParameterInfo[];
  headerParams: ParameterInfo[];
  formDataParams: ParameterInfo[];  // Swagger 2.0 formData parameters
  consumes?: string[];              // Content types (Swagger 2.0)
  requestBodySchema?: SchemaField[];
  requestBodyExample?: unknown;     // Example from OpenAPI spec
  requestBodyRequired: boolean;

  // Response
  successStatus: number;
  responseFields: SchemaField[];
  hasResponseSchema: boolean;

  // Auth
  security?: SecurityRequirement[];
}

export interface ParameterInfo {
  name: string;
  in: 'path' | 'query' | 'header' | 'formData';
  required: boolean;
  schema: SchemaField;
  example?: unknown;
}

export interface SecurityRequirement {
  type: 'apiKey' | 'http' | 'oauth2';
  scheme?: string;  // bearer, basic
  name?: string;    // header name for apiKey
  in?: string;      // header, query
}

// ============================================================================
// Test Model (Universal, renders to any framework)
// ============================================================================

export interface TestModel {
  meta: {
    source: string;
    generatedAt: string;
    version: string;
    specTitle: string;
    specVersion: string;
  };
  config: GeneratorConfig;
  endpoints: EndpointTest[];
}

export interface GeneratorConfig {
  baseUrl: string;
  framework: 'pytest' | 'rest-assured' | 'postman';

  // Python specific
  pythonPackage?: string;

  // Java specific
  javaPackage?: string;

  // Common
  generateNegativeTests: boolean;
  generateEdgeCases: boolean;
  generateUniversalTests: boolean;  // Auth, injection, rate-limit tests
  usePlaceholders: boolean;
}

// ============================================================================
// Universal Test Categories
// ============================================================================

export enum UniversalTestCategory {
  AUTH = 'auth',           // 401/403 tests
  INJECTION = 'injection', // SQL/XSS injection
  VALIDATION = 'validation', // Invalid params, missing required fields
  METHOD = 'method',       // 405 Method Not Allowed
  RATE_LIMIT = 'rate_limit', // 429 Too Many Requests
  PAGINATION = 'pagination', // Invalid cursor/limit/offset
  SCOPE = 'scope',         // OAuth2 scope mismatch (403)
  CONTENT_TYPE = 'content_type' // Wrong content type (415)
}

export interface UniversalTest {
  category: UniversalTestCategory;
  name: string;
  description: string;

  // How to modify the request
  modification: {
    removeAuth?: boolean;
    invalidAuth?: string;
    wrongScope?: string;          // OAuth2 wrong scope
    overrideMethod?: HttpMethod;
    overrideContentType?: string; // Wrong content type
    pathParamOverride?: Record<string, string>;
    queryParamOverride?: Record<string, string>;
    bodyOverride?: unknown;
    headerOverride?: Record<string, string>;
    useFormData?: boolean;        // Use form-urlencoded instead of JSON
  };

  // Expected result
  expectedStatus: number;
  expectedContains?: string;  // Error message should contain
}

export interface EndpointTest {
  endpoint: EndpointInfo;
  scenarios: TestScenario[];
}

export interface TestScenario {
  name: string;
  displayName: string;
  type: 'positive' | 'negative' | 'edge';

  // Request configuration
  request: {
    pathParams?: Record<string, string>;
    queryParams?: Record<string, string>;
    headers?: Record<string, string>;
    body?: unknown;
  };

  // Expected response
  expected: {
    statusCode: number;
    contentType?: string;
    assertions: Assertion[];
  };

  // Metadata
  disabled?: boolean;
  disabledReason?: string;
}

// ============================================================================
// Assertion Model
// ============================================================================

export type MatcherType =
  | 'notNull'
  | 'isNull'
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'matchesPattern'
  | 'oneOf'
  | 'isType'
  | 'notEmpty'
  | 'isEmpty'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'hasSize'
  | 'hasSizeGreaterThan'
  | 'hasSizeLessThan'
  | 'hasMinLength'
  | 'hasMaxLength';

export interface Assertion {
  path: string;           // JSON path
  matcher: MatcherType;
  value?: unknown;        // For equals, contains, matchesPattern, oneOf, etc.
  description?: string;   // Human-readable description
}

// ============================================================================
// Generation Result
// ============================================================================

export interface GeneratedFile {
  filename: string;
  content: string;
  language: string;       // python, java, json
}

export interface GenerationResult {
  success: boolean;
  files: GeneratedFile[];
  stats: {
    totalEndpoints: number;
    totalTests: number;
    positiveTests: number;
    negativeTests: number;
    assertions: number;
  };
  errors?: string[];
  warnings?: string[];
}

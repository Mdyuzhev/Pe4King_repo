/**
 * Main Pe4King Generator.
 * Coordinates parsing, scenario building, and rendering.
 */

import {
  TestModel,
  GeneratorConfig,
  EndpointTest,
  TestScenario,
  EndpointInfo,
  Assertion,
  MatcherType,
  SchemaField,
  GenerationResult,
  HttpMethod
} from './core/models';
import { OpenAPIParser, ParsedSpec } from './core/parser';
import { BaseRenderer } from './renderers/base-renderer';
import { PytestRenderer } from './renderers/pytest';
import { RestAssuredRenderer } from './renderers/rest-assured';
import { PostmanRenderer } from './renderers/postman';

export class Pe4KingGenerator {
  private renderers: Map<string, BaseRenderer>;

  constructor() {
    this.renderers = new Map();
    this.renderers.set('pytest', new PytestRenderer());
    this.renderers.set('rest-assured', new RestAssuredRenderer());
    this.renderers.set('postman', new PostmanRenderer());
  }

  /**
   * Generates tests from OpenAPI spec.
   */
  generate(
    spec: string | Record<string, unknown>,
    config: Partial<GeneratorConfig>
  ): GenerationResult {
    try {
      // Parse spec
      const parser = new OpenAPIParser(spec);
      const parsed = parser.parse();

      // Build full config
      const fullConfig: GeneratorConfig = {
        baseUrl: config.baseUrl || parsed.baseUrl,
        framework: config.framework || 'pytest',
        pythonPackage: config.pythonPackage,
        javaPackage: config.javaPackage || 'com.api.tests',
        generateNegativeTests: config.generateNegativeTests ?? true,
        generateEdgeCases: config.generateEdgeCases ?? false,
        generateUniversalTests: config.generateUniversalTests ?? false,
        usePlaceholders: config.usePlaceholders ?? true
      };

      // Build Test Model
      const model = this.buildTestModel(parsed, fullConfig);

      // Get renderer
      const renderer = this.renderers.get(fullConfig.framework);
      if (!renderer) {
        throw new Error(`Unknown framework: ${fullConfig.framework}`);
      }

      // Render files
      const files = renderer.render(model);

      // Calculate stats
      const stats = this.calculateStats(model);

      return {
        success: true,
        files,
        stats
      };

    } catch (error) {
      return {
        success: false,
        files: [],
        stats: {
          totalEndpoints: 0,
          totalTests: 0,
          positiveTests: 0,
          negativeTests: 0,
          assertions: 0
        },
        errors: [(error as Error).message]
      };
    }
  }

  /**
   * Builds Test Model from parsed spec.
   */
  private buildTestModel(parsed: ParsedSpec, config: GeneratorConfig): TestModel {
    const endpoints: EndpointTest[] = [];

    for (const endpoint of parsed.endpoints) {
      const scenarios = this.buildScenarios(endpoint, config);
      endpoints.push({ endpoint, scenarios });
    }

    return {
      meta: {
        source: 'OpenAPI Spec',
        generatedAt: new Date().toISOString(),
        version: '1.0.0',
        specTitle: parsed.title,
        specVersion: parsed.version
      },
      config,
      endpoints
    };
  }

  /**
   * Builds test scenarios for an endpoint.
   */
  private buildScenarios(endpoint: EndpointInfo, config: GeneratorConfig): TestScenario[] {
    const scenarios: TestScenario[] = [];

    // Positive scenario
    scenarios.push(this.buildPositiveScenario(endpoint, config));

    // Negative scenarios
    if (config.generateNegativeTests) {
      scenarios.push(...this.buildNegativeScenarios(endpoint));
    }

    return scenarios;
  }

  /**
   * Builds positive (happy path) scenario.
   */
  private buildPositiveScenario(endpoint: EndpointInfo, config: GeneratorConfig): TestScenario {
    const testName = this.generateTestName(endpoint);

    // Build request
    const request: TestScenario['request'] = {};

    // Path params with placeholders
    if (endpoint.pathParams.length > 0) {
      request.pathParams = {};
      for (const param of endpoint.pathParams) {
        request.pathParams[param.name] = config.usePlaceholders
          ? `\${${param.name.toUpperCase()}}`
          : String(this.generateSampleValue(param.schema));
      }
    }

    // Query params - prioritize: example > enum > generated
    if (endpoint.queryParams.length > 0) {
      request.queryParams = {};
      for (const param of endpoint.queryParams) {
        if (param.example !== undefined && param.example !== null) {
          request.queryParams[param.name] = String(param.example);
        } else if (param.schema.enumValues && param.schema.enumValues.length > 0) {
          // Use first enum value
          request.queryParams[param.name] = param.schema.enumValues[0];
        } else {
          request.queryParams[param.name] = String(this.generateSampleValue(param.schema));
        }
      }
    }

    // Request body from schema
    if (endpoint.requestBodySchema && endpoint.requestBodySchema.length > 0) {
      request.body = this.buildRequestBody(endpoint.requestBodySchema);
    }

    // Build assertions
    const assertions = this.buildAssertions(endpoint);

    return {
      name: testName,
      displayName: `${endpoint.method} ${endpoint.path}`,
      type: 'positive',
      request,
      expected: {
        statusCode: endpoint.successStatus,
        contentType: 'application/json',
        assertions
      }
    };
  }

  /**
   * Builds negative test scenarios based on endpoint constraints.
   * Generates tests for constraint violations, not just generic 400/401/404.
   */
  private buildNegativeScenarios(endpoint: EndpointInfo): TestScenario[] {
    const scenarios: TestScenario[] = [];
    const baseName = this.generateTestName(endpoint);

    // === Standard negative tests ===

    // 404 Not Found (for endpoints with path params)
    if (endpoint.pathParams.length > 0) {
      scenarios.push({
        name: `${baseName}_not_found`,
        displayName: `${endpoint.method} ${endpoint.path} - Not Found`,
        type: 'negative',
        request: {},
        expected: { statusCode: 404, assertions: [] }
      });
    }

    // 400 Bad Request (for endpoints with required request body)
    if (endpoint.requestBodyRequired) {
      scenarios.push({
        name: `${baseName}_empty_body`,
        displayName: `${endpoint.method} ${endpoint.path} - Empty Body`,
        type: 'negative',
        request: { body: {} },
        expected: { statusCode: 400, assertions: [] }
      });
    }

    // 401 Unauthorized (only if security is defined)
    if (endpoint.security && endpoint.security.length > 0) {
      scenarios.push({
        name: `${baseName}_unauthorized`,
        displayName: `${endpoint.method} ${endpoint.path} - Unauthorized`,
        type: 'negative',
        request: {},
        expected: { statusCode: 401, assertions: [] }
      });
    }

    // === Constraint-based negative tests ===

    if (endpoint.requestBodySchema && endpoint.requestBodySchema.length > 0) {
      const constraintTests = this.buildConstraintViolationTests(endpoint, baseName);
      scenarios.push(...constraintTests);
    }

    return scenarios;
  }

  /**
   * Generates negative tests that violate field constraints.
   */
  private buildConstraintViolationTests(endpoint: EndpointInfo, baseName: string): TestScenario[] {
    const scenarios: TestScenario[] = [];
    const fields = endpoint.requestBodySchema || [];

    // Limit to first 5 fields to avoid test explosion
    const testableFields = fields.filter(f => !f.path.includes('.')).slice(0, 5);

    for (const field of testableFields) {
      // Test: Invalid enum value
      if (field.enumValues && field.enumValues.length > 0) {
        scenarios.push({
          name: `${baseName}_invalid_enum_${this.sanitizeName(field.name)}`,
          displayName: `${endpoint.method} ${endpoint.path} - Invalid ${field.name} enum`,
          type: 'negative',
          request: {
            body: this.buildBodyWithField(fields, field.name, 'INVALID_ENUM_VALUE_XYZ')
          },
          expected: { statusCode: 400, assertions: [] }
        });
      }

      // Test: Value below minimum
      if (field.minimum !== undefined) {
        scenarios.push({
          name: `${baseName}_below_min_${this.sanitizeName(field.name)}`,
          displayName: `${endpoint.method} ${endpoint.path} - ${field.name} below minimum`,
          type: 'negative',
          request: {
            body: this.buildBodyWithField(fields, field.name, field.minimum - 1)
          },
          expected: { statusCode: 400, assertions: [] }
        });
      }

      // Test: Value above maximum
      if (field.maximum !== undefined) {
        scenarios.push({
          name: `${baseName}_above_max_${this.sanitizeName(field.name)}`,
          displayName: `${endpoint.method} ${endpoint.path} - ${field.name} above maximum`,
          type: 'negative',
          request: {
            body: this.buildBodyWithField(fields, field.name, field.maximum + 1)
          },
          expected: { statusCode: 400, assertions: [] }
        });
      }

      // Test: String too short (if minLength > 0)
      if (field.minLength !== undefined && field.minLength > 0) {
        const tooShort = field.minLength > 1 ? 'x'.repeat(field.minLength - 1) : '';
        scenarios.push({
          name: `${baseName}_too_short_${this.sanitizeName(field.name)}`,
          displayName: `${endpoint.method} ${endpoint.path} - ${field.name} too short`,
          type: 'negative',
          request: {
            body: this.buildBodyWithField(fields, field.name, tooShort)
          },
          expected: { statusCode: 400, assertions: [] }
        });
      }

      // Test: String too long
      if (field.maxLength !== undefined) {
        const tooLong = 'x'.repeat(field.maxLength + 10);
        scenarios.push({
          name: `${baseName}_too_long_${this.sanitizeName(field.name)}`,
          displayName: `${endpoint.method} ${endpoint.path} - ${field.name} too long`,
          type: 'negative',
          request: {
            body: this.buildBodyWithField(fields, field.name, tooLong)
          },
          expected: { statusCode: 400, assertions: [] }
        });
      }

      // Test: Pattern mismatch
      if (field.pattern) {
        scenarios.push({
          name: `${baseName}_pattern_mismatch_${this.sanitizeName(field.name)}`,
          displayName: `${endpoint.method} ${endpoint.path} - ${field.name} pattern mismatch`,
          type: 'negative',
          request: {
            body: this.buildBodyWithField(fields, field.name, '!!!INVALID_PATTERN!!!')
          },
          expected: { statusCode: 400, assertions: [] }
        });
      }

      // Test: Wrong type (string field gets number)
      if (field.fieldType === 'string' && !field.enumValues) {
        scenarios.push({
          name: `${baseName}_wrong_type_${this.sanitizeName(field.name)}`,
          displayName: `${endpoint.method} ${endpoint.path} - ${field.name} wrong type`,
          type: 'negative',
          request: {
            body: this.buildBodyWithField(fields, field.name, 12345)
          },
          expected: { statusCode: 400, assertions: [] }
        });
      }

      // Test: Number field gets string
      if (field.fieldType === 'integer' || field.fieldType === 'number') {
        scenarios.push({
          name: `${baseName}_wrong_type_${this.sanitizeName(field.name)}`,
          displayName: `${endpoint.method} ${endpoint.path} - ${field.name} wrong type`,
          type: 'negative',
          request: {
            body: this.buildBodyWithField(fields, field.name, 'not_a_number')
          },
          expected: { statusCode: 400, assertions: [] }
        });
      }

      // Test: Missing required field
      if (field.required) {
        scenarios.push({
          name: `${baseName}_missing_${this.sanitizeName(field.name)}`,
          displayName: `${endpoint.method} ${endpoint.path} - Missing ${field.name}`,
          type: 'negative',
          request: {
            body: this.buildBodyWithoutField(fields, field.name)
          },
          expected: { statusCode: 400, assertions: [] }
        });
      }
    }

    return scenarios;
  }

  /**
   * Builds request body with one field set to specific value.
   */
  private buildBodyWithField(
    fields: SchemaField[],
    targetField: string,
    value: unknown
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    // Add valid values for other required fields
    for (const field of fields) {
      if (!field.path.includes('.') && field.required && field.name !== targetField) {
        body[field.name] = this.generateSampleValue(field);
      }
    }

    // Set target field to test value
    body[targetField] = value;

    return body;
  }

  /**
   * Builds request body without specific field.
   */
  private buildBodyWithoutField(
    fields: SchemaField[],
    excludeField: string
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    for (const field of fields) {
      if (!field.path.includes('.') && field.required && field.name !== excludeField) {
        body[field.name] = this.generateSampleValue(field);
      }
    }

    return body;
  }

  /**
   * Sanitizes field name for use in test method name.
   */
  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  }

  /**
   * Builds assertions from response fields.
   * Adds fallback assertions if no schema exists.
   */
  private buildAssertions(endpoint: EndpointInfo): Assertion[] {
    const assertions: Assertion[] = [];

    // Add schema-based assertions if available
    if (endpoint.hasResponseSchema && endpoint.responseFields.length > 0) {
      // Track arrays to add notEmpty check before first [0] access
      const checkedArrays = new Set<string>();

      for (const field of endpoint.responseFields) {
        // For array paths like "items[0].id", add array not empty check first
        const arrayMatch = field.path.match(/^([^[]+)\[0\]/);
        if (arrayMatch) {
          const arrayPath = arrayMatch[1];
          if (!checkedArrays.has(arrayPath)) {
            checkedArrays.add(arrayPath);
            assertions.push({
              path: arrayPath,
              matcher: 'notEmpty',
              description: `${arrayPath} array is not empty`
            });
          }
        }

        // Use new multi-assertion method
        const fieldAssertions = this.fieldToAssertions(field);
        assertions.push(...fieldAssertions);
      }
    }

    // FALLBACK: Always add basic body check for 2xx responses
    if (assertions.length === 0) {
      // At minimum, verify response body is not null/empty
      assertions.push({
        path: '$',
        matcher: 'notNull',
        description: 'Response body is not null'
      });
    }

    return assertions;
  }

  /**
   * Maps format to matcher.
   */
  private formatToMatcher(format: string): { matcher: MatcherType; value?: unknown } | null {
    const formatMap: Record<string, { matcher: MatcherType; value?: string }> = {
      'uuid': {
        matcher: 'matchesPattern',
        value: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      },
      'email': { matcher: 'contains', value: '@' },
      'uri': { matcher: 'matchesPattern', value: '^https?://' },
      'url': { matcher: 'matchesPattern', value: '^https?://' },
      'date': { matcher: 'matchesPattern', value: '^\\d{4}-\\d{2}-\\d{2}$' },
      'date-time': { matcher: 'matchesPattern', value: '^\\d{4}-\\d{2}-\\d{2}' }
    };

    return formatMap[format] || null;
  }

  /**
   * Infers matcher from field name patterns (no schema format needed).
   */
  private inferMatcherFromName(field: SchemaField): { matcher: MatcherType; value?: unknown } | null {
    const name = field.name.toLowerCase();

    // UUID/ID patterns
    if (name === 'id' || name === 'uuid' || name === 'guid' ||
        name.endsWith('_id') || name.endsWith('Id') || name.endsWith('_uuid')) {
      return { matcher: 'notNull' };
    }

    // Date/time patterns
    if (name.includes('date') || name.includes('time') ||
        name.endsWith('_at') || name.endsWith('At') ||
        name === 'created' || name === 'updated' || name === 'deleted' ||
        name === 'timestamp' || name.includes('timestamp')) {
      return { matcher: 'matchesPattern', value: '^\\d{4}-\\d{2}-\\d{2}' };
    }

    // Email patterns
    if (name.includes('email') || name.includes('mail') || name === 'e_mail') {
      return { matcher: 'contains', value: '@' };
    }

    // URL patterns
    if (name.includes('url') || name.includes('uri') || name.includes('link') ||
        name.includes('href') || name.includes('endpoint') || name.includes('callback')) {
      return { matcher: 'matchesPattern', value: '^https?://' };
    }

    // Phone patterns
    if (name.includes('phone') || name.includes('mobile') || name.includes('tel') ||
        name === 'fax' || name.includes('cell')) {
      return { matcher: 'matchesPattern', value: '^[+0-9()\\s-]+$' };
    }

    // Name/title patterns (required string)
    if (name === 'name' || name === 'title' || name === 'label' ||
        name.endsWith('_name') || name.endsWith('Name') ||
        name.endsWith('_title') || name.endsWith('Title')) {
      return { matcher: 'notNull' };
    }

    // Count/size patterns (must be >= 0)
    if (name.includes('count') || name.includes('total') || name.includes('size') ||
        name.includes('length') || name.includes('amount') || name.includes('quantity') ||
        name.startsWith('num_') || name.startsWith('number_of')) {
      return { matcher: 'greaterThanOrEqual', value: 0 };
    }

    // Price/money patterns (must be >= 0)
    if (name.includes('price') || name.includes('cost') || name.includes('amount') ||
        name.includes('fee') || name.includes('sum') || name.includes('balance') ||
        name.includes('salary') || name.includes('payment')) {
      return { matcher: 'greaterThanOrEqual', value: 0 };
    }

    // Percentage patterns (0-100)
    if (name.includes('percent') || name.includes('ratio') || name.includes('rate') ||
        name.endsWith('_pct') || name.endsWith('Pct')) {
      return { matcher: 'lessThanOrEqual', value: 100 };
    }

    // Age patterns
    if (name === 'age' || name.endsWith('_age') || name.endsWith('Age')) {
      return { matcher: 'greaterThanOrEqual', value: 0 };
    }

    // Version patterns
    if (name === 'version' || name.endsWith('_version') || name.endsWith('Version')) {
      return { matcher: 'notNull' };
    }

    // Status patterns
    if (name === 'status' || name === 'state' || name.endsWith('_status') || name.endsWith('Status')) {
      return { matcher: 'notNull' };
    }

    // IP address patterns
    if (name === 'ip' || name.includes('ip_address') || name.includes('ipaddress') ||
        name.endsWith('_ip') || name.endsWith('Ip')) {
      return { matcher: 'matchesPattern', value: '^[0-9.:]+$' };
    }

    // Boolean-like name patterns (should be boolean type, just notNull check)
    if (name.startsWith('is_') || name.startsWith('has_') || name.startsWith('can_') ||
        name.startsWith('should_') || name.startsWith('allow_') || name.startsWith('enable') ||
        name.endsWith('_enabled') || name.endsWith('_active') || name.endsWith('_flag')) {
      return { matcher: 'notNull' };
    }

    return null;
  }

  /**
   * Maps type to assertion.
   */
  private typeToAssertion(field: SchemaField): Assertion {
    // First try to infer from field name
    const namePattern = this.inferMatcherFromName(field);
    if (namePattern) {
      return {
        path: field.path,
        matcher: namePattern.matcher,
        value: namePattern.value,
        description: `${field.name} matches expected pattern`
      };
    }

    // Fall back to type-based assertions
    switch (field.fieldType) {
      case 'array':
        return {
          path: field.path,
          matcher: 'notEmpty',
          description: `${field.name} is not empty array`
        };
      case 'boolean':
        return {
          path: field.path,
          matcher: 'isType',
          value: 'boolean',
          description: `${field.name} is boolean`
        };
      case 'integer':
      case 'number':
        return {
          path: field.path,
          matcher: 'isType',
          value: 'number',
          description: `${field.name} is number`
        };
      default:
        return {
          path: field.path,
          matcher: 'notNull',
          description: `${field.name} is not null`
        };
    }
  }

  /**
   * Converts SchemaField to multiple Assertions based on all available constraints.
   * Returns array of assertions for comprehensive field validation.
   */
  private fieldToAssertions(field: SchemaField): Assertion[] {
    const assertions: Assertion[] = [];

    // Skip deeply nested fields (limit to 3 levels for readability)
    const depth = (field.path.match(/\./g) || []).length;
    if (depth > 3) return assertions;

    // 1. Enum values -> oneOf (highest priority)
    if (field.enumValues && field.enumValues.length > 0) {
      assertions.push({
        path: field.path,
        matcher: 'oneOf',
        value: field.enumValues,
        description: `${field.name} is one of allowed values`
      });
      return assertions; // Enum is complete check, no need for others
    }

    // 2. Format-specific matchers
    if (field.format) {
      const formatMatcher = this.formatToMatcher(field.format);
      if (formatMatcher) {
        assertions.push({
          path: field.path,
          matcher: formatMatcher.matcher,
          value: formatMatcher.value,
          description: `${field.name} matches ${field.format} format`
        });
      }
    }

    // 3. Schema pattern (regex from OpenAPI)
    if (field.pattern && !field.format) {
      assertions.push({
        path: field.path,
        matcher: 'matchesPattern',
        value: field.pattern,
        description: `${field.name} matches schema pattern`
      });
    }

    // 4. Numeric boundary constraints
    if (field.minimum !== undefined) {
      assertions.push({
        path: field.path,
        matcher: 'greaterThanOrEqual',
        value: field.minimum,
        description: `${field.name} >= ${field.minimum}`
      });
    }
    if (field.maximum !== undefined) {
      assertions.push({
        path: field.path,
        matcher: 'lessThanOrEqual',
        value: field.maximum,
        description: `${field.name} <= ${field.maximum}`
      });
    }
    if (field.exclusiveMinimum !== undefined) {
      assertions.push({
        path: field.path,
        matcher: 'greaterThan',
        value: field.exclusiveMinimum,
        description: `${field.name} > ${field.exclusiveMinimum}`
      });
    }
    if (field.exclusiveMaximum !== undefined) {
      assertions.push({
        path: field.path,
        matcher: 'lessThan',
        value: field.exclusiveMaximum,
        description: `${field.name} < ${field.exclusiveMaximum}`
      });
    }

    // 5. String length constraints
    if (field.minLength !== undefined && field.minLength > 0) {
      assertions.push({
        path: field.path,
        matcher: 'hasMinLength',
        value: field.minLength,
        description: `${field.name} length >= ${field.minLength}`
      });
    }
    if (field.maxLength !== undefined) {
      assertions.push({
        path: field.path,
        matcher: 'hasMaxLength',
        value: field.maxLength,
        description: `${field.name} length <= ${field.maxLength}`
      });
    }

    // 6. Array size constraints
    if (field.fieldType === 'array') {
      if (field.minItems !== undefined && field.minItems > 0) {
        assertions.push({
          path: field.path,
          matcher: 'hasSizeGreaterThan',
          value: field.minItems - 1,
          description: `${field.name} has at least ${field.minItems} items`
        });
      }
      if (field.maxItems !== undefined) {
        assertions.push({
          path: field.path,
          matcher: 'hasSizeLessThan',
          value: field.maxItems + 1,
          description: `${field.name} has at most ${field.maxItems} items`
        });
      }
    }

    // 7. Try to infer from description
    if (assertions.length === 0 && field.description) {
      const descMatcher = this.inferFromDescription(field);
      if (descMatcher) {
        assertions.push({
          path: field.path,
          matcher: descMatcher.matcher,
          value: descMatcher.value,
          description: `${field.name} (inferred from description)`
        });
      }
    }

    // 8. Try to infer from field name
    if (assertions.length === 0) {
      const nameMatcher = this.inferMatcherFromName(field);
      if (nameMatcher) {
        assertions.push({
          path: field.path,
          matcher: nameMatcher.matcher,
          value: nameMatcher.value,
          description: `${field.name} matches expected pattern`
        });
      }
    }

    // 9. Fallback: type-based assertion (always add as base check)
    if (assertions.length === 0) {
      assertions.push(this.typeToAssertion(field));
    } else if (field.fieldType === 'integer' || field.fieldType === 'number') {
      // For numeric fields with constraints, also add type check
      assertions.unshift({
        path: field.path,
        matcher: 'isType',
        value: 'number',
        description: `${field.name} is number`
      });
    }

    return assertions;
  }

  /**
   * Infers matcher from field description text.
   */
  private inferFromDescription(field: SchemaField): { matcher: MatcherType; value?: unknown } | null {
    const desc = (field.description || '').toLowerCase();

    if (desc.includes('email') || desc.includes('e-mail') || desc.includes('электронн')) {
      return { matcher: 'contains', value: '@' };
    }
    if (desc.includes('url') || desc.includes('ссылк') || desc.includes('uri') || desc.includes('link') || desc.includes('href')) {
      return { matcher: 'matchesPattern', value: '^https?://' };
    }
    if (desc.includes('phone') || desc.includes('телефон') || desc.includes('mobile')) {
      return { matcher: 'matchesPattern', value: '^[+0-9]' };
    }
    if (desc.includes('uuid') || desc.includes('guid') || desc.includes('unique identifier') || desc.includes('уникальный идентификатор')) {
      return { matcher: 'matchesPattern', value: '[0-9a-f]{8}-[0-9a-f]{4}' };
    }
    if (desc.includes('timestamp') || desc.includes('iso 8601') || desc.includes('rfc 3339') || desc.includes('дата')) {
      return { matcher: 'matchesPattern', value: '^\\d{4}-\\d{2}-\\d{2}' };
    }
    if (desc.includes('positive') || desc.includes('положительн') || desc.includes('greater than zero') || desc.includes('больше нуля')) {
      return { matcher: 'greaterThan', value: 0 };
    }
    if (desc.includes('non-negative') || desc.includes('неотрицательн') || desc.includes('>= 0')) {
      return { matcher: 'greaterThanOrEqual', value: 0 };
    }
    if (desc.includes('percentage') || desc.includes('процент')) {
      return { matcher: 'lessThanOrEqual', value: 100 };
    }

    return null;
  }

  /**
   * Builds request body from schema fields.
   */
  private buildRequestBody(fields: SchemaField[]): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    // Only include required top-level fields
    for (const field of fields) {
      if (field.required && !field.path.includes('.')) {
        body[field.name] = this.generateSampleValue(field);
      }
    }

    // If no required fields, add common patterns
    if (Object.keys(body).length === 0) {
      const commonFields = fields.filter(f =>
        !f.path.includes('.') &&
        ['name', 'title', 'description', 'id'].includes(f.name.toLowerCase())
      );
      for (const field of commonFields.slice(0, 3)) {
        body[field.name] = this.generateSampleValue(field);
      }
    }

    return body;
  }

  /**
   * Generates sample value for a field.
   */
  private generateSampleValue(field: SchemaField): unknown {
    if (field.enumValues && field.enumValues.length > 0) {
      return field.enumValues[0];
    }

    switch (field.format) {
      case 'uuid':
        return '${UUID}';
      case 'email':
        return 'test@example.com';
      case 'date':
        return '2024-01-01';
      case 'date-time':
        return '2024-01-01T00:00:00Z';
      case 'uri':
      case 'url':
        return 'https://example.com';
    }

    switch (field.fieldType) {
      case 'string':
        return `Test ${field.name}`;
      case 'integer':
        return 1;
      case 'number':
        return 1.0;
      case 'boolean':
        return true;
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return null;
    }
  }

  /**
   * Generates test method/function name.
   */
  private generateTestName(endpoint: EndpointInfo): string {
    if (endpoint.operationId) {
      return `test_${this.toSnakeCase(endpoint.operationId)}`;
    }

    const pathParts = endpoint.path
      .replace(/\{(\w+)\}/g, 'by_$1')
      .split('/')
      .filter(p => p)
      .map(p => this.toSnakeCase(p));

    return `test_${endpoint.method.toLowerCase()}_${pathParts.join('_')}`;
  }

  private toSnakeCase(str: string): string {
    return str
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
      .replace(/-/g, '_')
      .replace(/__+/g, '_');
  }

  /**
   * Generates tests for a subset of endpoints.
   * Used when user selects specific endpoints in UI.
   */
  generateForEndpoints(
    endpoints: EndpointInfo[],
    config: Partial<GeneratorConfig>
  ): GenerationResult {
    try {
      const fullConfig: GeneratorConfig = {
        baseUrl: config.baseUrl || '',
        framework: config.framework || 'pytest',
        pythonPackage: config.pythonPackage,
        javaPackage: config.javaPackage || 'com.api.tests',
        generateNegativeTests: config.generateNegativeTests ?? true,
        generateEdgeCases: config.generateEdgeCases ?? false,
        generateUniversalTests: config.generateUniversalTests ?? false,
        usePlaceholders: config.usePlaceholders ?? true
      };

      // Build test model with filtered endpoints
      const parsed = { title: 'API Tests', version: '1.0.0', baseUrl: fullConfig.baseUrl };
      const model = this.buildTestModelFromEndpoints(endpoints, parsed, fullConfig);

      const renderer = this.renderers.get(fullConfig.framework);
      if (!renderer) {
        throw new Error(`Unknown framework: ${fullConfig.framework}`);
      }

      const files = renderer.render(model);
      const stats = this.calculateStats(model);

      return { success: true, files, stats };

    } catch (error) {
      return {
        success: false,
        files: [],
        stats: { totalEndpoints: 0, totalTests: 0, positiveTests: 0, negativeTests: 0, assertions: 0 },
        errors: [(error as Error).message]
      };
    }
  }

  /**
   * Builds TestModel from pre-filtered endpoints.
   */
  private buildTestModelFromEndpoints(
    endpoints: EndpointInfo[],
    parsed: { title: string; version: string; baseUrl: string },
    config: GeneratorConfig
  ): TestModel {
    const endpointTests: EndpointTest[] = [];

    for (const endpoint of endpoints) {
      const scenarios = this.buildScenarios(endpoint, config);
      endpointTests.push({ endpoint, scenarios });
    }

    return {
      meta: {
        source: 'OpenAPI Spec (filtered)',
        generatedAt: new Date().toISOString(),
        version: '1.0.0',
        specTitle: parsed.title,
        specVersion: parsed.version
      },
      config,
      endpoints: endpointTests
    };
  }

  /**
   * Calculates generation statistics.
   */
  private calculateStats(model: TestModel): GenerationResult['stats'] {
    let totalTests = 0;
    let positiveTests = 0;
    let negativeTests = 0;
    let assertions = 0;

    for (const ep of model.endpoints) {
      for (const scenario of ep.scenarios) {
        totalTests++;
        if (scenario.type === 'positive') {
          positiveTests++;
        } else {
          negativeTests++;
        }
        assertions += scenario.expected.assertions.length;
      }
    }

    return {
      totalEndpoints: model.endpoints.length,
      totalTests,
      positiveTests,
      negativeTests,
      assertions
    };
  }
}

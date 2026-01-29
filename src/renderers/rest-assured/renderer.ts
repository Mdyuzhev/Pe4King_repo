/**
 * REST Assured + JUnit 5 test renderer.
 */

import {
  TestModel,
  EndpointTest,
  EndpointInfo,
  TestScenario,
  GeneratedFile,
  HttpMethod,
  UniversalTest,
  UniversalTestCategory
} from '../../core/models';
import { generateUniversalTests } from '../../core/universal-tests';
import { BaseRenderer } from '../base-renderer';
import { RestAssuredMatcherFactory } from './matchers';
import {
  JAVA_FILE_HEADER,
  JAVA_TEST_METHOD,
  JAVA_MULTIPART_TEST,
  JAVA_NEGATIVE_TEST_404,
  JAVA_NEGATIVE_TEST_400,
  JAVA_NEGATIVE_TEST_401,
  JAVA_FILE_FOOTER,
  POM_XML,
  JAVA_SECURITY_FILE_HEADER,
  JAVA_AUTH_TEST,
  JAVA_INVALID_AUTH_TEST,
  JAVA_INJECTION_TEST,
  JAVA_METHOD_NOT_ALLOWED_TEST,
  JAVA_VALIDATION_TEST,
  JAVA_SCOPE_TEST,
  JAVA_PAGINATION_TEST,
  JAVA_CONTENT_TYPE_TEST,
  // Layer 1
  BASE_TEST_TEMPLATE,
  BASE_CLIENT_TEMPLATE,
  // Layer 2
  API_CLIENT_HEADER,
  API_CLIENT_METHOD,
  API_CLIENT_FOOTER,
  // Layer 3
  TEST_CLASS_HEADER,
  TEST_METHOD_WITH_CLIENT,
  SECURITY_TEST_CLASS_HEADER,
  SECURITY_TEST_NO_AUTH,
  SECURITY_TEST_INJECTION,
  SECURITY_TEST_VALIDATION,
  TEST_CLASS_FOOTER
} from './templates';

export class RestAssuredRenderer extends BaseRenderer {
  private matchers: RestAssuredMatcherFactory;

  constructor() {
    super();
    this.matchers = new RestAssuredMatcherFactory();
  }

  get name(): string { return 'rest-assured'; }
  get fileExtension(): string { return '.java'; }

  render(model: TestModel): GeneratedFile[] {
    // Use 3-layer architecture
    return this.renderLayered(model);
  }

  /**
   * Renders 3-layer architecture:
   * Layer 1: BaseTest.java, BaseClient.java (static framework)
   * Layer 2: API Clients per tag (UsersClient.java, etc.)
   * Layer 3: Test classes using clients
   */
  private renderLayered(model: TestModel): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const pkg = model.config.javaPackage || 'com.api.tests';
    const pkgPath = pkg.replace(/\./g, '/');

    // === Layer 1: Base classes ===
    files.push({
      filename: `src/test/java/${pkgPath}/base/BaseTest.java`,
      content: BASE_TEST_TEMPLATE
        .replace(/{package}/g, pkg)
        .replace(/{baseUrl}/g, model.config.baseUrl),
      language: 'java'
    });

    files.push({
      filename: `src/test/java/${pkgPath}/base/BaseClient.java`,
      content: BASE_CLIENT_TEMPLATE.replace(/{package}/g, pkg),
      language: 'java'
    });

    // === Group endpoints by tag ===
    const endpointsByTag = this.groupEndpointsByTag(model.endpoints);

    // === Layer 2 + Layer 3: For each tag ===
    for (const [tag, endpoints] of endpointsByTag) {
      const clientClassName = this.toClassName(tag) + 'Client';
      const testClassName = this.toClassName(tag) + 'ApiTest';

      // Layer 2: API Client
      files.push({
        filename: `src/test/java/${pkgPath}/clients/${clientClassName}.java`,
        content: this.renderApiClient(model, tag, clientClassName, endpoints),
        language: 'java'
      });

      // Layer 3: Test class
      files.push({
        filename: `src/test/java/${pkgPath}/tests/${testClassName}.java`,
        content: this.renderTestClassWithClient(model, tag, testClassName, clientClassName, endpoints),
        language: 'java'
      });

      // Layer 3: Security tests (if enabled)
      if (model.config.generateUniversalTests) {
        const securityTestClassName = this.toClassName(tag) + 'SecurityTest';
        files.push({
          filename: `src/test/java/${pkgPath}/tests/${securityTestClassName}.java`,
          content: this.renderSecurityTestClassWithClient(model, tag, securityTestClassName, clientClassName, endpoints),
          language: 'java'
        });
      }
    }

    // pom.xml
    const groupId = pkg.split('.').slice(0, 2).join('.') || 'com.api';
    files.push({
      filename: 'pom.xml',
      content: POM_XML.replace(/{groupId}/g, groupId),
      language: 'xml'
    });

    return files;
  }

  /**
   * Groups endpoints by their first tag (or 'Default' if no tag).
   */
  private groupEndpointsByTag(endpoints: EndpointTest[]): Map<string, EndpointTest[]> {
    const groups = new Map<string, EndpointTest[]>();

    for (const ep of endpoints) {
      const tag = ep.endpoint.tags?.[0] || 'Default';
      if (!groups.has(tag)) {
        groups.set(tag, []);
      }
      groups.get(tag)!.push(ep);
    }

    return groups;
  }

  /**
   * Converts tag name to Java class name.
   */
  private toClassName(tag: string): string {
    return tag
      .split(/[\s_-]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
      .replace(/[^a-zA-Z0-9]/g, '');
  }

  /**
   * Layer 2: Renders API Client class.
   */
  private renderApiClient(model: TestModel, tag: string, className: string, endpoints: EndpointTest[]): string {
    const pkg = model.config.javaPackage || 'com.api.tests';

    let content = API_CLIENT_HEADER
      .replace(/{package}/g, pkg)
      .replace(/{tag}/g, tag)
      .replace(/{className}/g, className);

    for (const ep of endpoints) {
      content += this.renderClientMethod(ep.endpoint);
    }

    content += API_CLIENT_FOOTER;
    return content;
  }

  /**
   * Renders a single client method.
   */
  private renderClientMethod(endpoint: EndpointInfo): string {
    const methodName = this.sanitizeMethodName(endpoint.operationId || `${endpoint.method}_${endpoint.path}`);
    const description = endpoint.summary || endpoint.operationId || `${endpoint.method} ${endpoint.path}`;

    // Build parameters list
    const params: string[] = [];
    const pathParamLines: string[] = [];
    const queryParamLines: string[] = [];
    let bodyLine = '';

    // Path params
    for (const param of endpoint.pathParams) {
      params.push(`String ${param.name}`);
      pathParamLines.push(`            .pathParam("${param.name}", ${param.name})`);
    }

    // Query params (as Map)
    if (endpoint.queryParams.length > 0) {
      params.push('Map<String, Object> queryParams');
      queryParamLines.push('            .queryParams(queryParams)');
    }

    // Body
    if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      params.push('Object body');
      bodyLine = '            .body(body)\n';
    }

    // Build path with {param} placeholders
    const path = endpoint.path;

    return API_CLIENT_METHOD
      .replace(/{description}/g, description)
      .replace(/{method}/g, endpoint.method)
      .replace(/{path}/g, path)
      .replace(/{methodName}/g, methodName)
      .replace(/{parameters}/g, params.join(', '))
      .replace(/{pathParams}/g, pathParamLines.length > 0 ? pathParamLines.join('\n') + '\n' : '')
      .replace(/{queryParams}/g, queryParamLines.length > 0 ? queryParamLines.join('\n') + '\n' : '')
      .replace(/{body}/g, bodyLine)
      .replace(/{httpMethod}/g, endpoint.method.toLowerCase());
  }

  /**
   * Layer 3: Renders Test class using client.
   */
  private renderTestClassWithClient(
    model: TestModel,
    tag: string,
    className: string,
    clientClassName: string,
    endpoints: EndpointTest[]
  ): string {
    const pkg = model.config.javaPackage || 'com.api.tests';

    let content = TEST_CLASS_HEADER
      .replace(/{package}/g, pkg)
      .replace(/{tag}/g, tag)
      .replace(/{source}/g, model.meta.source)
      .replace(/{generatedAt}/g, model.meta.generatedAt)
      .replace(/{className}/g, className)
      .replace(/{clientClass}/g, clientClassName);

    let order = 1;
    for (const ep of this.sortByCrudOrder(endpoints)) {
      for (const scenario of ep.scenarios) {
        content += this.renderTestMethodWithClient(ep, scenario, order++);
      }
    }

    content += TEST_CLASS_FOOTER;
    return content;
  }

  /**
   * Renders a test method that uses the client.
   */
  private renderTestMethodWithClient(ep: EndpointTest, scenario: TestScenario, order: number): string {
    const clientMethod = this.sanitizeMethodName(ep.endpoint.operationId || `${ep.endpoint.method}_${ep.endpoint.path}`);

    // Build call params
    const callParams: string[] = [];

    // Path params
    for (const param of ep.endpoint.pathParams) {
      const value = scenario.request.pathParams?.[param.name] || `"test-${param.name}"`;
      callParams.push(typeof value === 'string' && !value.startsWith('"') ? `"${value}"` : value);
    }

    // Query params
    if (ep.endpoint.queryParams.length > 0) {
      if (scenario.request.queryParams && Object.keys(scenario.request.queryParams).length > 0) {
        const mapEntries = Object.entries(scenario.request.queryParams)
          .map(([k, v]) => `"${k}", ${this.toJavaLiteral(v)}`)
          .join(', ');
        callParams.push(`Map.of(${mapEntries})`);
      } else {
        callParams.push('Map.of()');
      }
    }

    // Body
    if (['POST', 'PUT', 'PATCH'].includes(ep.endpoint.method)) {
      if (scenario.request.body && Object.keys(scenario.request.body as object).length > 0) {
        const bodyMap = this.objectToMapOf(scenario.request.body as Record<string, unknown>);
        callParams.push(bodyMap);
      } else {
        callParams.push('Map.of()');
      }
    }

    const assertions = this.buildAssertionsForClient(scenario);

    return TEST_METHOD_WITH_CLIENT
      .replace(/{order}/g, String(order))
      .replace(/{displayName}/g, scenario.displayName)
      .replace(/{testName}/g, scenario.name)
      .replace(/{clientMethod}/g, clientMethod)
      .replace(/{callParams}/g, callParams.join(', '))
      .replace(/{statusCode}/g, String(scenario.expected.statusCode))
      .replace(/{assertions}/g, assertions);
  }

  /**
   * Builds assertions for client-based tests.
   */
  private buildAssertionsForClient(scenario: TestScenario): string {
    if (scenario.expected.assertions.length === 0) {
      return ''; // Just status code check
    }

    const lines: string[] = [];
    const checkedArrays = new Set<string>();

    for (const assertion of scenario.expected.assertions) {
      const arrayMatch = assertion.path.match(/^([^[]+)\[0\]/);
      if (arrayMatch) {
        const arrayPath = arrayMatch[1];
        if (!checkedArrays.has(arrayPath)) {
          checkedArrays.add(arrayPath);
          lines.push(`            ${this.matchers.arrayNotEmpty(arrayPath)}`);
        }
      }
      lines.push(`            ${this.matchers.fromAssertion(assertion)}`);
    }

    return '\n' + lines.join('\n');
  }

  /**
   * Converts JS object to Map.of() Java literal.
   */
  private objectToMapOf(obj: Record<string, unknown>): string {
    const entries = Object.entries(obj)
      .slice(0, 5) // Limit to avoid huge maps
      .map(([k, v]) => `"${k}", ${this.toJavaLiteral(v)}`)
      .join(', ');
    return `Map.of(${entries})`;
  }

  /**
   * Layer 3: Renders Security Test class using client.
   */
  private renderSecurityTestClassWithClient(
    model: TestModel,
    tag: string,
    className: string,
    clientClassName: string,
    endpoints: EndpointTest[]
  ): string {
    const pkg = model.config.javaPackage || 'com.api.tests';

    let content = SECURITY_TEST_CLASS_HEADER
      .replace(/{package}/g, pkg)
      .replace(/{tag}/g, tag)
      .replace(/{source}/g, model.meta.source)
      .replace(/{generatedAt}/g, model.meta.generatedAt)
      .replace(/{className}/g, className)
      .replace(/{clientClass}/g, clientClassName);

    for (const ep of endpoints) {
      const universalTests = generateUniversalTests(ep.endpoint);
      for (const test of universalTests) {
        content += this.renderSecurityTestWithClient(ep.endpoint, test);
      }
    }

    content += TEST_CLASS_FOOTER;
    return content;
  }

  /**
   * Renders a security test method that uses the client.
   */
  private renderSecurityTestWithClient(endpoint: EndpointInfo, test: UniversalTest): string {
    const endpointName = this.sanitizeMethodName(endpoint.operationId || `${endpoint.method}_${endpoint.path}`);
    const clientMethod = endpointName;
    const testName = this.sanitizeMethodName(test.name);

    // Build call params with injected values
    const callParams: string[] = [];

    // Path params (with overrides for injection)
    for (const param of endpoint.pathParams) {
      const override = test.modification.pathParamOverride?.[param.name];
      const value = override || `"test-${param.name}"`;
      callParams.push(value.startsWith('"') ? value : `"${value.replace(/"/g, '\\"')}"`);
    }

    // Query params
    if (endpoint.queryParams.length > 0) {
      if (test.modification.queryParamOverride) {
        const entries = Object.entries(test.modification.queryParamOverride)
          .map(([k, v]) => `"${k}", "${v.replace(/"/g, '\\"')}"`)
          .join(', ');
        callParams.push(`Map.of(${entries})`);
      } else {
        callParams.push('Map.of()');
      }
    }

    // Body
    if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      if (test.modification.bodyOverride) {
        const body = JSON.stringify(test.modification.bodyOverride).replace(/"/g, '\\"');
        callParams.push(`"${body}"`);
      } else {
        callParams.push('Map.of()');
      }
    }

    // Select template based on category
    switch (test.category) {
      case UniversalTestCategory.AUTH:
        if (test.modification.removeAuth) {
          return SECURITY_TEST_NO_AUTH
            .replace(/{method}/g, endpoint.method)
            .replace(/{path}/g, endpoint.path)
            .replace(/{endpointName}/g, endpointName)
            .replace(/{clientMethod}/g, clientMethod)
            .replace(/{callParams}/g, callParams.join(', '));
        }
        // Fall through to injection for invalid auth
        return SECURITY_TEST_INJECTION
          .replace(/{method}/g, endpoint.method)
          .replace(/{path}/g, endpoint.path)
          .replace(/{testName}/g, testName)
          .replace(/{endpointName}/g, endpointName)
          .replace(/{clientMethod}/g, clientMethod)
          .replace(/{callParams}/g, callParams.join(', '))
          .replace(/{payload}/g, test.modification.invalidAuth || 'invalid');

      case UniversalTestCategory.INJECTION:
        const payload = test.modification.pathParamOverride
          ? Object.values(test.modification.pathParamOverride)[0]
          : test.modification.bodyOverride
            ? JSON.stringify(test.modification.bodyOverride)
            : '';
        return SECURITY_TEST_INJECTION
          .replace(/{method}/g, endpoint.method)
          .replace(/{path}/g, endpoint.path)
          .replace(/{testName}/g, testName)
          .replace(/{endpointName}/g, endpointName)
          .replace(/{clientMethod}/g, clientMethod)
          .replace(/{callParams}/g, callParams.join(', '))
          .replace(/{payload}/g, payload.replace(/"/g, '\\"'));

      default:
        return SECURITY_TEST_VALIDATION
          .replace(/{method}/g, endpoint.method)
          .replace(/{path}/g, endpoint.path)
          .replace(/{testName}/g, testName)
          .replace(/{endpointName}/g, endpointName)
          .replace(/{clientMethod}/g, clientMethod)
          .replace(/{callParams}/g, callParams.join(', '));
    }
  }

  // ============================================================================
  // Legacy methods (kept for compatibility)
  // ============================================================================

  private renderTestClass(model: TestModel, className: string): string {
    const pkg = model.config.javaPackage || 'com.api.tests';

    let content = JAVA_FILE_HEADER
      .replace(/{package}/g, pkg)
      .replace(/{source}/g, model.meta.source)
      .replace(/{generatedAt}/g, model.meta.generatedAt)
      .replace(/{className}/g, className)
      .replace(/{baseUrl}/g, model.config.baseUrl);

    // Sort endpoints by CRUD order
    const sortedEndpoints = this.sortByCrudOrder(model.endpoints);

    let orderCounter = 1;
    for (const endpointTest of sortedEndpoints) {
      for (const scenario of endpointTest.scenarios) {
        content += this.renderTest(endpointTest, scenario, orderCounter++);
      }
    }

    content += JAVA_FILE_FOOTER;
    return content;
  }

  /**
   * Renders security/universal tests class.
   */
  private renderSecurityTestClass(model: TestModel, className: string): string {
    const pkg = model.config.javaPackage || 'com.api.tests';

    let content = JAVA_SECURITY_FILE_HEADER
      .replace(/{package}/g, pkg)
      .replace(/{source}/g, model.meta.source)
      .replace(/{generatedAt}/g, model.meta.generatedAt)
      .replace(/{className}/g, className)
      .replace(/{baseUrl}/g, model.config.baseUrl);

    // Generate tests for each endpoint
    for (const endpointTest of model.endpoints) {
      const endpoint = endpointTest.endpoint;
      const universalTests = generateUniversalTests(endpoint);

      for (const test of universalTests) {
        content += this.renderUniversalTest(endpoint, test);
      }
    }

    content += JAVA_FILE_FOOTER;
    return content;
  }

  /**
   * Renders a single universal test.
   */
  private renderUniversalTest(endpoint: EndpointInfo, test: UniversalTest): string {
    const endpointName = this.sanitizeMethodName(endpoint.operationId || `${endpoint.method}_${endpoint.path}`);
    const path = this.buildPathWithOverrides(endpoint, test.modification.pathParamOverride);

    switch (test.category) {
      case UniversalTestCategory.AUTH:
        if (test.modification.removeAuth) {
          return JAVA_AUTH_TEST
            .replace(/{endpoint_name}/g, endpointName)
            .replace(/{description}/g, test.description)
            .replace(/{method}/g, endpoint.method)
            .replace(/{method_lower}/g, endpoint.method.toLowerCase())
            .replace(/{path}/g, path);
        } else {
          return JAVA_INVALID_AUTH_TEST
            .replace(/{endpoint_name}/g, endpointName)
            .replace(/{description}/g, test.description)
            .replace(/{method}/g, endpoint.method)
            .replace(/{method_lower}/g, endpoint.method.toLowerCase())
            .replace(/{path}/g, path)
            .replace(/{invalid_token}/g, test.modification.invalidAuth || 'invalid');
        }

      case UniversalTestCategory.INJECTION:
        const payload = test.modification.pathParamOverride
          ? Object.values(test.modification.pathParamOverride)[0]
          : test.modification.bodyOverride
            ? JSON.stringify(test.modification.bodyOverride)
            : '';
        return JAVA_INJECTION_TEST
          .replace(/{endpoint_name}/g, endpointName)
          .replace(/{test_name}/g, this.sanitizeMethodName(test.name))
          .replace(/{description}/g, test.description)
          .replace(/{method}/g, endpoint.method)
          .replace(/{method_lower}/g, endpoint.method.toLowerCase())
          .replace(/{path}/g, path)
          .replace(/{payload}/g, payload.replace(/"/g, '\\"'))
          .replace(/{request_args}/g, this.buildSecurityRequestArgs(test));

      case UniversalTestCategory.METHOD:
        const wrongMethod = test.modification.overrideMethod || HttpMethod.GET;
        return JAVA_METHOD_NOT_ALLOWED_TEST
          .replace(/{endpoint_name}/g, endpointName)
          .replace(/{description}/g, test.description)
          .replace(/{method}/g, endpoint.method)
          .replace(/{wrong_method}/g, wrongMethod)
          .replace(/{wrong_method_lower}/g, wrongMethod.toLowerCase())
          .replace(/{path}/g, path);

      case UniversalTestCategory.SCOPE:
        return JAVA_SCOPE_TEST
          .replace(/{endpoint_name}/g, endpointName)
          .replace(/{test_name}/g, this.sanitizeMethodName(test.name))
          .replace(/{description}/g, test.description)
          .replace(/{method}/g, endpoint.method)
          .replace(/{method_lower}/g, endpoint.method.toLowerCase())
          .replace(/{path}/g, path)
          .replace(/{wrong_scope}/g, test.modification.wrongScope || 'wrong:scope');

      case UniversalTestCategory.PAGINATION:
        const queryParamsLines: string[] = [];
        if (test.modification.queryParamOverride) {
          for (const [k, v] of Object.entries(test.modification.queryParamOverride)) {
            queryParamsLines.push(`            .queryParam("${k}", "${v.replace(/"/g, '\\"')}")`);
          }
        }
        return JAVA_PAGINATION_TEST
          .replace(/{endpoint_name}/g, endpointName)
          .replace(/{test_name}/g, this.sanitizeMethodName(test.name))
          .replace(/{description}/g, test.description)
          .replace(/{method}/g, endpoint.method)
          .replace(/{method_lower}/g, endpoint.method.toLowerCase())
          .replace(/{path}/g, path)
          .replace(/{query_params}/g, queryParamsLines.join('\n') || '            // No query params');

      case UniversalTestCategory.CONTENT_TYPE:
        const contentType = test.modification.overrideContentType || 'text/plain';
        const bodyStr = typeof test.modification.bodyOverride === 'string'
          ? test.modification.bodyOverride.replace(/"/g, '\\"')
          : JSON.stringify(test.modification.bodyOverride).replace(/"/g, '\\"');
        return JAVA_CONTENT_TYPE_TEST
          .replace(/{endpoint_name}/g, endpointName)
          .replace(/{test_name}/g, this.sanitizeMethodName(test.name))
          .replace(/{description}/g, test.description)
          .replace(/{method}/g, endpoint.method)
          .replace(/{method_lower}/g, endpoint.method.toLowerCase())
          .replace(/{path}/g, path)
          .replace(/{content_type}/g, contentType)
          .replace(/{body}/g, bodyStr);

      default:
        // Generic validation test
        return JAVA_VALIDATION_TEST
          .replace(/{endpoint_name}/g, endpointName)
          .replace(/{test_name}/g, this.sanitizeMethodName(test.name))
          .replace(/{description}/g, test.description)
          .replace(/{method}/g, endpoint.method)
          .replace(/{method_lower}/g, endpoint.method.toLowerCase())
          .replace(/{path}/g, path)
          .replace(/{request_args}/g, this.buildSecurityRequestArgs(test));
    }
  }

  /**
   * Builds path with parameter overrides for security tests.
   */
  private buildPathWithOverrides(endpoint: EndpointInfo, overrides?: Record<string, string>): string {
    let path = endpoint.path;
    if (overrides) {
      for (const [name, value] of Object.entries(overrides)) {
        path = path.replace(`{${name}}`, value);
      }
    }
    // Fill remaining params with placeholders
    for (const param of endpoint.pathParams) {
      path = path.replace(`{${param.name}}`, `{${param.name}}`);
    }
    return path;
  }

  /**
   * Builds request arguments for security tests.
   */
  private buildSecurityRequestArgs(test: UniversalTest): string {
    const lines: string[] = [];

    if (test.modification.queryParamOverride) {
      for (const [k, v] of Object.entries(test.modification.queryParamOverride)) {
        lines.push(`            .queryParam("${k}", "${v.replace(/"/g, '\\"')}")`);
      }
    }

    if (test.modification.bodyOverride) {
      const body = JSON.stringify(test.modification.bodyOverride).replace(/"/g, '\\"');
      lines.push(`            .body("${body}")`);
    }

    return lines.length > 0 ? lines.join('\n') : '            // No additional params';
  }

  /**
   * Sanitizes name for Java method.
   */
  private sanitizeMethodName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
  }

  /**
   * Sort endpoints by CRUD order: POST (create) -> GET -> PUT/PATCH -> DELETE
   */
  private sortByCrudOrder(endpoints: EndpointTest[]): EndpointTest[] {
    const methodOrder: Record<string, number> = {
      'POST': 1,
      'GET': 2,
      'PUT': 3,
      'PATCH': 4,
      'DELETE': 5
    };

    return [...endpoints].sort((a, b) => {
      const orderA = methodOrder[a.endpoint.method] || 99;
      const orderB = methodOrder[b.endpoint.method] || 99;
      if (orderA !== orderB) return orderA - orderB;
      // Same method - sort by path length (shorter = more general = first)
      return a.endpoint.path.length - b.endpoint.path.length;
    });
  }

  private renderTest(endpointTest: EndpointTest, scenario: TestScenario, order: number): string {
    const { endpoint } = endpointTest;

    // Handle negative tests
    if (scenario.type === 'negative') {
      return this.renderNegativeTest(endpointTest, scenario, order);
    }

    const arrange = this.buildArrange(endpoint, scenario);
    const pathExpr = this.buildPathExpression(endpoint, scenario);
    const requestBody = this.buildRequestBody(scenario);
    const assertions = this.buildAssertions(scenario);
    const isMultipart = this.isMultipartEndpoint(endpoint);

    const template = isMultipart ? JAVA_MULTIPART_TEST : JAVA_TEST_METHOD;

    return template
      .replace(/{displayName}/g, scenario.displayName)
      .replace(/{methodName}/g, scenario.name)
      .replace(/{order}/g, String(order))
      .replace(/{arrange}/g, arrange)
      .replace(/{httpMethod}/g, endpoint.method.toLowerCase())
      .replace(/{pathExpr}/g, pathExpr)
      .replace(/{statusCode}/g, String(scenario.expected.statusCode))
      .replace(/{requestBody}/g, requestBody)
      .replace(/{assertions}/g, assertions)
      .replace(/{specName}/g, 'spec');
  }

  private renderNegativeTest(endpointTest: EndpointTest, scenario: TestScenario, order: number): string {
    const { endpoint } = endpointTest;
    const pathExpr = this.buildPathExpression(endpoint, scenario);
    const requestBody = this.buildRequestBody(scenario);

    // Select template based on expected status code
    let template: string;
    let pathExprForTest = pathExpr;

    if (scenario.expected.statusCode === 404) {
      template = JAVA_NEGATIVE_TEST_404;
      // Use non-existent ID for 404 tests
      pathExprForTest = this.buildNonExistentPath(endpoint);
    } else if (scenario.expected.statusCode === 400) {
      template = JAVA_NEGATIVE_TEST_400;
    } else if (scenario.expected.statusCode === 401) {
      template = JAVA_NEGATIVE_TEST_401;
    } else {
      // Fallback to 400 template
      template = JAVA_NEGATIVE_TEST_400;
    }

    return template
      .replace(/{displayName}/g, scenario.displayName)
      .replace(/{methodName}/g, scenario.name)
      .replace(/{order}/g, String(order))
      .replace(/{httpMethod}/g, endpoint.method.toLowerCase())
      .replace(/{pathExpr}/g, pathExprForTest)
      .replace(/{requestBody}/g, requestBody)
      .replace(/{specName}/g, scenario.expected.statusCode === 401 ? 'specNoAuth' : 'spec');
  }

  private buildNonExistentPath(endpoint: { path: string; pathParams: { name: string }[] }): string {
    let path = endpoint.path;
    for (const param of endpoint.pathParams) {
      path = path.replace(`{${param.name}}`, 'NONEXISTENT_99999');
    }
    return `"${path}"`;
  }

  private isMultipartEndpoint(endpoint: EndpointInfo): boolean {
    if (endpoint.consumes?.includes('multipart/form-data')) {
      return true;
    }
    // Check for file upload indicators in path or operationId
    const pathLower = endpoint.path.toLowerCase();
    const opId = endpoint.operationId?.toLowerCase() || '';
    return pathLower.includes('upload') || opId.includes('upload');
  }

  private buildArrange(
    endpoint: { path: string; pathParams: { name: string }[] },
    scenario: TestScenario
  ): string {
    const lines: string[] = [];

    // Path parameters
    if (scenario.request.pathParams) {
      for (const [name, value] of Object.entries(scenario.request.pathParams)) {
        const javaValue = value.startsWith('${')
          ? `System.getenv().getOrDefault("${name.toUpperCase()}", "test-${name}")`
          : `"${value}"`;
        lines.push(`        String ${name} = ${javaValue};`);
      }
    }

    // Request body
    if (scenario.request.body && Object.keys(scenario.request.body).length > 0) {
      lines.push('        Map<String, Object> body = new HashMap<>();');
      for (const [key, value] of Object.entries(scenario.request.body as Record<string, unknown>)) {
        lines.push(`        body.put("${key}", ${this.toJavaLiteral(value)});`);
      }
    }

    return lines.length > 0 ? lines.join('\n') : '        // No setup required';
  }

  private buildPathExpression(
    endpoint: { path: string },
    scenario: TestScenario
  ): string {
    let path = endpoint.path;

    if (scenario.request.pathParams && Object.keys(scenario.request.pathParams).length > 0) {
      for (const name of Object.keys(scenario.request.pathParams)) {
        path = path.replace(`{${name}}`, `" + ${name} + "`);
      }
      // Clean up trailing concatenation: + "" at the end
      let result = `"${path}"`;
      result = result.replace(/ \+ ""$/, '');
      return result;
    }

    return `"${path}"`;
  }

  private buildRequestBody(scenario: TestScenario): string {
    const lines: string[] = [];

    // Query parameters
    if (scenario.request.queryParams && Object.keys(scenario.request.queryParams).length > 0) {
      for (const [name, value] of Object.entries(scenario.request.queryParams)) {
        const javaValue = String(value).startsWith('${')
          ? `System.getenv().getOrDefault("${name.toUpperCase()}", "test-${name}")`
          : `"${value}"`;
        lines.push(`            .queryParam("${name}", ${javaValue})`);
      }
    }

    // Request body
    if (scenario.request.body && Object.keys(scenario.request.body as Record<string, unknown>).length > 0) {
      lines.push('            .body(body)');
    }

    return lines.join('\n');
  }

  private buildAssertions(scenario: TestScenario): string {
    if (scenario.expected.assertions.length === 0) {
      return '; // No response schema defined';
    }

    const lines: string[] = [];

    // Array bounds checking
    const checkedArrays = new Set<string>();

    for (const assertion of scenario.expected.assertions) {
      const arrayMatch = assertion.path.match(/^([^[]+)\[0\]/);
      if (arrayMatch) {
        const arrayPath = arrayMatch[1];
        if (!checkedArrays.has(arrayPath)) {
          checkedArrays.add(arrayPath);
          lines.push(`            ${this.matchers.arrayNotEmpty(arrayPath)}`);
        }
      }
      lines.push(`            ${this.matchers.fromAssertion(assertion)}`);
    }

    return '\n' + lines.join('\n') + ';';
  }

  private generateClassName(title: string): string {
    const cleaned = title
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
    const name = /^[A-Z]/.test(cleaned) ? cleaned : `Api${cleaned}`;
    return `${name}Test`;
  }

  private toJavaLiteral(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') {
      if (value.startsWith('${')) {
        const varName = value.slice(2, -1);
        return `System.getenv().getOrDefault("${varName}", "test-value")`;
      }
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) {
      if (value.length === 0) return 'List.of()';
      return `List.of(${value.map(v => this.toJavaLiteral(v)).join(', ')})`;
    }
    return 'Map.of()';
  }
}

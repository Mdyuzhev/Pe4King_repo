/**
 * pytest + requests test renderer.
 */

import {
  TestModel,
  EndpointTest,
  TestScenario,
  GeneratedFile,
  HttpMethod,
  UniversalTest,
  UniversalTestCategory,
  EndpointInfo
} from '../../core/models';
import { generateUniversalTests } from '../../core/universal-tests';
import { BaseRenderer } from '../base-renderer';
import { PytestMatcherFactory } from './matchers';
import {
  PYTEST_FILE_HEADER,
  PYTEST_TEST_FUNCTION,
  PYTEST_NEGATIVE_TEST,
  PYTEST_CONFTEST,
  PYTEST_UNIVERSAL_FILE_HEADER,
  PYTEST_AUTH_TEST,
  PYTEST_INVALID_AUTH_TEST,
  PYTEST_INJECTION_TEST,
  PYTEST_METHOD_NOT_ALLOWED_TEST,
  PYTEST_SCOPE_TEST,
  PYTEST_PAGINATION_TEST,
  PYTEST_CONTENT_TYPE_TEST
} from './templates';

export class PytestRenderer extends BaseRenderer {
  private matchers: PytestMatcherFactory;

  constructor() {
    super();
    this.matchers = new PytestMatcherFactory();
  }

  get name(): string { return 'pytest'; }
  get fileExtension(): string { return '.py'; }

  render(model: TestModel): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Main test file
    files.push({
      filename: 'test_api.py',
      content: this.renderMainFile(model),
      language: 'python'
    });

    // Universal/Security tests file (if enabled)
    if (model.config.generateUniversalTests) {
      files.push({
        filename: 'test_security.py',
        content: this.renderUniversalTestsFile(model),
        language: 'python'
      });
    }

    // conftest.py with fixtures
    files.push({
      filename: 'conftest.py',
      content: PYTEST_CONFTEST.replace(/{baseUrl}/g, model.config.baseUrl),
      language: 'python'
    });

    // requirements.txt
    files.push({
      filename: 'requirements.txt',
      content: 'pytest>=7.0.0\nrequests>=2.28.0\n',
      language: 'text'
    });

    return files;
  }

  private renderMainFile(model: TestModel): string {
    let content = PYTEST_FILE_HEADER
      .replace(/{source}/g, model.meta.source)
      .replace(/{generatedAt}/g, model.meta.generatedAt)
      .replace(/{baseUrl}/g, model.config.baseUrl);

    for (const endpointTest of model.endpoints) {
      for (const scenario of endpointTest.scenarios) {
        content += this.renderTest(endpointTest, scenario);
      }
    }

    return content;
  }

  /**
   * Renders universal security/validation tests file.
   */
  private renderUniversalTestsFile(model: TestModel): string {
    let content = PYTEST_UNIVERSAL_FILE_HEADER
      .replace(/{source}/g, model.meta.source)
      .replace(/{generatedAt}/g, model.meta.generatedAt)
      .replace(/{baseUrl}/g, model.config.baseUrl);

    // Generate tests for each endpoint
    for (const endpointTest of model.endpoints) {
      const endpoint = endpointTest.endpoint;
      const universalTests = generateUniversalTests(endpoint);

      for (const test of universalTests) {
        content += this.renderUniversalTest(endpoint, test);
      }
    }

    return content;
  }

  /**
   * Renders a single universal test.
   */
  private renderUniversalTest(endpoint: EndpointInfo, test: UniversalTest): string {
    const endpointName = this.sanitizeName(endpoint.operationId || `${endpoint.method}_${endpoint.path}`);
    const path = this.buildPathWithOverrides(endpoint, test.modification.pathParamOverride);

    switch (test.category) {
      case UniversalTestCategory.AUTH:
        if (test.modification.removeAuth) {
          return PYTEST_AUTH_TEST
            .replace(/{endpoint_name}/g, endpointName)
            .replace(/{description}/g, test.description)
            .replace(/{method}/g, endpoint.method)
            .replace(/{method_lower}/g, endpoint.method.toLowerCase())
            .replace(/{path}/g, path);
        } else {
          return PYTEST_INVALID_AUTH_TEST
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
        return PYTEST_INJECTION_TEST
          .replace(/{endpoint_name}/g, endpointName)
          .replace(/{test_name}/g, test.name)
          .replace(/{description}/g, test.description)
          .replace(/{method}/g, endpoint.method)
          .replace(/{method_lower}/g, endpoint.method.toLowerCase())
          .replace(/{path}/g, path)
          .replace(/{payload}/g, payload.replace(/"/g, '\\"'))
          .replace(/{request_args}/g, this.buildRequestArgs(test));

      case UniversalTestCategory.METHOD:
        const wrongMethod = test.modification.overrideMethod || HttpMethod.GET;
        return PYTEST_METHOD_NOT_ALLOWED_TEST
          .replace(/{endpoint_name}/g, endpointName)
          .replace(/{description}/g, test.description)
          .replace(/{method}/g, endpoint.method)
          .replace(/{wrong_method}/g, wrongMethod)
          .replace(/{wrong_method_lower}/g, wrongMethod.toLowerCase())
          .replace(/{path}/g, path);

      case UniversalTestCategory.SCOPE:
        return PYTEST_SCOPE_TEST
          .replace(/{endpoint_name}/g, endpointName)
          .replace(/{test_name}/g, this.sanitizeName(test.name))
          .replace(/{description}/g, test.description)
          .replace(/{method}/g, endpoint.method)
          .replace(/{method_lower}/g, endpoint.method.toLowerCase())
          .replace(/{path}/g, path)
          .replace(/{wrong_scope}/g, test.modification.wrongScope || 'wrong:scope');

      case UniversalTestCategory.PAGINATION:
        const queryParams = test.modification.queryParamOverride
          ? Object.entries(test.modification.queryParamOverride)
              .map(([k, v]) => `"${k}": "${v}"`)
              .join(', ')
          : '';
        return PYTEST_PAGINATION_TEST
          .replace(/{endpoint_name}/g, endpointName)
          .replace(/{test_name}/g, this.sanitizeName(test.name))
          .replace(/{description}/g, test.description)
          .replace(/{method}/g, endpoint.method)
          .replace(/{method_lower}/g, endpoint.method.toLowerCase())
          .replace(/{path}/g, path)
          .replace(/{query_params}/g, queryParams);

      case UniversalTestCategory.CONTENT_TYPE:
        const contentType = test.modification.overrideContentType || 'text/plain';
        const body = typeof test.modification.bodyOverride === 'string'
          ? `"${test.modification.bodyOverride}"`
          : JSON.stringify(test.modification.bodyOverride);
        return PYTEST_CONTENT_TYPE_TEST
          .replace(/{endpoint_name}/g, endpointName)
          .replace(/{test_name}/g, this.sanitizeName(test.name))
          .replace(/{description}/g, test.description)
          .replace(/{method}/g, endpoint.method)
          .replace(/{method_lower}/g, endpoint.method.toLowerCase())
          .replace(/{path}/g, path)
          .replace(/{content_type}/g, contentType)
          .replace(/{body}/g, body);

      default:
        // Generic validation test
        return `
@pytest.mark.validation
def test_${endpointName}_${this.sanitizeName(test.name)}():
    """
    ${test.description}
    Endpoint: ${endpoint.method} ${endpoint.path}
    """
    response = requests.${endpoint.method.toLowerCase()}(
        f"{BASE_URL}${path}",
        headers={"Content-Type": "application/json"},
        ${this.buildRequestArgs(test)}
    )
    assert response.status_code in [400, 404, 422], f"Got {response.status_code}"
`;
    }
  }

  /**
   * Builds path with parameter overrides.
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
   * Builds request arguments for universal tests.
   */
  private buildRequestArgs(test: UniversalTest): string {
    const args: string[] = [];

    if (test.modification.queryParamOverride) {
      const params = Object.entries(test.modification.queryParamOverride)
        .map(([k, v]) => `"${k}": "${v}"`)
        .join(', ');
      args.push(`params={${params}}`);
    }

    if (test.modification.bodyOverride) {
      const body = JSON.stringify(test.modification.bodyOverride);
      args.push(`json=${body}`);
    }

    return args.join(',\n        ') || 'timeout=10';
  }

  /**
   * Sanitizes name for Python function.
   */
  private sanitizeName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
  }

  private renderTest(endpointTest: EndpointTest, scenario: TestScenario): string {
    const { endpoint } = endpointTest;

    if (scenario.disabled) {
      return PYTEST_NEGATIVE_TEST
        .replace(/{testName}/g, scenario.name)
        .replace(/{displayName}/g, scenario.displayName)
        .replace(/{statusCode}/g, String(scenario.expected.statusCode))
        .replace(/{disabledReason}/g, scenario.disabledReason || 'TODO: Implement');
    }

    const arrange = this.buildArrange(endpoint, scenario);
    const request = this.buildRequest(endpoint, scenario);
    const assertions = this.buildAssertions(scenario);

    return PYTEST_TEST_FUNCTION
      .replace(/{testName}/g, scenario.name)
      .replace(/{displayName}/g, scenario.displayName)
      .replace(/{method}/g, endpoint.method)
      .replace(/{path}/g, endpoint.path)
      .replace(/{arrange}/g, arrange)
      .replace(/{request}/g, request)
      .replace(/{statusCode}/g, String(scenario.expected.statusCode))
      .replace(/{assertions}/g, assertions);
  }

  private buildArrange(
    endpoint: { path: string; pathParams: { name: string }[] },
    scenario: TestScenario
  ): string {
    const lines: string[] = [];

    // Path parameters
    if (scenario.request.pathParams) {
      for (const [name, value] of Object.entries(scenario.request.pathParams)) {
        lines.push(`    ${name} = "${value}"`);
      }
    }

    // Build path
    let pathExpr = `"${endpoint.path}"`;
    if (endpoint.pathParams.length > 0) {
      pathExpr = `f"${endpoint.path.replace(/\{(\w+)\}/g, '{$1}')}"`;
    }
    lines.push(`    path = ${pathExpr}`);

    // Request body
    if (scenario.request.body) {
      const bodyStr = JSON.stringify(scenario.request.body, null, 8)
        .replace(/: true([,\n\r\}])/g, ': True$1')
        .replace(/: false([,\n\r\}])/g, ': False$1')
        .replace(/: null([,\n\r\}])/g, ': None$1')
        .split('\n')
        .map((line, i) => i === 0 ? line : '    ' + line)
        .join('\n');
      lines.push(`    body = ${bodyStr}`);
    }

    return lines.join('\n');
  }

  private buildRequest(
    endpoint: { method: HttpMethod },
    scenario: TestScenario
  ): string {
    const method = endpoint.method.toLowerCase();
    const hasBody = scenario.request.body !== undefined;
    const hasQuery = scenario.request.queryParams && Object.keys(scenario.request.queryParams).length > 0;

    let call = `api_client.${method}(path`;
    if (hasBody) call += ', json=body';
    if (hasQuery) {
      const paramsStr = this.toPythonDict(scenario.request.queryParams);
      call += `, params=${paramsStr}`;
    }
    call += ')';

    return call;
  }

  private toPythonDict(obj: Record<string, unknown> | undefined): string {
    if (!obj) return '{}';
    const pairs = Object.entries(obj).map(([k, v]) => {
      const val = typeof v === 'string' ? `"${v}"` : String(v);
      return `"${k}": ${val}`;
    });
    return `{${pairs.join(', ')}}`;
  }

  private buildAssertions(scenario: TestScenario): string {
    const lines: string[] = [];

    // FIXED: Skip Content-Type check for 204/202 (no content)
    const noContentStatuses = [204, 202];
    if (scenario.expected.contentType && !noContentStatuses.includes(scenario.expected.statusCode)) {
      lines.push(`    assert response.headers.get("Content-Type", "").startswith("${scenario.expected.contentType}")`);
    }

    // No body assertions if no schema
    if (scenario.expected.assertions.length === 0) {
      lines.push('    # No response schema defined - only status code validated');
      return lines.join('\n');
    }

    // Parse response body
    lines.push('    data = response.json()');
    lines.push('');

    // FIXED: Track arrays for bounds checking
    const checkedArrays = new Set<string>();

    for (const assertion of scenario.expected.assertions) {
      // Array bounds check before first [0] access
      const arrayMatch = assertion.path.match(/^([^[]+)\[0\]/);
      if (arrayMatch) {
        const arrayPath = arrayMatch[1];
        if (!checkedArrays.has(arrayPath)) {
          checkedArrays.add(arrayPath);
          lines.push(`    ${this.matchers.arrayNotEmpty(arrayPath)}`);
        }
      }

      const assertCode = this.matchers.fromAssertion(assertion);
      lines.push(`    ${assertCode}`);
    }

    return lines.join('\n');
  }
}

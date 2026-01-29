/**
 * Universal Test Generator
 * Generates security and validation tests that apply to any API endpoint.
 */

import {
  EndpointInfo,
  UniversalTest,
  UniversalTestCategory,
  HttpMethod
} from './models';

// SQL Injection payloads
const SQL_INJECTION_PAYLOADS = [
  "' OR '1'='1",
  "1; DROP TABLE users--",
  "' UNION SELECT * FROM users--"
];

// XSS payloads
const XSS_PAYLOADS = [
  "<script>alert('xss')</script>",
  "javascript:alert(1)",
  "<img src=x onerror=alert(1)>"
];

// Invalid cursor payloads
const INVALID_CURSOR_PAYLOADS = [
  'invalid_cursor_abc123',
  '!!!NOT_A_CURSOR!!!',
  '../../../etc/passwd'
];

/**
 * Generates universal tests for an endpoint.
 */
export function generateUniversalTests(endpoint: EndpointInfo): UniversalTest[] {
  const tests: UniversalTest[] = [];

  // 1. Authentication tests
  if (endpoint.security && endpoint.security.length > 0) {
    tests.push(...generateAuthTests(endpoint));
    // 1b. OAuth2 Scope tests
    tests.push(...generateScopeTests(endpoint));
  }

  // 2. Path parameter validation
  if (endpoint.pathParams.length > 0) {
    tests.push(...generatePathParamTests(endpoint));
  }

  // 3. Query parameter validation
  if (endpoint.queryParams.length > 0) {
    tests.push(...generateQueryParamTests(endpoint));
    // 3b. Cursor pagination tests
    tests.push(...generateCursorPaginationTests(endpoint));
  }

  // 4. Request body validation
  if (endpoint.requestBodySchema && endpoint.requestBodySchema.length > 0) {
    tests.push(...generateBodyTests(endpoint));
  }

  // 5. Content-Type tests (for POST/PUT/PATCH)
  if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    tests.push(...generateContentTypeTests(endpoint));
  }

  // 6. Method not allowed test
  tests.push(generateMethodNotAllowedTest(endpoint));

  return tests;
}

/**
 * Authentication tests - 401/403 scenarios
 */
function generateAuthTests(endpoint: EndpointInfo): UniversalTest[] {
  const tests: UniversalTest[] = [];

  // Test: No authentication header
  tests.push({
    category: UniversalTestCategory.AUTH,
    name: 'no_auth_token',
    description: 'Request without authentication should return 401',
    modification: {
      removeAuth: true
    },
    expectedStatus: 401
  });

  // Test: Invalid authentication token
  tests.push({
    category: UniversalTestCategory.AUTH,
    name: 'invalid_auth_token',
    description: 'Request with invalid token should return 401',
    modification: {
      invalidAuth: 'Bearer invalid_token_12345'
    },
    expectedStatus: 401
  });

  // Test: Malformed authorization header
  tests.push({
    category: UniversalTestCategory.AUTH,
    name: 'malformed_auth_header',
    description: 'Request with malformed auth header should return 401',
    modification: {
      invalidAuth: 'NotBearer token'
    },
    expectedStatus: 401
  });

  return tests;
}

/**
 * Path parameter validation tests
 */
function generatePathParamTests(endpoint: EndpointInfo): UniversalTest[] {
  const tests: UniversalTest[] = [];

  for (const param of endpoint.pathParams) {
    // Test: Non-existent resource ID
    tests.push({
      category: UniversalTestCategory.VALIDATION,
      name: `path_${param.name}_not_found`,
      description: `Non-existent ${param.name} should return 404`,
      modification: {
        pathParamOverride: {
          [param.name]: 'non_existent_id_99999999'
        }
      },
      expectedStatus: 404
    });

    // Test: Invalid format (if numeric expected)
    if (param.schema.fieldType === 'integer' || param.schema.format === 'uuid') {
      tests.push({
        category: UniversalTestCategory.VALIDATION,
        name: `path_${param.name}_invalid_format`,
        description: `Invalid format for ${param.name} should return 400`,
        modification: {
          pathParamOverride: {
            [param.name]: 'not-a-valid-format!@#'
          }
        },
        expectedStatus: 400
      });
    }

    // Test: SQL Injection in path param
    tests.push({
      category: UniversalTestCategory.INJECTION,
      name: `path_${param.name}_sql_injection`,
      description: `SQL injection in ${param.name} should be rejected`,
      modification: {
        pathParamOverride: {
          [param.name]: SQL_INJECTION_PAYLOADS[0]
        }
      },
      expectedStatus: 400,
      expectedContains: undefined // May return 400 or 404, but not 200/500
    });
  }

  return tests;
}

/**
 * Query parameter validation tests
 */
function generateQueryParamTests(endpoint: EndpointInfo): UniversalTest[] {
  const tests: UniversalTest[] = [];

  // Find pagination params
  const limitParam = endpoint.queryParams.find(p =>
    ['limit', 'page_size', 'pageSize', 'per_page', 'perPage'].includes(p.name)
  );
  const offsetParam = endpoint.queryParams.find(p =>
    ['offset', 'page', 'skip'].includes(p.name)
  );

  // Test: Negative limit
  if (limitParam) {
    tests.push({
      category: UniversalTestCategory.PAGINATION,
      name: 'negative_limit',
      description: 'Negative limit should return 400',
      modification: {
        queryParamOverride: {
          [limitParam.name]: '-1'
        }
      },
      expectedStatus: 400
    });

    // Test: Extremely large limit
    tests.push({
      category: UniversalTestCategory.PAGINATION,
      name: 'excessive_limit',
      description: 'Excessively large limit should return 400 or be capped',
      modification: {
        queryParamOverride: {
          [limitParam.name]: '999999999'
        }
      },
      expectedStatus: 400 // Or could be 200 with capped value
    });
  }

  // Test: Negative offset
  if (offsetParam) {
    tests.push({
      category: UniversalTestCategory.PAGINATION,
      name: 'negative_offset',
      description: 'Negative offset should return 400',
      modification: {
        queryParamOverride: {
          [offsetParam.name]: '-1'
        }
      },
      expectedStatus: 400
    });
  }

  // Test: XSS in query params (for string params)
  const stringParams = endpoint.queryParams.filter(p =>
    p.schema.fieldType === 'string' && !p.schema.enumValues
  );

  if (stringParams.length > 0) {
    const param = stringParams[0];
    tests.push({
      category: UniversalTestCategory.INJECTION,
      name: `query_${param.name}_xss`,
      description: `XSS payload in ${param.name} should be sanitized`,
      modification: {
        queryParamOverride: {
          [param.name]: XSS_PAYLOADS[0]
        }
      },
      expectedStatus: 400
    });
  }

  return tests;
}

/**
 * Request body validation tests
 */
function generateBodyTests(endpoint: EndpointInfo): UniversalTest[] {
  const tests: UniversalTest[] = [];

  // Only for POST/PUT/PATCH
  if (!['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    return tests;
  }

  // Test: Empty body when required
  if (endpoint.requestBodyRequired) {
    tests.push({
      category: UniversalTestCategory.VALIDATION,
      name: 'empty_request_body',
      description: 'Empty request body should return 400',
      modification: {
        bodyOverride: {}
      },
      expectedStatus: 400
    });

    // Test: Invalid JSON
    tests.push({
      category: UniversalTestCategory.VALIDATION,
      name: 'invalid_json_body',
      description: 'Invalid JSON should return 400',
      modification: {
        bodyOverride: '{invalid json}' as unknown
      },
      expectedStatus: 400
    });
  }

  // Test: Missing required fields
  const requiredFields = endpoint.requestBodySchema?.filter(f => f.required) || [];
  if (requiredFields.length > 0) {
    // Create body with first required field missing
    const field = requiredFields[0];
    tests.push({
      category: UniversalTestCategory.VALIDATION,
      name: `missing_required_${field.name}`,
      description: `Missing required field '${field.name}' should return 400`,
      modification: {
        bodyOverride: { _missing_field: field.name }
      },
      expectedStatus: 400
    });
  }

  // Test: Wrong type for fields
  const stringFields = endpoint.requestBodySchema?.filter(f => f.fieldType === 'string') || [];
  if (stringFields.length > 0) {
    const field = stringFields[0];
    tests.push({
      category: UniversalTestCategory.VALIDATION,
      name: `wrong_type_${field.name}`,
      description: `Wrong type for '${field.name}' should return 400`,
      modification: {
        bodyOverride: { [field.name]: 12345 } // number instead of string
      },
      expectedStatus: 400
    });
  }

  // Test: SQL injection in body fields
  if (stringFields.length > 0) {
    const field = stringFields[0];
    tests.push({
      category: UniversalTestCategory.INJECTION,
      name: `body_${field.name}_sql_injection`,
      description: `SQL injection in '${field.name}' should be rejected`,
      modification: {
        bodyOverride: { [field.name]: SQL_INJECTION_PAYLOADS[0] }
      },
      expectedStatus: 400
    });
  }

  return tests;
}

/**
 * OAuth2 Scope mismatch tests - 403 scenarios
 */
function generateScopeTests(endpoint: EndpointInfo): UniversalTest[] {
  const tests: UniversalTest[] = [];

  // Check if endpoint has OAuth2 security
  const oauth2Security = endpoint.security?.find(s => s.type === 'oauth2');
  if (!oauth2Security) {
    return tests;
  }

  // Test: Wrong scope (should return 403)
  tests.push({
    category: UniversalTestCategory.SCOPE,
    name: 'wrong_oauth_scope',
    description: 'Request with wrong OAuth2 scope should return 403',
    modification: {
      wrongScope: 'wrong:scope:value'
    },
    expectedStatus: 403
  });

  // Test: Insufficient scope
  tests.push({
    category: UniversalTestCategory.SCOPE,
    name: 'insufficient_scope',
    description: 'Request with insufficient scope should return 403',
    modification: {
      wrongScope: 'read:only'
    },
    expectedStatus: 403
  });

  return tests;
}

/**
 * Cursor-based pagination tests
 */
function generateCursorPaginationTests(endpoint: EndpointInfo): UniversalTest[] {
  const tests: UniversalTest[] = [];

  // Find cursor param
  const cursorParam = endpoint.queryParams.find(p =>
    ['cursor', 'next_cursor', 'page_token', 'pageToken', 'after', 'before'].includes(p.name)
  );

  if (!cursorParam) {
    return tests;
  }

  // Test: Invalid cursor format
  tests.push({
    category: UniversalTestCategory.PAGINATION,
    name: 'invalid_cursor_format',
    description: 'Invalid cursor format should return 400',
    modification: {
      queryParamOverride: {
        [cursorParam.name]: INVALID_CURSOR_PAYLOADS[0]
      }
    },
    expectedStatus: 400
  });

  // Test: Malformed cursor (path traversal attempt)
  tests.push({
    category: UniversalTestCategory.PAGINATION,
    name: 'malformed_cursor_path_traversal',
    description: 'Path traversal in cursor should return 400',
    modification: {
      queryParamOverride: {
        [cursorParam.name]: INVALID_CURSOR_PAYLOADS[2]
      }
    },
    expectedStatus: 400
  });

  // Test: Empty cursor
  tests.push({
    category: UniversalTestCategory.PAGINATION,
    name: 'empty_cursor',
    description: 'Empty cursor should return 400 or be ignored',
    modification: {
      queryParamOverride: {
        [cursorParam.name]: ''
      }
    },
    expectedStatus: 400
  });

  return tests;
}

/**
 * Content-Type tests - 415 Unsupported Media Type
 */
function generateContentTypeTests(endpoint: EndpointInfo): UniversalTest[] {
  const tests: UniversalTest[] = [];

  // Test: Wrong content type (XML instead of JSON)
  tests.push({
    category: UniversalTestCategory.CONTENT_TYPE,
    name: 'wrong_content_type_xml',
    description: 'XML content type should return 415',
    modification: {
      overrideContentType: 'application/xml',
      bodyOverride: '<xml>not json</xml>'
    },
    expectedStatus: 415
  });

  // Test: Plain text content type
  tests.push({
    category: UniversalTestCategory.CONTENT_TYPE,
    name: 'wrong_content_type_text',
    description: 'Plain text content type should return 415',
    modification: {
      overrideContentType: 'text/plain',
      bodyOverride: 'plain text body'
    },
    expectedStatus: 415
  });

  // Test: Missing content type (for endpoints that require body)
  if (endpoint.requestBodyRequired) {
    tests.push({
      category: UniversalTestCategory.CONTENT_TYPE,
      name: 'missing_content_type',
      description: 'Missing content type header should return 415 or 400',
      modification: {
        overrideContentType: '',
        bodyOverride: '{}'
      },
      expectedStatus: 415
    });
  }

  // Check if endpoint supports form-data (from consumes)
  const supportsFormData = endpoint.consumes?.includes('application/x-www-form-urlencoded');
  const supportsJson = !endpoint.consumes || endpoint.consumes.includes('application/json');

  // Test: JSON when only form-data expected
  if (supportsFormData && !supportsJson) {
    tests.push({
      category: UniversalTestCategory.CONTENT_TYPE,
      name: 'json_when_form_expected',
      description: 'JSON content when form-data expected should return 415',
      modification: {
        overrideContentType: 'application/json',
        bodyOverride: { test: 'value' }
      },
      expectedStatus: 415
    });
  }

  // Test: Form-data when only JSON expected
  if (supportsJson && !supportsFormData) {
    tests.push({
      category: UniversalTestCategory.CONTENT_TYPE,
      name: 'form_when_json_expected',
      description: 'Form-data content when JSON expected should return 415',
      modification: {
        overrideContentType: 'application/x-www-form-urlencoded',
        useFormData: true,
        bodyOverride: 'key=value'
      },
      expectedStatus: 415
    });
  }

  return tests;
}

/**
 * Method not allowed test
 */
function generateMethodNotAllowedTest(endpoint: EndpointInfo): UniversalTest {
  // Pick a method that's NOT the endpoint's method
  const otherMethods: HttpMethod[] = [
    HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE
  ].filter(m => m !== endpoint.method);

  // For GET endpoints, try DELETE; for others, try GET
  const testMethod = endpoint.method === HttpMethod.GET
    ? HttpMethod.DELETE
    : HttpMethod.GET;

  return {
    category: UniversalTestCategory.METHOD,
    name: 'method_not_allowed',
    description: `${testMethod} on ${endpoint.method}-only endpoint should return 405`,
    modification: {
      overrideMethod: testMethod
    },
    expectedStatus: 405
  };
}

/**
 * Groups tests by category for reporting
 */
export function groupTestsByCategory(tests: UniversalTest[]): Map<UniversalTestCategory, UniversalTest[]> {
  const grouped = new Map<UniversalTestCategory, UniversalTest[]>();

  for (const test of tests) {
    if (!grouped.has(test.category)) {
      grouped.set(test.category, []);
    }
    grouped.get(test.category)!.push(test);
  }

  return grouped;
}

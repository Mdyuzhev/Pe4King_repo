/**
 * Pre-defined test snippets library (like Postman Snippets).
 */

import { TestSnippet, TestSnippetType } from './models';

/**
 * Snippet definition with display info
 */
export interface SnippetDefinition {
  type: TestSnippetType;
  name: string;
  description: string;
  icon: string;  // VS Code codicon
  defaultConfig: Partial<TestSnippet>;
}

/**
 * Available snippets organized by category
 */
export const SNIPPET_LIBRARY: Record<string, SnippetDefinition[]> = {
  'Status': [
    {
      type: 'status',
      name: 'Status is 200',
      description: 'Response status code equals 200',
      icon: 'check',
      defaultConfig: { expected: 200 }
    },
    {
      type: 'status',
      name: 'Status is 201',
      description: 'Response status code equals 201 (Created)',
      icon: 'check',
      defaultConfig: { expected: 201 }
    },
    {
      type: 'status',
      name: 'Status is 204',
      description: 'Response status code equals 204 (No Content)',
      icon: 'check',
      defaultConfig: { expected: 204 }
    },
    {
      type: 'statusFamily',
      name: 'Status is 2xx',
      description: 'Response status code is successful (200-299)',
      icon: 'check-all',
      defaultConfig: { expected: '2xx' }
    },
    {
      type: 'status',
      name: 'Status is 400',
      description: 'Response status code equals 400 (Bad Request)',
      icon: 'error',
      defaultConfig: { expected: 400 }
    },
    {
      type: 'status',
      name: 'Status is 401',
      description: 'Response status code equals 401 (Unauthorized)',
      icon: 'lock',
      defaultConfig: { expected: 401 }
    },
    {
      type: 'status',
      name: 'Status is 404',
      description: 'Response status code equals 404 (Not Found)',
      icon: 'search',
      defaultConfig: { expected: 404 }
    }
  ],

  'Body': [
    {
      type: 'notEmpty',
      name: 'Body is not empty',
      description: 'Response body exists and is not empty',
      icon: 'file',
      defaultConfig: {}
    },
    {
      type: 'hasJsonBody',
      name: 'Body is JSON',
      description: 'Response has application/json content type',
      icon: 'json',
      defaultConfig: {}
    },
    {
      type: 'hasField',
      name: 'Body has field',
      description: 'Response body contains specific field',
      icon: 'symbol-field',
      defaultConfig: { field: 'id' }
    },
    {
      type: 'fieldNotNull',
      name: 'Field is not null',
      description: 'Specific field exists and is not null',
      icon: 'symbol-key',
      defaultConfig: { field: 'id' }
    },
    {
      type: 'fieldEquals',
      name: 'Field equals value',
      description: 'Specific field equals expected value',
      icon: 'symbol-constant',
      defaultConfig: { field: 'status', expected: 'active' }
    }
  ],

  'Performance': [
    {
      type: 'responseTime',
      name: 'Response time < 200ms',
      description: 'Response received within 200 milliseconds',
      icon: 'dashboard',
      defaultConfig: { maxMs: 200 }
    },
    {
      type: 'responseTime',
      name: 'Response time < 500ms',
      description: 'Response received within 500 milliseconds',
      icon: 'dashboard',
      defaultConfig: { maxMs: 500 }
    },
    {
      type: 'responseTime',
      name: 'Response time < 1s',
      description: 'Response received within 1 second',
      icon: 'dashboard',
      defaultConfig: { maxMs: 1000 }
    }
  ],

  'Headers': [
    {
      type: 'headerExists',
      name: 'Has Content-Type',
      description: 'Response has Content-Type header',
      icon: 'list-flat',
      defaultConfig: { header: 'Content-Type' }
    },
    {
      type: 'headerExists',
      name: 'Has Authorization',
      description: 'Response has Authorization header',
      icon: 'key',
      defaultConfig: { header: 'Authorization' }
    },
    {
      type: 'headerEquals',
      name: 'Content-Type is JSON',
      description: 'Content-Type header equals application/json',
      icon: 'json',
      defaultConfig: { header: 'Content-Type', expected: 'application/json' }
    }
  ],

  'JSONPath': [
    {
      type: 'arrayLength',
      name: 'Array length equals',
      description: 'Check array has exact length',
      icon: 'symbol-array',
      defaultConfig: { field: '$.items', expected: 10, operator: '==' }
    },
    {
      type: 'arrayLength',
      name: 'Array not empty',
      description: 'Check array has items',
      icon: 'symbol-array',
      defaultConfig: { field: '$.items', expected: 0, operator: '>' }
    },
    {
      type: 'allMatch',
      name: 'All items match',
      description: 'All array items satisfy condition',
      icon: 'check-all',
      defaultConfig: { field: '$.items[*]', condition: 'active == true' }
    },
    {
      type: 'anyMatch',
      name: 'Any item matches',
      description: 'At least one item satisfies condition',
      icon: 'pass',
      defaultConfig: { field: '$.items[*]', condition: 'priority == "high"' }
    },
    {
      type: 'hasField',
      name: 'Has nested field (JSONPath)',
      description: 'Check field exists using JSONPath',
      icon: 'symbol-field',
      defaultConfig: { field: '$.data.users[0].email' }
    }
  ],

  'Custom': [
    {
      type: 'custom',
      name: 'Array not empty',
      description: 'Check that array has items',
      icon: 'symbol-array',
      defaultConfig: {
        expression: 'response.body.items.length > 0',
        description: 'Items array is not empty'
      }
    },
    {
      type: 'custom',
      name: 'All items valid',
      description: 'Check all items pass validation',
      icon: 'check-all',
      defaultConfig: {
        expression: 'all(response.body.items, i => i.valid)',
        description: 'All items are valid'
      }
    },
    {
      type: 'custom',
      name: 'Custom expression...',
      description: 'Write your own JS expression',
      icon: 'code',
      defaultConfig: {
        expression: '',
        description: ''
      }
    }
  ]
};

/**
 * Get all snippets as flat list
 */
export function getAllSnippets(): SnippetDefinition[] {
  return Object.values(SNIPPET_LIBRARY).flat();
}

/**
 * Create TestSnippet from definition
 */
export function createSnippetFromDefinition(def: SnippetDefinition): TestSnippet {
  return {
    type: def.type,
    enabled: true,
    ...def.defaultConfig
  };
}

/**
 * Convert snippet to Python test code
 */
export function snippetToPython(snippet: TestSnippet): string {
  switch (snippet.type) {
    case 'status':
      return `test(response['status'] == ${snippet.expected}, 'Status should be ${snippet.expected}')`;

    case 'statusFamily': {
      const family = snippet.expected as string;
      const start = family.charAt(0);
      return `test(str(response['status']).startswith('${start}'), 'Status should be ${family}')`;
    }

    case 'notEmpty':
      return `test(response['body'], 'Body should not be empty')`;

    case 'hasJsonBody':
      return `test('application/json' in response['headers'].get('content-type', ''), 'Should be JSON')`;

    case 'hasField':
      return `test('${snippet.field}' in response['body'], 'Should have field "${snippet.field}"')`;

    case 'fieldNotNull':
      return `test(response['body'].get('${snippet.field}') is not None, '"${snippet.field}" should not be null')`;

    case 'fieldEquals': {
      const val = typeof snippet.expected === 'string' ? `'${snippet.expected}'` : snippet.expected;
      const expectedStr = typeof snippet.expected === 'string' ? snippet.expected : String(snippet.expected);
      return `test(response['body'].get('${snippet.field}') == ${val}, "${snippet.field} should equal ${expectedStr}")`;
    }

    case 'responseTime':
      return `test(response['time_ms'] < ${snippet.maxMs}, 'Response time should be < ${snippet.maxMs}ms')`;

    case 'headerExists':
      return `test('${snippet.header?.toLowerCase()}' in response['headers'], 'Should have header "${snippet.header}"')`;

    case 'headerEquals':
      return `test(response['headers'].get('${snippet.header?.toLowerCase()}') == '${snippet.expected}', '"${snippet.header}" should equal "${snippet.expected}"')`;

    case 'arrayLength': {
      const op = snippet.operator || '==';
      return `test(len(response['body'].get('${snippet.field}', [])) ${op} ${snippet.expected}, 'Array length check')`;
    }

    case 'custom': {
      const desc = (snippet.description || 'Custom assertion').replace(/"/g, '\\"');
      return snippet.expression
        ? `# ${snippet.description || 'Custom test'}\ntest(${snippet.expression}, "${desc}")`
        : `# Custom test\ntest(True, "Add your assertion here")`;
    }

    default:
      return `# ${snippet.type}\ntest(True, '${snippet.type}')`;
  }
}

/**
 * Get display name for a test snippet
 */
export function getSnippetDisplayName(snippet: TestSnippet): string {
  switch (snippet.type) {
    case 'status': return `Status = ${snippet.expected}`;
    case 'statusFamily': return `Status is ${snippet.expected}`;
    case 'notEmpty': return 'Body not empty';
    case 'hasJsonBody': return 'Body is JSON';
    case 'hasField': return `Has field "${snippet.field}"`;
    case 'fieldNotNull': return `"${snippet.field}" not null`;
    case 'fieldEquals': return `"${snippet.field}" = ${snippet.expected}`;
    case 'responseTime': return `Time < ${snippet.maxMs}ms`;
    case 'headerExists': return `Has header "${snippet.header}"`;
    case 'headerEquals': return `"${snippet.header}" = ${snippet.expected}`;
    case 'custom': return snippet.description || snippet.expression?.substring(0, 30) + '...' || 'Custom';
    case 'arrayLength': return `len(${snippet.field}) ${snippet.operator || '=='} ${snippet.expected}`;
    case 'allMatch': return `all(${snippet.field}) match ${snippet.condition}`;
    case 'anyMatch': return `any(${snippet.field}) match ${snippet.condition}`;
    default: return snippet.type;
  }
}

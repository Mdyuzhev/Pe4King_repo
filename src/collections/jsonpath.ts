/**
 * Lightweight JSONPath implementation for Collections
 *
 * Supported syntax:
 * - $.field           — root field
 * - $.parent.child    — nested field
 * - $.items[0]        — array index
 * - $.items[*]        — all array items
 * - $.items[-1]       — last item
 * - $..field          — recursive descent (find all)
 * - $.items[?(@.x)]   — filter expression
 * - $.items[0:3]      — slice
 */

export type JSONPathResult = unknown[];

/**
 * Query JSON object with JSONPath expression
 */
export function jsonPath(obj: unknown, path: string): JSONPathResult {
  if (!path.startsWith('$')) {
    throw new Error('JSONPath must start with $');
  }

  // Remove $ prefix
  const normalizedPath = path.substring(1);

  if (normalizedPath === '' || normalizedPath === '.') {
    return [obj];
  }

  return evaluate(obj, normalizedPath);
}

/**
 * Get first result or undefined
 */
export function jsonPathFirst(obj: unknown, path: string): unknown {
  const results = jsonPath(obj, path);
  return results[0];
}

/**
 * Check if path matches anything
 */
export function jsonPathExists(obj: unknown, path: string): boolean {
  const results = jsonPath(obj, path);
  return results.length > 0;
}

// Internal evaluation
function evaluate(obj: unknown, path: string): unknown[] {
  if (!path || path === '.') {
    return obj !== undefined ? [obj] : [];
  }

  // Handle recursive descent: ..field
  if (path.startsWith('..')) {
    const remaining = path.substring(2);
    const fieldMatch = remaining.match(/^(\w+)(.*)/);
    if (fieldMatch) {
      const [, field, rest] = fieldMatch;
      return recursiveFind(obj, field, rest);
    }
  }

  // Handle dot notation: .field
  if (path.startsWith('.')) {
    const remaining = path.substring(1);
    return evaluateSegment(obj, remaining);
  }

  return evaluateSegment(obj, path);
}

function evaluateSegment(obj: unknown, path: string): unknown[] {
  if (obj === null || obj === undefined) {
    return [];
  }

  // Parse first segment
  const { segment, rest } = parseNextSegment(path);

  // Handle array access: [0], [*], [-1], [0:3], [?(@.x)]
  if (segment.startsWith('[')) {
    return evaluateArrayAccess(obj, segment, rest);
  }

  // Handle field access
  if (typeof obj !== 'object') {
    return [];
  }

  const value = (obj as Record<string, unknown>)[segment];

  if (rest) {
    return evaluate(value, rest);
  }

  return value !== undefined ? [value] : [];
}

function parseNextSegment(path: string): { segment: string; rest: string } {
  // Handle bracket notation at start
  if (path.startsWith('[')) {
    const closeIndex = findMatchingBracket(path);
    return {
      segment: path.substring(0, closeIndex + 1),
      rest: path.substring(closeIndex + 1)
    };
  }

  // Handle dot notation
  const match = path.match(/^(\w+)([\.\[].*)?$/);
  if (match) {
    return {
      segment: match[1],
      rest: match[2] || ''
    };
  }

  return { segment: path, rest: '' };
}

function findMatchingBracket(str: string): number {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '[') depth++;
    if (str[i] === ']') depth--;
    if (depth === 0) return i;
  }
  return str.length - 1;
}

function evaluateArrayAccess(obj: unknown, bracket: string, rest: string): unknown[] {
  const inner = bracket.substring(1, bracket.length - 1);

  // Wildcard: [*]
  if (inner === '*') {
    if (!Array.isArray(obj)) return [];
    const results: unknown[] = [];
    for (const item of obj) {
      if (rest) {
        results.push(...evaluate(item, rest));
      } else {
        results.push(item);
      }
    }
    return results;
  }

  // Numeric index: [0], [-1]
  const indexMatch = inner.match(/^(-?\d+)$/);
  if (indexMatch) {
    if (!Array.isArray(obj)) return [];
    let index = parseInt(indexMatch[1], 10);
    if (index < 0) index = obj.length + index;
    const value = obj[index];
    if (rest) return evaluate(value, rest);
    return value !== undefined ? [value] : [];
  }

  // Slice: [0:3], [:3], [2:]
  const sliceMatch = inner.match(/^(-?\d*):(-?\d*)$/);
  if (sliceMatch) {
    if (!Array.isArray(obj)) return [];
    let start = sliceMatch[1] ? parseInt(sliceMatch[1], 10) : 0;
    let end = sliceMatch[2] ? parseInt(sliceMatch[2], 10) : obj.length;
    if (start < 0) start = obj.length + start;
    if (end < 0) end = obj.length + end;

    const results: unknown[] = [];
    for (let i = start; i < end && i < obj.length; i++) {
      if (rest) {
        results.push(...evaluate(obj[i], rest));
      } else {
        results.push(obj[i]);
      }
    }
    return results;
  }

  // Filter: [?(@.active)]
  const filterMatch = inner.match(/^\?\((.+)\)$/);
  if (filterMatch) {
    if (!Array.isArray(obj)) return [];
    const filterExpr = filterMatch[1];
    const results: unknown[] = [];

    for (const item of obj) {
      if (evaluateFilter(item, filterExpr)) {
        if (rest) {
          results.push(...evaluate(item, rest));
        } else {
          results.push(item);
        }
      }
    }
    return results;
  }

  // Property access on object: ['field-name']
  const propMatch = inner.match(/^['"](.+)['"]$/);
  if (propMatch) {
    if (typeof obj !== 'object' || obj === null) return [];
    const value = (obj as Record<string, unknown>)[propMatch[1]];
    if (rest) return evaluate(value, rest);
    return value !== undefined ? [value] : [];
  }

  return [];
}

function evaluateFilter(item: unknown, filterExpr: string): boolean {
  if (typeof item !== 'object' || item === null) return false;

  // Simple comparison: @.field == value
  const compMatch = filterExpr.match(/^@\.(\w+(?:\.\w+)*)\s*(===?|!==?|>=?|<=?)\s*(.+)$/);
  if (compMatch) {
    const [, fieldPath, op, expectedStr] = compMatch;
    const actual = getNestedField(item, fieldPath);
    const expected = parseValue(expectedStr.trim());
    return compare(actual, op, expected);
  }

  // Existence check: @.field
  const existMatch = filterExpr.match(/^@\.(\w+(?:\.\w+)*)$/);
  if (existMatch) {
    const value = getNestedField(item, existMatch[1]);
    return value !== undefined && value !== null;
  }

  return false;
}

function getNestedField(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function parseValue(str: string): unknown {
  // Boolean
  if (str === 'true') return true;
  if (str === 'false') return false;
  if (str === 'null') return null;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    return parseFloat(str);
  }

  // String (quoted)
  const strMatch = str.match(/^['"](.*)['"]$/);
  if (strMatch) return strMatch[1];

  return str;
}

function compare(actual: unknown, op: string, expected: unknown): boolean {
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

function recursiveFind(obj: unknown, field: string, rest: string): unknown[] {
  const results: unknown[] = [];

  function traverse(current: unknown) {
    if (current === null || current === undefined) return;

    if (typeof current === 'object') {
      if (Array.isArray(current)) {
        for (const item of current) {
          traverse(item);
        }
      } else {
        const record = current as Record<string, unknown>;
        if (field in record) {
          if (rest) {
            results.push(...evaluate(record[field], rest));
          } else {
            results.push(record[field]);
          }
        }
        for (const value of Object.values(record)) {
          traverse(value);
        }
      }
    }
  }

  traverse(obj);
  return results;
}

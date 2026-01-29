/**
 * Variable extraction and resolution for Collections
 */

import { Variable, VariableExtraction, VariableStore, SavedRequest } from './models';

/**
 * Create empty variable store
 */
export function createVariableStore(): VariableStore {
  return {
    collection: new Map(),
    folders: new Map(),
    lastValues: {}
  };
}

/**
 * Extract variables from response based on extraction rules
 */
export function extractVariables(
  response: { body: unknown; headers: Record<string, string>; status: number },
  extractions: VariableExtraction[],
  requestId: string
): Variable[] {
  const variables: Variable[] = [];

  for (const extraction of extractions) {
    try {
      const value = extractValue(response, extraction.path);

      if (value !== undefined) {
        variables.push({
          name: extraction.name,
          value,
          source: requestId
        });
      }
    } catch (error) {
      console.warn(`[Variables] Failed to extract ${extraction.name}: ${error}`);
    }
  }

  return variables;
}

/**
 * Extract value from response using path
 * Supports:
 * - Simple paths: "id", "user.name", "items[0].id"
 * - JSONPath: "$.id", "$..name", "$.items[*].id"
 * - Special: "$status" (response status), "$header.Content-Type"
 */
function extractValue(
  response: { body: unknown; headers: Record<string, string>; status: number },
  path: string
): unknown {
  // Special paths
  if (path === '$status') {
    return response.status;
  }

  if (path.startsWith('$header.')) {
    const headerName = path.substring(8);
    return response.headers[headerName] || response.headers[headerName.toLowerCase()];
  }

  // Remove JSONPath prefix if present
  let normalizedPath = path;
  if (path.startsWith('$.')) {
    normalizedPath = path.substring(2);
  } else if (path.startsWith('$')) {
    normalizedPath = path.substring(1);
  }

  return getNestedValue(response.body, normalizedPath);
}

/**
 * Get nested value from object by path
 * Supports: "user.name", "items[0].id", "data.users[2].email"
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  if (!path) return obj;

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
 * Store extracted variables in the store
 */
export function storeVariables(
  store: VariableStore,
  variables: Variable[],
  scope: 'collection' | 'folder',
  folderId?: string
): void {
  for (const variable of variables) {
    if (scope === 'collection') {
      store.collection.set(variable.name, variable);
    } else if (scope === 'folder' && folderId) {
      if (!store.folders.has(folderId)) {
        store.folders.set(folderId, new Map());
      }
      store.folders.get(folderId)!.set(variable.name, variable);
    }

    // Always update lastValues for UI
    store.lastValues[variable.name] = variable.value;
  }
}

/**
 * Get variable value from store (checks folder first, then collection)
 */
export function getVariable(
  store: VariableStore,
  name: string,
  folderId?: string
): unknown {
  // Check folder scope first
  if (folderId && store.folders.has(folderId)) {
    const folderVar = store.folders.get(folderId)!.get(name);
    if (folderVar) return folderVar.value;
  }

  // Then collection scope
  const collectionVar = store.collection.get(name);
  if (collectionVar) return collectionVar.value;

  return undefined;
}

// ========== Variable Resolution ==========

/**
 * Pattern for variable references: {{variableName}}
 */
const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Resolve all variables in a string
 * "GET /users/{{userId}}" → "GET /users/123"
 */
export function resolveString(
  template: string,
  store: VariableStore,
  folderId?: string,
  initialVars?: Record<string, string>
): string {
  return template.replace(VARIABLE_PATTERN, (match, varName) => {
    // Check initial variables first (like environment)
    if (initialVars && varName in initialVars) {
      return String(initialVars[varName]);
    }

    // Then check store
    const value = getVariable(store, varName, folderId);
    if (value !== undefined) {
      return String(value);
    }

    // Keep original if not found
    console.warn(`[Variables] Unresolved variable: ${varName}`);
    return match;
  });
}

/**
 * Resolve variables in headers object
 */
export function resolveHeaders(
  headers: Record<string, string>,
  store: VariableStore,
  folderId?: string,
  initialVars?: Record<string, string>
): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = resolveString(value, store, folderId, initialVars);
  }

  return resolved;
}

/**
 * Resolve variables in body (recursively for objects)
 */
export function resolveBody(
  body: unknown,
  store: VariableStore,
  folderId?: string,
  initialVars?: Record<string, string>
): unknown {
  if (body === null || body === undefined) {
    return body;
  }

  if (typeof body === 'string') {
    return resolveString(body, store, folderId, initialVars);
  }

  if (Array.isArray(body)) {
    return body.map(item => resolveBody(item, store, folderId, initialVars));
  }

  if (typeof body === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      resolved[key] = resolveBody(value, store, folderId, initialVars);
    }
    return resolved;
  }

  return body;
}

/**
 * Resolve all variables in a SavedRequest
 * Returns new request object with resolved values
 */
export function resolveRequest(
  request: SavedRequest,
  store: VariableStore,
  folderId?: string,
  initialVars?: Record<string, string>
): SavedRequest {
  return {
    ...request,
    url: resolveString(request.url, store, folderId, initialVars),
    headers: resolveHeaders(request.headers, store, folderId, initialVars),
    body: request.body ? resolveString(request.body, store, folderId, initialVars) : undefined
  };
}

/**
 * Find all variable references in a string
 * Returns array of variable names
 */
export function findVariables(text: string): string[] {
  const matches = text.matchAll(VARIABLE_PATTERN);
  return [...matches].map(m => m[1]);
}

/**
 * Check if string contains unresolved variables
 */
export function hasUnresolvedVariables(
  text: string,
  store: VariableStore,
  folderId?: string,
  initialVars?: Record<string, string>
): boolean {
  const vars = findVariables(text);

  for (const varName of vars) {
    if (initialVars && varName in initialVars) continue;
    if (getVariable(store, varName, folderId) !== undefined) continue;
    return true;
  }

  return false;
}

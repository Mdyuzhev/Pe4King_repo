/**
 * Resolves $ref references in OpenAPI specifications.
 * Handles both local (#/components/schemas/...) and nested refs.
 */

export class RefResolver {
  private spec: Record<string, unknown>;
  private cache: Map<string, unknown> = new Map();
  private resolving: Set<string> = new Set(); // Circular ref detection

  constructor(spec: Record<string, unknown>) {
    this.spec = spec;
  }

  /**
   * Resolves a schema, following $ref if present.
   */
  resolve(schema: unknown): unknown {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    const schemaObj = schema as Record<string, unknown>;

    // If no $ref, return as-is (but resolve nested refs)
    if (!('$ref' in schemaObj)) {
      return this.resolveNested(schemaObj);
    }

    const ref = schemaObj['$ref'] as string;

    // Check cache
    if (this.cache.has(ref)) {
      return this.cache.get(ref);
    }

    // Circular reference detection
    if (this.resolving.has(ref)) {
      console.warn(`Circular reference detected: ${ref}`);
      return { type: 'object', description: `Circular ref: ${ref}` };
    }

    this.resolving.add(ref);

    try {
      const resolved = this.resolveRef(ref);
      const fullyResolved = this.resolve(resolved); // Recursive resolve
      this.cache.set(ref, fullyResolved);
      return fullyResolved;
    } finally {
      this.resolving.delete(ref);
    }
  }

  /**
   * Resolves a $ref string to the actual schema.
   */
  private resolveRef(ref: string): unknown {
    // Only support local refs for now
    if (!ref.startsWith('#/')) {
      console.warn(`External refs not supported: ${ref}`);
      return { type: 'object' };
    }

    // Parse path: #/components/schemas/User -> ['components', 'schemas', 'User']
    const path = ref.slice(2).split('/');

    let current: unknown = this.spec;
    for (const segment of path) {
      if (!current || typeof current !== 'object') {
        console.warn(`Cannot resolve ref: ${ref}`);
        return { type: 'object' };
      }
      current = (current as Record<string, unknown>)[segment];
    }

    if (!current) {
      console.warn(`Ref not found: ${ref}`);
      return { type: 'object' };
    }

    return current;
  }

  /**
   * Recursively resolves nested schemas (properties, items, allOf, etc.)
   */
  private resolveNested(schema: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...schema };

    // Resolve properties
    if (result.properties && typeof result.properties === 'object') {
      const props = result.properties as Record<string, unknown>;
      const resolvedProps: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) {
        resolvedProps[key] = this.resolve(value);
      }
      result.properties = resolvedProps;
    }

    // Resolve items (for arrays)
    if (result.items) {
      result.items = this.resolve(result.items);
    }

    // Resolve allOf
    if (Array.isArray(result.allOf)) {
      const merged = this.mergeAllOf(result.allOf as unknown[]);
      delete result.allOf;
      Object.assign(result, merged);
    }

    // Resolve oneOf/anyOf (take first option)
    if (Array.isArray(result.oneOf) && result.oneOf.length > 0) {
      const first = this.resolve(result.oneOf[0]);
      delete result.oneOf;
      Object.assign(result, first);
    }
    if (Array.isArray(result.anyOf) && result.anyOf.length > 0) {
      const first = this.resolve(result.anyOf[0]);
      delete result.anyOf;
      Object.assign(result, first);
    }

    // Resolve additionalProperties
    if (result.additionalProperties && typeof result.additionalProperties === 'object') {
      result.additionalProperties = this.resolve(result.additionalProperties);
    }

    return result;
  }

  /**
   * Merges allOf schemas into a single schema.
   */
  private mergeAllOf(schemas: unknown[]): Record<string, unknown> {
    const merged: Record<string, unknown> = {
      type: 'object',
      properties: {},
      required: [] as string[]
    };

    for (const schema of schemas) {
      const resolved = this.resolve(schema) as Record<string, unknown>;

      // Merge properties
      if (resolved.properties) {
        Object.assign(
          merged.properties as Record<string, unknown>,
          resolved.properties
        );
      }

      // Merge required
      if (Array.isArray(resolved.required)) {
        (merged.required as string[]).push(...resolved.required);
      }

      // Copy other fields (type, description, etc.)
      for (const [key, value] of Object.entries(resolved)) {
        if (key !== 'properties' && key !== 'required' && value !== undefined) {
          merged[key] = value;
        }
      }
    }

    // Dedupe required
    merged.required = [...new Set(merged.required as string[])];

    return merged;
  }
}

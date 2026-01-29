/**
 * Visits OpenAPI schema and extracts fields for assertion generation.
 * Implements Visitor pattern for schema traversal.
 */

import { SchemaField, FieldType } from './models';
import { RefResolver } from './ref-resolver';

export class SchemaVisitor {
  private resolver: RefResolver;
  private maxDepth: number;

  constructor(resolver: RefResolver, maxDepth: number = 5) {
    this.resolver = resolver;
    this.maxDepth = maxDepth;
  }

  /**
   * Visits a schema and returns flat list of fields with JSON paths.
   */
  visit(schema: unknown, parentPath: string = '', depth: number = 0): SchemaField[] {
    if (depth > this.maxDepth) {
      return [];
    }

    const resolved = this.resolver.resolve(schema) as Record<string, unknown>;
    if (!resolved) {
      return [];
    }

    const type = this.getFieldType(resolved);
    const fields: SchemaField[] = [];

    switch (type) {
      case FieldType.OBJECT:
        fields.push(...this.visitObject(resolved, parentPath, depth));
        break;
      case FieldType.ARRAY:
        fields.push(...this.visitArray(resolved, parentPath, depth));
        break;
      default:
        // Primitive type at root level
        if (parentPath) {
          fields.push(this.createField(parentPath, resolved));
        }
    }

    return fields;
  }

  /**
   * Visits object schema and extracts property fields.
   */
  private visitObject(
    schema: Record<string, unknown>,
    parentPath: string,
    depth: number
  ): SchemaField[] {
    const fields: SchemaField[] = [];
    const properties = schema.properties as Record<string, unknown> | undefined;
    const required = (schema.required as string[]) || [];

    if (!properties) {
      return fields;
    }

    for (const [name, propSchema] of Object.entries(properties)) {
      const path = parentPath ? `${parentPath}.${name}` : name;
      const propResolved = this.resolver.resolve(propSchema) as Record<string, unknown>;
      const propType = this.getFieldType(propResolved);

      // Create field for this property
      const field = this.createField(path, propResolved, name, required.includes(name));
      fields.push(field);

      // Recurse into nested objects/arrays
      if (propType === FieldType.OBJECT && propResolved.properties) {
        const nested = this.visitObject(propResolved, path, depth + 1);
        field.nested = nested;
        fields.push(...nested);
      } else if (propType === FieldType.ARRAY) {
        const nested = this.visitArray(propResolved, path, depth + 1);
        field.nested = nested;
        fields.push(...nested);
      }
    }

    return fields;
  }

  /**
   * Visits array schema and extracts item fields.
   */
  private visitArray(
    schema: Record<string, unknown>,
    parentPath: string,
    depth: number
  ): SchemaField[] {
    const fields: SchemaField[] = [];
    const items = schema.items as Record<string, unknown> | undefined;

    if (!items) {
      return fields;
    }

    const itemsResolved = this.resolver.resolve(items) as Record<string, unknown>;
    const itemType = this.getFieldType(itemsResolved);

    // Use [0] notation for first array element
    const itemPath = `${parentPath}[0]`;

    if (itemType === FieldType.OBJECT && itemsResolved.properties) {
      fields.push(...this.visitObject(itemsResolved, itemPath, depth + 1));
    } else if (itemType !== FieldType.OBJECT) {
      // Primitive array items
      fields.push(this.createField(itemPath, itemsResolved));
    }

    return fields;
  }

  /**
   * Creates a SchemaField from resolved schema.
   */
  private createField(
    path: string,
    schema: Record<string, unknown>,
    name?: string,
    required: boolean = false
  ): SchemaField {
    return {
      name: name || path.split('.').pop() || path,
      path,
      fieldType: this.getFieldType(schema),
      format: schema.format as string | undefined,
      required,
      nullable: (schema.nullable as boolean) || false,
      enumValues: Array.isArray(schema.enum)
        ? schema.enum.map(v => String(v))
        : undefined,
      description: schema.description as string | undefined,

      // Numeric constraints
      minimum: schema.minimum as number | undefined,
      maximum: schema.maximum as number | undefined,
      exclusiveMinimum: schema.exclusiveMinimum as number | undefined,
      exclusiveMaximum: schema.exclusiveMaximum as number | undefined,

      // String constraints
      minLength: schema.minLength as number | undefined,
      maxLength: schema.maxLength as number | undefined,
      pattern: schema.pattern as string | undefined,

      // Array constraints
      minItems: schema.minItems as number | undefined,
      maxItems: schema.maxItems as number | undefined,
      uniqueItems: schema.uniqueItems as boolean | undefined,

      // Example
      example: schema.example
    };
  }

  /**
   * Determines FieldType from schema.
   */
  private getFieldType(schema: Record<string, unknown>): FieldType {
    const type = schema.type as string | undefined;

    switch (type) {
      case 'string':
        return FieldType.STRING;
      case 'integer':
        return FieldType.INTEGER;
      case 'number':
        return FieldType.NUMBER;
      case 'boolean':
        return FieldType.BOOLEAN;
      case 'array':
        return FieldType.ARRAY;
      case 'object':
      default:
        // If has properties, treat as object
        if (schema.properties) {
          return FieldType.OBJECT;
        }
        return FieldType.OBJECT;
    }
  }
}

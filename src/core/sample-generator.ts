/**
 * Generates sample values for OpenAPI schema fields.
 * Used to pre-fill request forms with example data.
 */

import { SchemaField, FieldType } from './models';

export class SampleGenerator {
  private counter = 0;

  /**
   * Generates a sample value for a schema field.
   */
  generateValue(field: SchemaField): unknown {
    // Use example from schema if available (highest priority)
    if (field.example !== undefined) {
      return field.example;
    }

    // Use first enum value if available
    if (field.enumValues && field.enumValues.length > 0) {
      return field.enumValues[0];
    }

    // Generate based on type and format
    return this.generateByType(field);
  }

  /**
   * Generates sample value based on field type and format.
   */
  private generateByType(field: SchemaField): unknown {
    const format = field.format?.toLowerCase();
    const name = field.name.toLowerCase();

    switch (field.fieldType) {
      case FieldType.STRING:
        return this.generateString(format, name);

      case FieldType.INTEGER:
        return this.generateInteger(format, name);

      case FieldType.NUMBER:
        return this.generateNumber(format);

      case FieldType.BOOLEAN:
        return true;

      case FieldType.ARRAY:
        // Generate array with one sample item
        if (field.nested && field.nested.length > 0) {
          // If nested is an object schema, generate object
          if (field.nested[0].fieldType === FieldType.OBJECT || field.nested.length > 1) {
            const obj: Record<string, unknown> = {};
            for (const child of field.nested) {
              obj[child.name] = this.generateValue(child);
            }
            return [obj];
          }
          // If nested is a simple type, generate array of that type
          return [this.generateValue(field.nested[0])];
        }
        return [];

      case FieldType.OBJECT:
        // Generate object with all properties
        if (field.nested && field.nested.length > 0) {
          const obj: Record<string, unknown> = {};
          for (const child of field.nested) {
            obj[child.name] = this.generateValue(child);
          }
          return obj;
        }
        return {};

      default:
        return null;
    }
  }

  /**
   * Generates sample string value.
   */
  private generateString(format?: string, name?: string): string {
    // Format-based generation
    switch (format) {
      case 'uuid':
        return '550e8400-e29b-41d4-a716-446655440000';
      case 'date':
        return '2024-01-15';
      case 'date-time':
        return '2024-01-15T10:30:00Z';
      case 'time':
        return '10:30:00';
      case 'email':
        return 'user@example.com';
      case 'uri':
      case 'url':
        return 'https://example.com/resource';
      case 'hostname':
        return 'api.example.com';
      case 'ipv4':
        return '192.168.1.1';
      case 'ipv6':
        return '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      case 'byte':
        return 'SGVsbG8gV29ybGQ='; // base64
      case 'binary':
        return '<binary data>';
      case 'password':
        return '********';
    }

    // Name-based inference
    if (name) {
      if (name.includes('id') || name.endsWith('id')) {
        return '550e8400-e29b-41d4-a716-446655440000';
      }
      if (name.includes('email')) {
        return 'user@example.com';
      }
      if (name.includes('name')) {
        return 'Sample Name';
      }
      if (name.includes('title')) {
        return 'Sample Title';
      }
      if (name.includes('description')) {
        return 'Sample description text';
      }
      if (name.includes('url') || name.includes('link')) {
        return 'https://example.com';
      }
      if (name.includes('phone')) {
        return '+1-555-123-4567';
      }
      if (name.includes('address')) {
        return '123 Main Street';
      }
      if (name.includes('city')) {
        return 'New York';
      }
      if (name.includes('country')) {
        return 'US';
      }
      if (name.includes('zip') || name.includes('postal')) {
        return '10001';
      }
      if (name.includes('token')) {
        return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
      }
      if (name.includes('status')) {
        return 'active';
      }
      if (name.includes('type')) {
        return 'default';
      }
    }

    // Default string (like Swagger UI)
    return 'string';
  }

  /**
   * Generates sample integer value.
   */
  private generateInteger(format?: string, name?: string): number {
    // Use 0 as default (like Swagger UI)
    switch (format) {
      case 'int32':
      case 'int64':
        return 0;
    }

    if (name) {
      if (name.includes('count') || name.includes('total')) {
        return 10;
      }
      if (name.includes('page')) {
        return 1;
      }
      if (name.includes('size') || name.includes('limit')) {
        return 20;
      }
      if (name.includes('offset') || name.includes('skip')) {
        return 0;
      }
      if (name.includes('port')) {
        return 8080;
      }
      if (name.includes('year')) {
        return 2024;
      }
      if (name.includes('age')) {
        return 25;
      }
    }

    return 1;
  }

  /**
   * Generates sample number value.
   */
  private generateNumber(format?: string): number {
    switch (format) {
      case 'float':
        return 3.14;
      case 'double':
        return 3.141592653589793;
    }
    return 1.5;
  }

  /**
   * Generates a complete sample request body from schema fields.
   * Only uses top-level fields (nested objects use field.nested).
   */
  generateRequestBody(fields: SchemaField[]): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const field of fields) {
      // Only include top-level fields (no dots or brackets in path)
      if (!field.path.includes('.') && !field.path.includes('[')) {
        body[field.name] = this.generateValue(field);
      }
    }
    return body;
  }

  /**
   * Generates sample value for a parameter with optional example.
   */
  generateParamValue(schema: SchemaField, example?: unknown): unknown {
    // Use example if provided
    if (example !== undefined) {
      return example;
    }
    return this.generateValue(schema);
  }

  /**
   * Reset counter for fresh generation.
   */
  reset(): void {
    this.counter = 0;
  }
}

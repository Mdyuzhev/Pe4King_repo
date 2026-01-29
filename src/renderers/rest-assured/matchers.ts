/**
 * Matcher generators for REST Assured (Hamcrest) assertions.
 */

import { SchemaField, FieldType, Assertion } from '../../core/models';

export class RestAssuredMatcherFactory {
  /**
   * Generates REST Assured .body() assertion for a field.
   */
  forField(field: SchemaField): string {
    const path = this.toJsonPath(field.path);

    // Priority: enum > format > type
    if (field.enumValues && field.enumValues.length > 0) {
      return `.body("${path}", oneOf(${field.enumValues.map(v => `"${v}"`).join(', ')}))`;
    }

    if (field.format) {
      const formatMatcher = this.forFormat(path, field.format);
      if (formatMatcher) return formatMatcher;
    }

    return this.forType(path, field.fieldType, field.nullable);
  }

  /**
   * Generates array not empty check.
   */
  arrayNotEmpty(path: string): string {
    return `.body("${path}", not(empty()))`;
  }

  /**
   * Generates assertion from Assertion model.
   */
  fromAssertion(assertion: Assertion): string {
    const path = this.toJsonPath(assertion.path);

    switch (assertion.matcher) {
      case 'notNull':
        return `.body("${path}", notNullValue())`;
      case 'isNull':
        return `.body("${path}", nullValue())`;
      case 'equals':
        return `.body("${path}", equalTo(${this.toJavaValue(assertion.value)}))`;
      case 'notEquals':
        return `.body("${path}", not(equalTo(${this.toJavaValue(assertion.value)})))`;
      case 'contains':
        return `.body("${path}", containsString("${assertion.value}"))`;
      case 'matchesPattern':
        return `.body("${path}", matchesPattern("${this.escapeJavaString(assertion.value as string)}"))`;
      case 'oneOf':
        const values = assertion.value as string[];
        return `.body("${path}", oneOf(${values.map(v => `"${v}"`).join(', ')}))`;
      case 'isType':
        return `.body("${path}", isA(${this.toJavaClass(assertion.value as string)}))`;
      case 'notEmpty':
        return `.body("${path}", not(empty()))`;
      case 'isEmpty':
        return `.body("${path}", empty())`;
      case 'greaterThan':
        return `.body("${path}", greaterThan(${assertion.value}))`;
      case 'greaterThanOrEqual':
        return `.body("${path}", greaterThanOrEqualTo(${assertion.value}))`;
      case 'lessThan':
        return `.body("${path}", lessThan(${assertion.value}))`;
      case 'lessThanOrEqual':
        return `.body("${path}", lessThanOrEqualTo(${assertion.value}))`;
      case 'hasSize':
        return `.body("${path}", hasSize(${assertion.value}))`;
      case 'hasSizeGreaterThan':
        return `.body("${path}", hasSize(greaterThan(${assertion.value})))`;
      case 'hasSizeLessThan':
        return `.body("${path}", hasSize(lessThan(${assertion.value})))`;
      case 'hasMinLength':
        return `.body("${path}.length()", greaterThanOrEqualTo(${assertion.value}))`;
      case 'hasMaxLength':
        return `.body("${path}.length()", lessThanOrEqualTo(${assertion.value}))`;
      default:
        return `.body("${path}", notNullValue())`;
    }
  }

  /**
   * Converts model path to REST Assured JSON path.
   */
  private toJsonPath(path: string): string {
    return path;
  }

  /**
   * Generates matcher for format.
   */
  private forFormat(path: string, format: string): string | null {
    const patterns: Record<string, string> = {
      'uuid': `.body("${path}", matchesPattern("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))`,
      'email': `.body("${path}", containsString("@"))`,
      'uri': `.body("${path}", matchesPattern("^https?://.*"))`,
      'url': `.body("${path}", matchesPattern("^https?://.*"))`,
      'date': `.body("${path}", matchesPattern("\\\\d{4}-\\\\d{2}-\\\\d{2}"))`,
      'date-time': `.body("${path}", matchesPattern("\\\\d{4}-\\\\d{2}-\\\\d{2}.*"))`,
      'int32': `.body("${path}", isA(Integer.class))`,
      'int64': `.body("${path}", isA(Long.class))`,
      'float': `.body("${path}", isA(Float.class))`,
      'double': `.body("${path}", isA(Double.class))`
    };

    return patterns[format] || null;
  }

  /**
   * Generates matcher for type.
   */
  private forType(path: string, type: FieldType, nullable: boolean): string {
    if (nullable) {
      return `.body("${path}", anyOf(nullValue(), notNullValue()))`;
    }

    switch (type) {
      case FieldType.STRING:
        return `.body("${path}", notNullValue())`;
      case FieldType.INTEGER:
        return `.body("${path}", isA(Number.class))`;
      case FieldType.NUMBER:
        return `.body("${path}", isA(Number.class))`;
      case FieldType.BOOLEAN:
        return `.body("${path}", isA(Boolean.class))`;
      case FieldType.ARRAY:
        return `.body("${path}", not(empty()))`;
      case FieldType.OBJECT:
        return `.body("${path}", notNullValue())`;
      default:
        return `.body("${path}", notNullValue())`;
    }
  }

  private toJavaValue(value: unknown): string {
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value === null) return 'null';
    return String(value);
  }

  private toJavaClass(type: string): string {
    const classMap: Record<string, string> = {
      'string': 'String.class',
      'integer': 'Integer.class',
      'number': 'Number.class',
      'boolean': 'Boolean.class',
      'array': 'List.class',
      'object': 'Map.class'
    };
    return classMap[type] || 'Object.class';
  }

  private escapeJavaString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  private escapeJavaRegex(pattern: string): string {
    return pattern.replace(/\\/g, '\\\\\\\\').replace(/"/g, '\\"');
  }
}

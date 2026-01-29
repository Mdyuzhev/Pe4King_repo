/**
 * Matcher generators for pytest assertions.
 * Converts SchemaField to Python assertion code.
 */

import { SchemaField, FieldType, Assertion, MatcherType } from '../../core/models';

export class PytestMatcherFactory {
  /**
   * Generates Python assertion code for a field.
   */
  forField(field: SchemaField, varName: string = 'data'): string {
    const accessor = this.buildAccessor(field.path, varName);

    // Priority: enum > format > type
    if (field.enumValues && field.enumValues.length > 0) {
      return this.oneOf(accessor, field.enumValues);
    }

    if (field.format) {
      const formatAssertion = this.forFormat(accessor, field.format);
      if (formatAssertion) return formatAssertion;
    }

    return this.forType(accessor, field.fieldType, field.nullable);
  }

  /**
   * Generates assertion from Assertion model.
   */
  /**
   * Generates array length check.
   */
  arrayNotEmpty(path: string, varName: string = 'data'): string {
    const accessor = this.buildAccessor(path, varName);
    return `assert len(${accessor}) > 0, "Expected non-empty array at ${path}"`;
  }

  fromAssertion(assertion: Assertion, varName: string = 'data'): string {
    const accessor = this.buildAccessor(assertion.path, varName);

    switch (assertion.matcher) {
      case 'notNull':
        return `assert ${accessor} is not None`;
      case 'isNull':
        return `assert ${accessor} is None`;
      case 'equals':
        return `assert ${accessor} == ${this.toPythonValue(assertion.value)}`;
      case 'notEquals':
        return `assert ${accessor} != ${this.toPythonValue(assertion.value)}`;
      case 'contains':
        return `assert "${assertion.value}" in ${accessor}`;
      case 'matchesPattern':
        return `assert re.match(r"${assertion.value}", ${accessor})`;
      case 'oneOf':
        const values = assertion.value as string[];
        return `assert ${accessor} in ${this.toPythonList(values)}`;
      case 'isType':
        return `assert isinstance(${accessor}, ${this.toPythonType(assertion.value as string)})`;
      case 'notEmpty':
        return `assert len(${accessor}) > 0`;
      case 'isEmpty':
        return `assert len(${accessor}) == 0`;
      case 'greaterThan':
        return `assert ${accessor} > ${assertion.value}`;
      case 'greaterThanOrEqual':
        return `assert ${accessor} >= ${assertion.value}`;
      case 'lessThan':
        return `assert ${accessor} < ${assertion.value}`;
      case 'lessThanOrEqual':
        return `assert ${accessor} <= ${assertion.value}`;
      case 'hasSize':
        return `assert len(${accessor}) == ${assertion.value}`;
      case 'hasSizeGreaterThan':
        return `assert len(${accessor}) > ${assertion.value}`;
      case 'hasSizeLessThan':
        return `assert len(${accessor}) < ${assertion.value}`;
      case 'hasMinLength':
        return `assert len(${accessor}) >= ${assertion.value}`;
      case 'hasMaxLength':
        return `assert len(${accessor}) <= ${assertion.value}`;
      default:
        return `assert ${accessor} is not None`;
    }
  }

  /**
   * Builds Python accessor for JSON path.
   * "user.email" -> data["user"]["email"]
   * "items[0].id" -> data["items"][0]["id"]
   */
  private buildAccessor(path: string, varName: string): string {
    const parts = path.split(/\.|\[(\d+)\]/).filter(Boolean);
    let accessor = varName;

    for (const part of parts) {
      if (/^\d+$/.test(part)) {
        accessor += `[${part}]`;
      } else {
        accessor += `["${part}"]`;
      }
    }

    return accessor;
  }

  /**
   * Generates assertion for enum values (oneOf).
   */
  private oneOf(accessor: string, values: string[]): string {
    return `assert ${accessor} in ${this.toPythonList(values)}`;
  }

  /**
   * Generates assertion for specific format.
   */
  private forFormat(accessor: string, format: string): string | null {
    const formatPatterns: Record<string, string> = {
      'uuid': `assert re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", ${accessor}, re.IGNORECASE)`,
      'email': `assert "@" in ${accessor}`,
      'uri': `assert ${accessor}.startswith(("http://", "https://"))`,
      'url': `assert ${accessor}.startswith(("http://", "https://"))`,
      'date': `assert re.match(r"^\\d{4}-\\d{2}-\\d{2}$", ${accessor})`,
      'date-time': `assert re.match(r"^\\d{4}-\\d{2}-\\d{2}", ${accessor})`,
      'int32': `assert isinstance(${accessor}, int)`,
      'int64': `assert isinstance(${accessor}, int)`,
      'float': `assert isinstance(${accessor}, (int, float))`,
      'double': `assert isinstance(${accessor}, (int, float))`
    };

    return formatPatterns[format] || null;
  }

  /**
   * Generates assertion for field type.
   */
  private forType(accessor: string, type: FieldType, nullable: boolean): string {
    if (nullable) {
      return `assert ${accessor} is None or isinstance(${accessor}, ${this.getTypeClass(type)})`;
    }

    switch (type) {
      case FieldType.STRING:
        return `assert ${accessor} is not None`;
      case FieldType.INTEGER:
      case FieldType.NUMBER:
        return `assert isinstance(${accessor}, (int, float))`;
      case FieldType.BOOLEAN:
        return `assert isinstance(${accessor}, bool)`;
      case FieldType.ARRAY:
        return `assert isinstance(${accessor}, list)`;
      case FieldType.OBJECT:
        return `assert isinstance(${accessor}, dict)`;
      default:
        return `assert ${accessor} is not None`;
    }
  }

  private getTypeClass(type: FieldType): string {
    switch (type) {
      case FieldType.STRING:
        return 'str';
      case FieldType.INTEGER:
        return 'int';
      case FieldType.NUMBER:
        return '(int, float)';
      case FieldType.BOOLEAN:
        return 'bool';
      case FieldType.ARRAY:
        return 'list';
      case FieldType.OBJECT:
        return 'dict';
      default:
        return 'object';
    }
  }

  private toPythonValue(value: unknown): string {
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (value === null) return 'None';
    return String(value);
  }

  private toPythonList(values: string[]): string {
    const quoted = values.map(v => `"${v}"`).join(', ');
    return `[${quoted}]`;
  }

  private toPythonType(type: string): string {
    const typeMap: Record<string, string> = {
      'string': 'str',
      'integer': 'int',
      'number': '(int, float)',
      'boolean': 'bool',
      'array': 'list',
      'object': 'dict'
    };
    return typeMap[type] || 'object';
  }
}

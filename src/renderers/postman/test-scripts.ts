/**
 * Postman test script generators.
 * Uses pm.test() and pm.expect() (Chai BDD) syntax.
 */

import { Assertion } from '../../core/models';

export class PostmanScriptGenerator {
  generateTestScript(statusCode: number, assertions: Assertion[], testName: string): string {
    const lines: string[] = [];

    // Status code test
    lines.push(`pm.test("Status code is ${statusCode}", function () {`);
    lines.push(`    pm.response.to.have.status(${statusCode});`);
    lines.push(`});`);
    lines.push('');

    // Skip body validation for no-content responses
    const noContentStatuses = [204, 202];
    if (noContentStatuses.includes(statusCode)) {
      lines.push('// No response body expected');
      return lines.join('\n');
    }

    if (assertions.length === 0) {
      lines.push('// No response schema defined');
      return lines.join('\n');
    }

    // Response validation test
    lines.push(`pm.test("${testName} - Response validation", function () {`);
    lines.push('    const jsonData = pm.response.json();');
    lines.push('');

    // Array bounds checking
    const checkedArrays = new Set<string>();

    for (const assertion of assertions) {
      const arrayMatch = assertion.path.match(/^([^[]+)\[0\]/);
      if (arrayMatch) {
        const arrayPath = arrayMatch[1];
        if (!checkedArrays.has(arrayPath)) {
          checkedArrays.add(arrayPath);
          const accessor = this.buildAccessor(arrayPath);
          lines.push(`    pm.expect(${accessor}).to.be.an('array').that.is.not.empty;`);
        }
      }
      lines.push(`    ${this.assertionToScript(assertion)}`);
    }

    lines.push('});');
    return lines.join('\n');
  }

  generatePreRequestScript(hasPathParams: boolean, hasBody: boolean): string {
    const lines: string[] = ['// Pre-request Script'];

    if (hasPathParams || hasBody) {
      lines.push('if (!pm.environment.get("testUUID")) {');
      lines.push('    pm.environment.set("testUUID", pm.variables.replaceIn("{{$guid}}"));');
      lines.push('}');
      lines.push('pm.environment.set("timestamp", new Date().toISOString());');
    }

    return lines.join('\n');
  }

  private assertionToScript(assertion: Assertion): string {
    const accessor = this.buildAccessor(assertion.path);

    switch (assertion.matcher) {
      case 'notNull':
        return `pm.expect(${accessor}).to.not.be.null;`;
      case 'isNull':
        return `pm.expect(${accessor}).to.be.null;`;
      case 'equals':
        return `pm.expect(${accessor}).to.eql(${JSON.stringify(assertion.value)});`;
      case 'contains':
        return `pm.expect(${accessor}).to.include("${assertion.value}");`;
      case 'matchesPattern':
        const pattern = (assertion.value as string).replace(/^\^/, '').replace(/\$$/, '').replace(/\//g, '\\/');
        return `pm.expect(${accessor}).to.match(/${pattern}/);`;
      case 'oneOf':
        return `pm.expect(${JSON.stringify(assertion.value)}).to.include(${accessor});`;
      case 'isType':
        const jsType = assertion.value === 'integer' ? 'number' : assertion.value;
        return `pm.expect(typeof ${accessor}).to.eql("${jsType}");`;
      case 'notEmpty':
        return `pm.expect(${accessor}).to.not.be.empty;`;
      case 'greaterThan':
        return `pm.expect(${accessor}).to.be.above(${assertion.value});`;
      case 'lessThan':
        return `pm.expect(${accessor}).to.be.below(${assertion.value});`;
      default:
        return `pm.expect(${accessor}).to.exist;`;
    }
  }

  private buildAccessor(path: string): string {
    const parts = path.split(/\.|\[(\d+)\]/).filter(Boolean);
    let accessor = 'jsonData';

    for (const part of parts) {
      if (/^\d+$/.test(part)) {
        accessor += `[${part}]`;
      } else {
        accessor += `["${part}"]`;
      }
    }

    return accessor;
  }
}

/**
 * Python Script Runner for executing pre-request and test scripts.
 * Runs Python scripts via child_process and passes context as JSON.
 */

import { spawn } from 'child_process';
import { ScriptResult } from '../collections/models';

export interface ScriptContext {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  };
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string | string[]>;
    body: string;
    time_ms: number;
    size: number;
  };
  env?: Record<string, string>;
}

const WRAPPER_SCRIPT = `
import sys
import json

# Read context from stdin
context_json = sys.stdin.read()
context = json.loads(context_json)

request = context.get('request', {})
response = context.get('response')
env = context.get('env', {})

# Results collector with individual test tracking
__results__ = {
    'assertions': {'passed': 0, 'failed': 0, 'errors': [], 'tests': []},
    'output': [],
    'modified_request': None
}

def log(*args):
    __results__['output'].append(' '.join(str(a) for a in args))

def set_header(name, value):
    if __results__['modified_request'] is None:
        __results__['modified_request'] = {}
    if 'headers' not in __results__['modified_request']:
        __results__['modified_request']['headers'] = dict(request.get('headers', {}))
    __results__['modified_request']['headers'][name] = value

def set_body(body):
    if __results__['modified_request'] is None:
        __results__['modified_request'] = {}
    __results__['modified_request']['body'] = body

def set_url(url):
    if __results__['modified_request'] is None:
        __results__['modified_request'] = {}
    __results__['modified_request']['url'] = url

# Test function that tracks each test individually
def test(condition, message=None):
    test_name = message or f'Test #{len(__results__["assertions"]["tests"]) + 1}'
    passed = bool(condition)
    __results__['assertions']['tests'].append({'name': test_name, 'passed': passed})
    if passed:
        __results__['assertions']['passed'] += 1
    else:
        __results__['assertions']['failed'] += 1
        __results__['assertions']['errors'].append(test_name)

# Assert equals with actual/expected tracking
def assert_eq(actual, expected, message=None):
    test_name = message or f'Expected {expected}'
    passed = actual == expected
    __results__['assertions']['tests'].append({
        'name': test_name,
        'passed': passed,
        'actual': str(actual),
        'expected': str(expected)
    })
    if passed:
        __results__['assertions']['passed'] += 1
    else:
        __results__['assertions']['failed'] += 1
        __results__['assertions']['errors'].append(test_name)

# Assert status code
def assert_status(expected, message=None):
    actual = response.get('status') if response else None
    test_name = message or f'Status should be {expected}'
    assert_eq(actual, expected, test_name)

# Assert response time
def assert_time(max_ms, message=None):
    actual = response.get('time_ms') if response else 0
    test_name = message or f'Response time < {max_ms}ms'
    passed = actual < max_ms
    __results__['assertions']['tests'].append({
        'name': test_name,
        'passed': passed,
        'actual': f'{actual}ms',
        'expected': f'< {max_ms}ms'
    })
    if passed:
        __results__['assertions']['passed'] += 1
    else:
        __results__['assertions']['failed'] += 1
        __results__['assertions']['errors'].append(test_name)

try:
    # Execute user script
    exec('''
USER_SCRIPT_PLACEHOLDER
''')
except AssertionError as e:
    __results__['assertions']['failed'] += 1
    __results__['assertions']['errors'].append(str(e) or 'Assertion failed')
except Exception as e:
    __results__['assertions']['failed'] += 1
    __results__['assertions']['errors'].append(f'{type(e).__name__}: {e}')

# Output results as JSON
print(json.dumps(__results__))
`;

export class PythonRunner {
  private pythonPath: string = 'python';
  private timeout: number = 10000;

  constructor(options?: { pythonPath?: string; timeout?: number }) {
    if (options?.pythonPath) {
      this.pythonPath = options.pythonPath;
    }
    if (options?.timeout) {
      this.timeout = options.timeout;
    }
  }

  /**
   * Executes a Python script with the given context.
   */
  async execute(script: string, context: ScriptContext): Promise<ScriptResult> {
    return new Promise((resolve) => {
      const wrappedScript = WRAPPER_SCRIPT.replace('USER_SCRIPT_PLACEHOLDER', script);

      const python = spawn(this.pythonPath, ['-c', wrappedScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.timeout
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Send context to stdin
      python.stdin.write(JSON.stringify(context));
      python.stdin.end();

      const timeoutId = setTimeout(() => {
        python.kill();
        resolve({
          success: false,
          error: `Script timeout after ${this.timeout}ms`
        });
      }, this.timeout);

      python.on('close', (code) => {
        clearTimeout(timeoutId);

        if (code !== 0 && !stdout) {
          resolve({
            success: false,
            error: stderr || `Python exited with code ${code}`,
            output: stderr
          });
          return;
        }

        try {
          const results = JSON.parse(stdout);
          console.log('[PythonRunner] Raw results:', JSON.stringify(results, null, 2));
          console.log('[PythonRunner] tests array:', results.assertions?.tests);
          const hasFailures = results.assertions?.failed > 0;

          resolve({
            success: !hasFailures,
            output: results.output?.join('\n') || '',
            assertions: {
              passed: results.assertions?.passed || 0,
              failed: results.assertions?.failed || 0,
              errors: results.assertions?.errors || [],
              tests: results.assertions?.tests || []
            },
            modifiedRequest: results.modified_request ? {
              headers: results.modified_request.headers,
              body: results.modified_request.body,
              url: results.modified_request.url
            } : undefined
          });
        } catch {
          resolve({
            success: false,
            error: 'Failed to parse script output',
            output: stdout + stderr
          });
        }
      });

      python.on('error', (err) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: `Failed to run Python: ${err.message}`
        });
      });
    });
  }

  /**
   * Checks if Python is available.
   */
  async checkPython(): Promise<{ available: boolean; version?: string; error?: string }> {
    return new Promise((resolve) => {
      const python = spawn(this.pythonPath, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        output += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          resolve({
            available: true,
            version: output.trim()
          });
        } else {
          resolve({
            available: false,
            error: 'Python not found'
          });
        }
      });

      python.on('error', (err) => {
        resolve({
          available: false,
          error: err.message
        });
      });
    });
  }
}

/**
 * HTTP Request Executor for sending API requests.
 * Works in Node.js context (VS Code extension), not browser.
 */

import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export interface RequestConfig {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  rejectUnauthorized?: boolean;
}

export interface RequestResult {
  success: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string | string[]>;
  body?: string;
  time?: number;
  size?: number;
  error?: string;
}

export class RequestExecutor {
  private defaultTimeout = 30000;

  /**
   * Executes an HTTP request.
   */
  async execute(config: RequestConfig): Promise<RequestResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      try {
        const url = new URL(config.url);
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;

        const options: https.RequestOptions = {
          method: config.method.toUpperCase(),
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          headers: {
            'User-Agent': 'Pe4King-VSCode/1.0',
            'Accept': 'application/json, */*',
            ...config.headers
          },
          timeout: config.timeout || this.defaultTimeout,
          rejectUnauthorized: config.rejectUnauthorized ?? true
        };

        // Add Content-Length for body (Content-Type comes from headers)
        if (config.body) {
          const bodyBuffer = Buffer.from(config.body, 'utf-8');
          options.headers = {
            ...options.headers,
            'Content-Length': bodyBuffer.length.toString()
          };
        }

        const req = client.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            const time = Date.now() - startTime;
            const headers: Record<string, string | string[]> = {};

            // Convert headers to plain object
            for (const [key, value] of Object.entries(res.headers)) {
              if (value !== undefined) {
                headers[key] = value;
              }
            }

            resolve({
              success: true,
              status: res.statusCode,
              statusText: res.statusMessage || this.getStatusText(res.statusCode || 0),
              headers,
              body: data,
              time,
              size: Buffer.byteLength(data, 'utf-8')
            });
          });
        });

        req.on('error', (err) => {
          resolve({
            success: false,
            error: err.message,
            time: Date.now() - startTime
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            success: false,
            error: `Request timeout after ${config.timeout || this.defaultTimeout}ms`,
            time: Date.now() - startTime
          });
        });

        // Write body if present
        if (config.body) {
          req.write(config.body);
        }

        req.end();

      } catch (err) {
        resolve({
          success: false,
          error: (err as Error).message,
          time: Date.now() - startTime
        });
      }
    });
  }

  /**
   * Gets status text for common HTTP status codes.
   */
  private getStatusText(status: number): string {
    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      202: 'Accepted',
      204: 'No Content',
      301: 'Moved Permanently',
      302: 'Found',
      304: 'Not Modified',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout'
    };
    return statusTexts[status] || 'Unknown';
  }
}

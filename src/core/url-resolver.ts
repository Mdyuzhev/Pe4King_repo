/**
 * Resolves OpenAPI specification URL from various input formats.
 * Handles direct spec URLs, Swagger UI pages, and auto-detection.
 */

import * as https from 'https';
import * as http from 'http';

// Common paths where OpenAPI specs are typically hosted
const COMMON_SPEC_PATHS = [
  '/v3/api-docs',           // SpringDoc (modern Spring)
  '/v2/api-docs',           // SpringFox (legacy Spring)
  '/v2/swagger.json',       // Petstore style
  '/v3/swagger.json',       // Petstore v3 style
  '/swagger.json',          // Common standard
  '/openapi.json',          // OpenAPI 3.x standard
  '/openapi.yaml',          // OpenAPI 3.x YAML
  '/api-docs',              // Various frameworks
  '/swagger/v1/swagger.json', // .NET
  '/swagger/v2/swagger.json', // .NET alternative
  '/api/swagger.json',      // Custom paths
  '/docs/openapi.json'      // Documentation paths
];

export interface ResolveResult {
  success: boolean;
  specContent?: string;
  resolvedUrl?: string;
  error?: string;
}

export interface FetchOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

export class SpecUrlResolver {
  private defaultTimeout = 30000; // 30 seconds

  /**
   * Resolves and fetches OpenAPI spec from a URL.
   * Tries direct fetch first, then common paths if it looks like a base URL.
   */
  async resolve(inputUrl: string, options: FetchOptions = {}): Promise<ResolveResult> {
    // Normalize URL
    let url = inputUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Remove trailing slash
    url = url.replace(/\/$/, '');

    // Try direct fetch first
    const directResult = await this.tryFetch(url, options);
    if (directResult.success && this.isValidSpec(directResult.specContent!)) {
      return { ...directResult, resolvedUrl: url };
    }

    // If URL looks like Swagger UI, try to extract spec URL from HTML
    if (this.looksLikeSwaggerUI(url)) {
      const extractedUrl = await this.extractSpecUrlFromUI(url, options);
      if (extractedUrl) {
        const result = await this.tryFetch(extractedUrl, options);
        if (result.success && this.isValidSpec(result.specContent!)) {
          return { ...result, resolvedUrl: extractedUrl };
        }
      }
    }

    // Try common paths
    const baseUrl = this.extractBaseUrl(url);
    for (const path of COMMON_SPEC_PATHS) {
      const candidateUrl = baseUrl + path;
      const result = await this.tryFetch(candidateUrl, options);
      if (result.success && this.isValidSpec(result.specContent!)) {
        return { ...result, resolvedUrl: candidateUrl };
      }
    }

    return {
      success: false,
      error: 'Could not find OpenAPI specification. Please provide a direct URL to the spec file (e.g., /v3/api-docs or /swagger.json)'
    };
  }

  /**
   * Fetches content from URL.
   */
  private async tryFetch(url: string, options: FetchOptions): Promise<ResolveResult> {
    return new Promise((resolve) => {
      const client = url.startsWith('https') ? https : http;
      const timeout = options.timeout || this.defaultTimeout;

      const requestOptions: https.RequestOptions = {
        headers: {
          'Accept': 'application/json, application/yaml, text/yaml, */*',
          'User-Agent': 'Pe4King-VSCode/1.0',
          ...options.headers
        },
        timeout
      };

      const req = client.get(url, requestOptions, (res) => {
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            // Resolve relative redirects
            const absoluteUrl = redirectUrl.startsWith('http')
              ? redirectUrl
              : new URL(redirectUrl, url).href;
            this.tryFetch(absoluteUrl, options).then(resolve);
            return;
          }
        }

        if (res.statusCode !== 200) {
          resolve({
            success: false,
            error: `HTTP ${res.statusCode}: ${res.statusMessage}`
          });
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            success: true,
            specContent: data
          });
        });
      });

      req.on('error', (err) => {
        resolve({
          success: false,
          error: err.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: 'Request timeout'
        });
      });
    });
  }

  /**
   * Checks if content looks like a valid OpenAPI/Swagger spec.
   */
  private isValidSpec(content: string): boolean {
    try {
      // Try JSON first
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(content);
      } catch {
        // Try YAML (simple check - look for openapi/swagger keys)
        if (content.includes('openapi:') || content.includes('swagger:')) {
          return true;
        }
        return false;
      }

      // Check for OpenAPI 3.x or Swagger 2.0 markers
      return !!(data.openapi || data.swagger || data.paths);
    } catch {
      return false;
    }
  }

  /**
   * Checks if URL looks like a Swagger UI page.
   */
  private looksLikeSwaggerUI(url: string): boolean {
    const patterns = [
      /swagger-ui/i,
      /swagger\/index/i,
      /api-docs.*html/i,
      /docs\/?$/i,
      /\.swagger\.io/i,      // petstore.swagger.io
      /swagger\.[a-z]+\/?$/i // swagger.io root
    ];
    return patterns.some(p => p.test(url));
  }

  /**
   * Tries to extract spec URL from Swagger UI HTML page.
   */
  private async extractSpecUrlFromUI(uiUrl: string, options: FetchOptions): Promise<string | null> {
    const result = await this.tryFetch(uiUrl, options);
    if (!result.success || !result.specContent) {
      return null;
    }

    const html = result.specContent;

    // Look for url: "..." in SwaggerUIBundle config
    const urlMatch = html.match(/url:\s*["']([^"']+)["']/);
    if (urlMatch) {
      const specUrl = urlMatch[1];
      // Handle relative URLs
      return specUrl.startsWith('http') ? specUrl : new URL(specUrl, uiUrl).href;
    }

    // Look for data-url attribute
    const dataUrlMatch = html.match(/data-url=["']([^"']+)["']/);
    if (dataUrlMatch) {
      const specUrl = dataUrlMatch[1];
      return specUrl.startsWith('http') ? specUrl : new URL(specUrl, uiUrl).href;
    }

    // Look for configUrl in newer Swagger UI versions
    const configMatch = html.match(/configUrl:\s*["']([^"']+)["']/);
    if (configMatch) {
      // Fetch config and extract spec URL
      const configUrl = configMatch[1].startsWith('http')
        ? configMatch[1]
        : new URL(configMatch[1], uiUrl).href;

      const configResult = await this.tryFetch(configUrl, options);
      if (configResult.success && configResult.specContent) {
        try {
          const config = JSON.parse(configResult.specContent);
          if (config.url) {
            return config.url.startsWith('http')
              ? config.url
              : new URL(config.url, uiUrl).href;
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
    }

    return null;
  }

  /**
   * Extracts base URL (protocol + host) from full URL.
   */
  private extractBaseUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return url;
    }
  }
}

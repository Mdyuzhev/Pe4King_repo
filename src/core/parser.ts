/**
 * OpenAPI 3.x / Swagger 2.0 Parser.
 * Extracts endpoints and schemas for test generation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import {
  EndpointInfo,
  HttpMethod,
  ParameterInfo,
  SchemaField,
  SecurityRequirement,
  FieldType
} from './models';
import { RefResolver } from './ref-resolver';
import { SchemaVisitor } from './schema-visitor';

const SUCCESS_CODES = ['200', '201', '202', '204'];
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

export interface ParsedSpec {
  title: string;
  version: string;
  baseUrl: string;
  endpoints: EndpointInfo[];
}

export class OpenAPIParser {
  private spec: Record<string, unknown>;
  private resolver: RefResolver;
  private visitor: SchemaVisitor;

  constructor(spec: string | Record<string, unknown>) {
    this.spec = this.loadSpec(spec);
    this.resolver = new RefResolver(this.spec);
    this.visitor = new SchemaVisitor(this.resolver);
  }

  /**
   * Parses the OpenAPI spec and returns structured data.
   */
  parse(): ParsedSpec {
    const info = this.spec.info as Record<string, unknown> || {};

    return {
      title: (info.title as string) || 'API',
      version: (info.version as string) || '1.0.0',
      baseUrl: this.extractBaseUrl(),
      endpoints: this.parseEndpoints()
    };
  }

  /**
   * Loads spec from file path, string, or object.
   */
  private loadSpec(spec: string | Record<string, unknown>): Record<string, unknown> {
    if (typeof spec === 'object') {
      return spec;
    }

    // Check if it's a file path
    if (fs.existsSync(spec)) {
      const content = fs.readFileSync(spec, 'utf-8');
      const ext = path.extname(spec).toLowerCase();
      if (ext === '.yaml' || ext === '.yml') {
        return yaml.parse(content);
      }
      return JSON.parse(content);
    }

    // Try parsing as JSON/YAML string
    try {
      return JSON.parse(spec);
    } catch {
      return yaml.parse(spec);
    }
  }

  /**
   * Extracts base URL from spec.
   */
  private extractBaseUrl(): string {
    // OpenAPI 3.x
    const servers = this.spec.servers as Array<{ url: string }> | undefined;
    if (servers && servers.length > 0) {
      return servers[0].url;
    }

    // Swagger 2.0
    const host = this.spec.host as string;
    const basePath = this.spec.basePath as string || '';
    const schemes = this.spec.schemes as string[] || ['https'];
    if (host) {
      return `${schemes[0]}://${host}${basePath}`;
    }

    return 'http://localhost:8080';
  }

  /**
   * Parses all endpoints from paths.
   */
  private parseEndpoints(): EndpointInfo[] {
    const paths = this.spec.paths as Record<string, unknown> || {};
    const endpoints: EndpointInfo[] = [];

    for (const [pathUrl, pathItem] of Object.entries(paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      for (const method of HTTP_METHODS) {
        const operation = (pathItem as Record<string, unknown>)[method];
        if (!operation) continue;

        const endpoint = this.parseOperation(
          pathUrl,
          method.toUpperCase() as HttpMethod,
          operation as Record<string, unknown>,
          pathItem as Record<string, unknown>
        );
        endpoints.push(endpoint);
      }
    }

    return endpoints;
  }

  /**
   * Parses a single operation into EndpointInfo.
   */
  private parseOperation(
    path: string,
    method: HttpMethod,
    operation: Record<string, unknown>,
    pathItem: Record<string, unknown>
  ): EndpointInfo {
    // Parse parameters (from path item and operation)
    const params = this.parseParameters(operation, pathItem);

    // Parse request body
    const { schema: requestBodySchema, example: requestBodyExample, required: requestBodyRequired } =
      this.parseRequestBody(operation);

    // Parse response
    const { statusCode, fields, hasSchema } = this.parseResponse(operation);

    // Parse security
    const security = this.parseSecurity(operation);

    return {
      method,
      path,
      operationId: operation.operationId as string | undefined,
      summary: operation.summary as string | undefined,
      description: operation.description as string | undefined,
      tags: operation.tags as string[] | undefined,

      pathParams: params.filter(p => p.in === 'path'),
      queryParams: params.filter(p => p.in === 'query'),
      headerParams: params.filter(p => p.in === 'header'),
      formDataParams: (() => {
        const fd = params.filter(p => p.in === 'formData');
        if (fd.length > 0) {
          console.log('[Parser] formDataParams for', path, ':', fd.map(p => p.name));
        }
        return fd;
      })(),
      consumes: operation.consumes as string[] | undefined,

      requestBodySchema,
      requestBodyExample,
      requestBodyRequired,

      successStatus: statusCode,
      responseFields: fields,
      hasResponseSchema: hasSchema,

      security
    };
  }

  /**
   * Parses parameters from operation and path item.
   */
  private parseParameters(
    operation: Record<string, unknown>,
    pathItem: Record<string, unknown>
  ): ParameterInfo[] {
    const params: ParameterInfo[] = [];

    // Combine path-level and operation-level parameters
    const allParams = [
      ...((pathItem.parameters as unknown[]) || []),
      ...((operation.parameters as unknown[]) || [])
    ];

    for (const param of allParams) {
      const p = this.resolver.resolve(param) as Record<string, unknown>;
      if (!p || !p.name) continue;

      // DEBUG: Log parameter parsing
      if (p.in === 'formData') {
        console.log('[Parser] Found formData param:', p.name, 'type:', p.type);
      }

      // Swagger 2.0: type/format directly on parameter
      // OpenAPI 3.x: nested in schema object
      const schema = p.schema as Record<string, unknown> || {
        type: p.type as string || 'string',
        format: p.format as string | undefined,
        enum: p.enum as unknown[] | undefined
      };
      const resolvedSchema = this.resolver.resolve(schema) as Record<string, unknown>;

      params.push({
        name: p.name as string,
        in: p.in as 'path' | 'query' | 'header' | 'formData',
        required: (p.required as boolean) || p.in === 'path',
        schema: {
          name: p.name as string,
          path: p.name as string,
          fieldType: this.getFieldType(resolvedSchema),
          format: resolvedSchema.format as string | undefined,
          required: (p.required as boolean) || false,
          nullable: false,
          enumValues: Array.isArray(resolvedSchema.enum)
            ? resolvedSchema.enum.map(v => String(v))
            : undefined
        },
        example: p.example
      });
    }

    return params;
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
        if (schema.properties) {
          return FieldType.OBJECT;
        }
        return FieldType.OBJECT;
    }
  }

  /**
   * Parses request body schema.
   * Supports both OpenAPI 3.x (requestBody) and Swagger 2.0 (body parameter).
   */
  private parseRequestBody(
    operation: Record<string, unknown>
  ): { schema: SchemaField[] | undefined; example: unknown | undefined; required: boolean } {
    // OpenAPI 3.x: requestBody object
    const requestBody = operation.requestBody as Record<string, unknown>;
    if (requestBody) {
      return this.parseOpenAPI3RequestBody(requestBody);
    }

    // Swagger 2.0: body parameter in parameters array
    const parameters = (operation.parameters as unknown[]) || [];
    console.log('[Parser] parseRequestBody - looking for body param in', parameters.length, 'parameters');
    for (const param of parameters) {
      const p = this.resolver.resolve(param) as Record<string, unknown>;
      console.log('[Parser] parseRequestBody - param in:', p?.in);
      if (p && p.in === 'body') {
        console.log('[Parser] parseRequestBody - found body param!');
        return this.parseSwagger2BodyParam(p);
      }
    }
    console.log('[Parser] parseRequestBody - no body param found');

    return { schema: undefined, example: undefined, required: false };
  }

  /**
   * Parses OpenAPI 3.x requestBody.
   */
  private parseOpenAPI3RequestBody(
    requestBody: Record<string, unknown>
  ): { schema: SchemaField[] | undefined; example: unknown | undefined; required: boolean } {
    const resolved = this.resolver.resolve(requestBody) as Record<string, unknown>;
    const content = resolved.content as Record<string, unknown> || {};
    const jsonContent = content['application/json'] as Record<string, unknown>;

    if (!jsonContent?.schema) {
      return { schema: undefined, example: undefined, required: (resolved.required as boolean) || false };
    }

    const schema = this.resolver.resolve(jsonContent.schema) as Record<string, unknown>;
    const fields = this.visitor.visit(schema);

    // Extract example from multiple possible locations
    let example: unknown = undefined;

    // 1. Check for example in media type (OpenAPI 3.x)
    if (jsonContent.example !== undefined) {
      example = jsonContent.example;
    }
    // 2. Check for examples in media type (OpenAPI 3.x - first example)
    else if (jsonContent.examples && typeof jsonContent.examples === 'object') {
      const examples = jsonContent.examples as Record<string, Record<string, unknown>>;
      const firstExample = Object.values(examples)[0];
      if (firstExample?.value !== undefined) {
        example = firstExample.value;
      }
    }
    // 3. Check for example in schema itself
    else if (schema.example !== undefined) {
      example = schema.example;
    }

    return {
      schema: fields,
      example,
      required: (resolved.required as boolean) || false
    };
  }

  /**
   * Parses Swagger 2.0 body parameter.
   */
  private parseSwagger2BodyParam(
    param: Record<string, unknown>
  ): { schema: SchemaField[] | undefined; example: unknown | undefined; required: boolean } {
    const paramSchema = param.schema as Record<string, unknown>;
    console.log('[Parser] parseSwagger2BodyParam - paramSchema:', JSON.stringify(paramSchema));
    if (!paramSchema) {
      return { schema: undefined, example: undefined, required: (param.required as boolean) || false };
    }

    const resolved = this.resolver.resolve(paramSchema) as Record<string, unknown>;
    console.log('[Parser] parseSwagger2BodyParam - resolved properties:', resolved?.properties ? Object.keys(resolved.properties as object) : 'none');
    const fields = this.visitor.visit(resolved);
    console.log('[Parser] parseSwagger2BodyParam - fields count:', fields.length, 'fields:', fields.map(f => f.name));

    // Extract example
    let example: unknown = undefined;
    if (resolved.example !== undefined) {
      example = resolved.example;
    }

    return {
      schema: fields,
      example,
      required: (param.required as boolean) || false
    };
  }

  /**
   * Parses response schema.
   */
  private parseResponse(
    operation: Record<string, unknown>
  ): { statusCode: number; fields: SchemaField[]; hasSchema: boolean } {
    const responses = operation.responses as Record<string, unknown> || {};

    // Find success response
    let successResponse: Record<string, unknown> | undefined;
    let statusCode = 200;

    for (const code of SUCCESS_CODES) {
      if (responses[code]) {
        successResponse = this.resolver.resolve(responses[code]) as Record<string, unknown>;
        statusCode = parseInt(code, 10);
        break;
      }
    }

    if (!successResponse) {
      return { statusCode: 200, fields: [], hasSchema: false };
    }

    // ==============================================
    // Swagger 2.0: schema directly on response
    // ==============================================
    const swagger2Schema = successResponse.schema as Record<string, unknown>;
    if (swagger2Schema) {
      const resolved = this.resolver.resolve(swagger2Schema) as Record<string, unknown>;
      const hasProperties = !!(resolved.properties || resolved.items || resolved.type);
      if (hasProperties) {
        const fields = this.visitor.visit(resolved);
        return { statusCode, fields, hasSchema: fields.length > 0 };
      }
    }

    // ==============================================
    // OpenAPI 3.x: schema in content['application/json']
    // ==============================================
    const content = successResponse.content as Record<string, unknown> || {};
    const jsonContent = content['application/json'] as Record<string, unknown>;

    if (!jsonContent?.schema) {
      return { statusCode, fields: [], hasSchema: false };
    }

    const schema = this.resolver.resolve(jsonContent.schema) as Record<string, unknown>;

    // Check if schema has actual properties
    const hasProperties = !!(schema.properties || schema.items || schema.type);
    if (!hasProperties) {
      return { statusCode, fields: [], hasSchema: false };
    }

    const fields = this.visitor.visit(schema);

    return {
      statusCode,
      fields,
      hasSchema: fields.length > 0
    };
  }

  /**
   * Parses security requirements.
   */
  private parseSecurity(operation: Record<string, unknown>): SecurityRequirement[] | undefined {
    const security = operation.security as Array<Record<string, unknown>> ||
                     this.spec.security as Array<Record<string, unknown>>;

    if (!security || security.length === 0) {
      return undefined;
    }

    const securitySchemes =
      ((this.spec.components as Record<string, unknown>)?.securitySchemes as Record<string, unknown>) ||
      (this.spec.securityDefinitions as Record<string, unknown>) || {};

    const requirements: SecurityRequirement[] = [];

    for (const req of security) {
      for (const schemeName of Object.keys(req)) {
        const scheme = securitySchemes[schemeName] as Record<string, unknown>;
        if (!scheme) continue;

        requirements.push({
          type: scheme.type as 'apiKey' | 'http' | 'oauth2',
          scheme: scheme.scheme as string | undefined,
          name: scheme.name as string | undefined,
          in: scheme.in as string | undefined
        });
      }
    }

    return requirements.length > 0 ? requirements : undefined;
  }
}

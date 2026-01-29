package com.pe4king.core.parser

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import com.pe4king.core.models.*
import com.pe4king.core.schema.SchemaVisitor
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.Operation
import io.swagger.v3.oas.models.PathItem
import io.swagger.v3.oas.models.media.Schema
import io.swagger.v3.oas.models.parameters.Parameter
import io.swagger.parser.OpenAPIParser as SwaggerParser
import io.swagger.v3.parser.core.models.ParseOptions
import java.io.File

/**
 * Parser for OpenAPI 3.x and Swagger 2.0 specifications.
 * Uses swagger-parser library for robust parsing.
 */
class OpenApiParser {

    private val yamlMapper = ObjectMapper(YAMLFactory()).registerKotlinModule()
    private val jsonMapper = ObjectMapper().registerKotlinModule().apply {
        enable(SerializationFeature.INDENT_OUTPUT)
    }

    companion object {
        private val SUCCESS_CODES = listOf("200", "201", "202", "204")
        private val HTTP_METHODS = listOf(
            PathItem.HttpMethod.GET,
            PathItem.HttpMethod.POST,
            PathItem.HttpMethod.PUT,
            PathItem.HttpMethod.PATCH,
            PathItem.HttpMethod.DELETE
        )
    }

    /**
     * Parse an OpenAPI specification from a file path.
     * Supports both OpenAPI 3.x and Swagger 2.0 (auto-converts to 3.0).
     */
    fun parse(specPath: String): ParseResult {
        return try {
            val parseOptions = ParseOptions().apply {
                isResolve = true
                isResolveFully = true
            }

            val file = File(specPath)
            if (!file.exists()) {
                return ParseResult.Error("File not found: $specPath")
            }

            // Read content and use OpenAPIParser (handles both Swagger 2.0 and OpenAPI 3.x)
            val content = file.readText()
            val result = SwaggerParser().readContents(content, null, parseOptions)

            if (result.openAPI == null) {
                val errors = result.messages?.joinToString("\n") ?: "Unknown parse error"
                return ParseResult.Error(errors, result.messages ?: emptyList())
            }

            parseOpenAPI(result.openAPI, specPath)
        } catch (e: Exception) {
            ParseResult.Error("Failed to parse spec: ${e.message}")
        }
    }

    /**
     * Parse an OpenAPI specification from content string.
     */
    fun parseContent(content: String, format: String): ParseResult {
        return try {
            val parseOptions = ParseOptions().apply {
                isResolve = true
                isResolveFully = true
            }

            val result = SwaggerParser().readContents(content, null, parseOptions)

            if (result.openAPI == null) {
                val errors = result.messages?.joinToString("\n") ?: "Unknown parse error"
                return ParseResult.Error(errors, result.messages ?: emptyList())
            }

            parseOpenAPI(result.openAPI, "content")
        } catch (e: Exception) {
            ParseResult.Error("Failed to parse spec: ${e.message}")
        }
    }

    /**
     * Parse the OpenAPI object into our model.
     */
    private fun parseOpenAPI(api: OpenAPI, source: String): ParseResult.Success {
        val title = api.info?.title ?: "API"
        val version = api.info?.version ?: "1.0.0"
        val baseUrl = extractBaseUrl(api)

        val endpoints = mutableListOf<EndpointInfo>()

        api.paths?.forEach { (path, pathItem) ->
            HTTP_METHODS.forEach { method ->
                val operation = pathItem.readOperationsMap()[method]
                if (operation != null) {
                    val endpoint = parseEndpoint(path, method, operation, pathItem, api)
                    endpoints.add(endpoint)
                }
            }
        }

        return ParseResult.Success(
            title = title,
            version = version,
            baseUrl = baseUrl,
            endpoints = endpoints
        )
    }

    /**
     * Extract base URL from spec.
     */
    private fun extractBaseUrl(api: OpenAPI): String {
        // OpenAPI 3.x: servers array
        api.servers?.firstOrNull()?.url?.let { return it }

        // Default
        return "http://localhost:8080"
    }

    /**
     * Parse a single endpoint.
     */
    private fun parseEndpoint(
        path: String,
        method: PathItem.HttpMethod,
        operation: Operation,
        pathItem: PathItem,
        api: OpenAPI
    ): EndpointInfo {
        val visitor = SchemaVisitor()

        // Combine path-level and operation-level parameters
        val allParams = mutableListOf<Parameter>()
        pathItem.parameters?.let { allParams.addAll(it) }
        operation.parameters?.let { allParams.addAll(it) }

        // Parse parameters by location
        val pathParams = mutableListOf<ParameterInfo>()
        val queryParams = mutableListOf<ParameterInfo>()
        val headerParams = mutableListOf<ParameterInfo>()
        val formDataParams = mutableListOf<ParameterInfo>()

        allParams.forEach { param ->
            val paramInfo = parseParameter(param)
            when (param.`in`) {
                "path" -> pathParams.add(paramInfo)
                "query" -> queryParams.add(paramInfo)
                "header" -> headerParams.add(paramInfo)
                "formData" -> formDataParams.add(paramInfo)
            }
        }

        // Parse request body
        val (requestBodySchema, requestBodyExample, requestBodyRequired) = parseRequestBody(operation, visitor)

        // Parse response
        val (successStatus, responseFields, hasResponseSchema) = parseResponse(operation, visitor)

        // Parse security
        val security = parseSecurity(operation, api)

        return EndpointInfo(
            method = HttpMethod.valueOf(method.name),
            path = path,
            operationId = operation.operationId,
            summary = operation.summary,
            description = operation.description,
            tags = operation.tags ?: emptyList(),
            pathParams = pathParams,
            queryParams = queryParams,
            headerParams = headerParams,
            formDataParams = formDataParams,
            requestBodySchema = requestBodySchema,
            requestBodyExample = requestBodyExample,
            requestBodyRequired = requestBodyRequired,
            successStatus = successStatus,
            responseFields = responseFields,
            hasResponseSchema = hasResponseSchema,
            security = security
        )
    }

    /**
     * Parse a single parameter.
     */
    private fun parseParameter(param: Parameter): ParameterInfo {
        val schema = param.schema

        val schemaField = SchemaField(
            name = param.name,
            path = param.name,
            fieldType = FieldType.fromString(schema?.type),
            format = schema?.format,
            required = param.required ?: (param.`in` == "path"),
            nullable = schema?.nullable ?: false,
            enumValues = schema?.enum?.map { it.toString() },
            description = param.description
        )

        return ParameterInfo(
            name = param.name,
            location = ParameterIn.valueOf(param.`in`.uppercase()),
            required = param.required ?: (param.`in` == "path"),
            schema = schemaField,
            example = param.example ?: schema?.example
        )
    }

    /**
     * Parse request body.
     */
    private fun parseRequestBody(
        operation: Operation,
        visitor: SchemaVisitor
    ): Triple<List<SchemaField>, Any?, Boolean> {
        val requestBody = operation.requestBody ?: return Triple(emptyList(), null, false)

        val jsonContent = requestBody.content?.get("application/json")
            ?: requestBody.content?.values?.firstOrNull()
            ?: return Triple(emptyList(), requestBody.required ?: false, false)

        val schema = jsonContent.schema ?: return Triple(emptyList(), null, requestBody.required ?: false)

        @Suppress("UNCHECKED_CAST")
        val schemaCast = schema as Schema<Any>
        val fields = visitor.visit(schemaCast, "$")

        // Extract example or generate from schema
        val rawExample = jsonContent.example
            ?: jsonContent.examples?.values?.firstOrNull()?.value
            ?: schema.example
            ?: visitor.generateExample(schemaCast)

        // IMPORTANT: Convert example to JSON string immediately!
        // Swagger Parser returns special Map types with toString() format like {id=0, category={...}}
        // We need to serialize to JSON and then store as String for proper display
        val example = convertExampleToJsonString(rawExample)

        return Triple(fields, example, requestBody.required ?: false)
    }

    /**
     * Convert example object to properly formatted JSON string.
     * Swagger Parser returns LinkedHashMap subclasses with non-JSON toString().
     * This converts them to standard JSON format.
     */
    private fun convertExampleToJsonString(example: Any?): String? {
        if (example == null) return null
        
        return try {
            // First convert to plain types (handles Swagger's special Map implementations)
            val plainExample = convertToPlainTypes(example)
            // Then serialize to JSON string
            jsonMapper.writeValueAsString(plainExample)
        } catch (e: Exception) {
            // Fallback: try direct serialization
            try {
                jsonMapper.writeValueAsString(example)
            } catch (e2: Exception) {
                // Last resort: just toString (will be ugly but at least not crash)
                example.toString()
            }
        }
    }

    /**
     * Recursively convert Swagger objects to plain Map/List/primitives.
     * Swagger Parser uses special LinkedHashMap subclasses that have 
     * non-standard toString() behavior.
     */
    private fun convertToPlainTypes(obj: Any?): Any? {
        return when (obj) {
            null -> null
            is String -> obj
            is Number -> obj
            is Boolean -> obj
            is Map<*, *> -> {
                val result = linkedMapOf<String, Any?>()
                for ((key, value) in obj.entries) {
                    if (key != null) {
                        result[key.toString()] = convertToPlainTypes(value)
                    }
                }
                result
            }
            is Iterable<*> -> obj.map { convertToPlainTypes(it) }
            is Array<*> -> obj.map { convertToPlainTypes(it) }
            else -> obj.toString()
        }
    }

    /**
     * Parse response schema.
     */
    private fun parseResponse(
        operation: Operation,
        visitor: SchemaVisitor
    ): Triple<Int, List<SchemaField>, Boolean> {
        val responses = operation.responses ?: return Triple(200, emptyList(), false)

        // Find success response
        var successResponse: io.swagger.v3.oas.models.responses.ApiResponse? = null
        var statusCode = 200

        for (code in SUCCESS_CODES) {
            responses[code]?.let {
                successResponse = it
                statusCode = code.toInt()
                return@let
            }
        }

        if (successResponse == null) {
            return Triple(200, emptyList(), false)
        }

        val jsonContent = successResponse!!.content?.get("application/json")
            ?: successResponse!!.content?.values?.firstOrNull()
            ?: return Triple(statusCode, emptyList(), false)

        val schema = jsonContent.schema ?: return Triple(statusCode, emptyList(), false)

        val fields = visitor.visit(schema as Schema<Any>, "$")

        return Triple(statusCode, fields, fields.isNotEmpty())
    }

    /**
     * Parse security requirements.
     */
    private fun parseSecurity(operation: Operation, api: OpenAPI): List<SecurityRequirement> {
        val securityReqs = operation.security ?: api.security ?: return emptyList()
        val securitySchemes = api.components?.securitySchemes ?: return emptyList()

        val requirements = mutableListOf<SecurityRequirement>()

        for (req in securityReqs) {
            for (schemeName in req.keys) {
                val scheme = securitySchemes[schemeName] ?: continue

                val secType = when (scheme.type?.toString()?.lowercase()) {
                    "apikey" -> SecurityType.API_KEY
                    "http" -> SecurityType.HTTP
                    "oauth2" -> SecurityType.OAUTH2
                    "openidconnect" -> SecurityType.OPEN_ID_CONNECT
                    else -> SecurityType.API_KEY
                }

                requirements.add(SecurityRequirement(
                    type = secType,
                    scheme = scheme.scheme,
                    name = scheme.name,
                    location = scheme.`in`?.toString()
                ))
            }
        }

        return requirements
    }
}

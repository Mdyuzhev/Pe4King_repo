package com.pe4king.core.models

/**
 * Information about a single API endpoint extracted from OpenAPI spec.
 */
data class EndpointInfo(
    /** HTTP method */
    val method: HttpMethod,

    /** URL path with path parameters: /users/{id} */
    val path: String,

    /** Operation ID from spec */
    val operationId: String? = null,

    /** Summary from spec */
    val summary: String? = null,

    /** Description from spec */
    val description: String? = null,

    /** Tags for grouping */
    val tags: List<String> = emptyList(),

    // Request parameters
    val pathParams: List<ParameterInfo> = emptyList(),
    val queryParams: List<ParameterInfo> = emptyList(),
    val headerParams: List<ParameterInfo> = emptyList(),
    val formDataParams: List<ParameterInfo> = emptyList(),

    /** Content types (Swagger 2.0 consumes) */
    val consumes: List<String> = emptyList(),

    /** Request body schema fields */
    val requestBodySchema: List<SchemaField> = emptyList(),

    /** Request body example */
    val requestBodyExample: Any? = null,

    /** Whether request body is required */
    val requestBodyRequired: Boolean = false,

    // Response
    /** Success status code (usually 200 or 201) */
    val successStatus: Int = 200,

    /** Response schema fields */
    val responseFields: List<SchemaField> = emptyList(),

    /** Whether endpoint has a response schema */
    val hasResponseSchema: Boolean = false,

    /** Security requirements */
    val security: List<SecurityRequirement> = emptyList()
) {
    /**
     * Get a safe operation ID for naming test methods.
     */
    fun safeOperationId(): String {
        return operationId
            ?: "${method.name.lowercase()}${path.replace("/", "_").replace("{", "").replace("}", "")}"
    }

    /**
     * Get all parameters.
     */
    fun allParams(): List<ParameterInfo> {
        return pathParams + queryParams + headerParams + formDataParams
    }

    /**
     * Get required parameters.
     */
    fun requiredParams(): List<ParameterInfo> {
        return allParams().filter { it.required }
    }

    /**
     * Get the primary tag or "default".
     */
    fun primaryTag(): String = tags.firstOrNull() ?: "default"
}

/**
 * Parameter information.
 */
data class ParameterInfo(
    /** Parameter name */
    val name: String,

    /** Parameter location */
    val location: ParameterIn,

    /** Whether parameter is required */
    val required: Boolean,

    /** Parameter schema */
    val schema: SchemaField,

    /** Example value */
    val example: Any? = null
)

/**
 * Security requirement.
 */
data class SecurityRequirement(
    /** Security type */
    val type: SecurityType,

    /** Scheme (bearer, basic) for HTTP auth */
    val scheme: String? = null,

    /** Header/query param name for API key */
    val name: String? = null,

    /** Location for API key (header, query) */
    val location: String? = null
)

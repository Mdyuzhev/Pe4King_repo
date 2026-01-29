package com.pe4king.core.parser

import com.pe4king.core.models.EndpointInfo

/**
 * Result of parsing an OpenAPI specification.
 */
sealed class ParseResult {

    /**
     * Successful parse result.
     */
    data class Success(
        /** API title */
        val title: String,

        /** API version */
        val version: String,

        /** Base URL for API calls */
        val baseUrl: String,

        /** Parsed endpoints */
        val endpoints: List<EndpointInfo>
    ) : ParseResult()

    /**
     * Parse error.
     */
    data class Error(
        /** Error message */
        val message: String,

        /** Detailed errors (if any) */
        val details: List<String> = emptyList()
    ) : ParseResult()
}

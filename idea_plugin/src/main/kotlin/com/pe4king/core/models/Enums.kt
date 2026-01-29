package com.pe4king.core.models

/**
 * HTTP methods supported by the generator.
 */
enum class HttpMethod {
    GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
}

/**
 * Schema field types.
 */
enum class FieldType {
    STRING, INTEGER, NUMBER, BOOLEAN, ARRAY, OBJECT, NULL, ANY;

    companion object {
        fun fromString(type: String?): FieldType {
            return when (type?.lowercase()) {
                "string" -> STRING
                "integer" -> INTEGER
                "number" -> NUMBER
                "boolean" -> BOOLEAN
                "array" -> ARRAY
                "object" -> OBJECT
                "null" -> NULL
                else -> ANY
            }
        }
    }
}

/**
 * Matcher types for assertions.
 */
enum class MatcherType {
    NOT_NULL,
    IS_NULL,
    EQUALS,
    NOT_EQUALS,
    CONTAINS,
    MATCHES_PATTERN,
    ONE_OF,
    IS_TYPE,
    NOT_EMPTY,
    IS_EMPTY,
    GREATER_THAN,
    GREATER_THAN_OR_EQUAL,
    LESS_THAN,
    LESS_THAN_OR_EQUAL,
    HAS_SIZE,
    HAS_SIZE_GREATER_THAN,
    HAS_SIZE_LESS_THAN,
    HAS_MIN_LENGTH,
    HAS_MAX_LENGTH,
    HAS_KEY,
    EVERY
}

/**
 * Parameter location.
 */
enum class ParameterIn {
    PATH, QUERY, HEADER, FORM_DATA, COOKIE
}

/**
 * Security type.
 */
enum class SecurityType {
    API_KEY, HTTP, OAUTH2, OPEN_ID_CONNECT
}

/**
 * Test scenario type.
 */
enum class TestType {
    POSITIVE, NEGATIVE, EDGE
}

/**
 * Output format for test generation.
 */
enum class OutputFormat {
    PYTEST, REST_ASSURED, POSTMAN, COLLECTION, TESTCASES
}

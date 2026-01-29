package com.pe4king.core.models

/**
 * Complete test model that can be rendered to any framework.
 */
data class TestModel(
    /** Metadata about the generation */
    val meta: TestMeta,

    /** Generator configuration */
    val config: GeneratorConfig,

    /** All endpoint tests */
    val endpoints: List<EndpointTest>
)

/**
 * Test generation metadata.
 */
data class TestMeta(
    /** Source file path */
    val source: String,

    /** Generation timestamp */
    val generatedAt: String,

    /** Generator version */
    val version: String = "1.0.0",

    /** API title from spec */
    val specTitle: String,

    /** API version from spec */
    val specVersion: String
)

/**
 * Generator configuration.
 */
data class GeneratorConfig(
    /** Base URL for tests */
    val baseUrl: String,

    /** Output framework */
    val framework: OutputFormat,

    /** Python package name */
    val pythonPackage: String? = null,

    /** Java package name */
    val javaPackage: String? = null,

    /** Generate negative tests */
    val generateNegativeTests: Boolean = true,

    /** Generate edge case tests */
    val generateEdgeCases: Boolean = true,

    /** Use placeholders for dynamic values (false = generate sample values) */
    val usePlaceholders: Boolean = false
)

/**
 * Tests for a single endpoint.
 */
data class EndpointTest(
    /** The endpoint being tested */
    val endpoint: EndpointInfo,

    /** Test scenarios */
    val scenarios: List<TestScenario>
)

/**
 * A single test scenario.
 */
data class TestScenario(
    /** Unique name for the test method */
    val name: String,

    /** Human-readable display name */
    val displayName: String,

    /** Test type */
    val type: TestType,

    /** Request configuration */
    val request: TestRequest,

    /** Expected response */
    val expected: ExpectedResponse,

    /** Whether test is disabled */
    val disabled: Boolean = false,

    /** Reason for disabling */
    val disabledReason: String? = null
)

/**
 * Test request configuration.
 */
data class TestRequest(
    val pathParams: Map<String, String> = emptyMap(),
    val queryParams: Map<String, String> = emptyMap(),
    val headers: Map<String, String> = emptyMap(),
    val body: Any? = null
)

/**
 * Expected response.
 */
data class ExpectedResponse(
    /** Expected status code */
    val statusCode: Int,

    /** Expected content type */
    val contentType: String? = null,

    /** Assertions to verify */
    val assertions: List<Assertion>
)

/**
 * Negative test definition.
 */
data class NegativeTest(
    /** Test name */
    val name: String,

    /** Description */
    val description: String,

    /** Parameter being tested */
    val parameter: String,

    /** Invalid value to send */
    val invalidValue: Any?,

    /** Expected status code */
    val expectedStatus: Int,

    /** Reason for the test */
    val reason: String
)

/**
 * Generation result.
 */
data class GenerationResult(
    /** Whether generation succeeded */
    val success: Boolean,

    /** Generated files */
    val files: List<GeneratedFile>,

    /** Statistics */
    val stats: GenerationStats,

    /** Errors encountered */
    val errors: List<String> = emptyList(),

    /** Warnings */
    val warnings: List<String> = emptyList(),

    /** Collection name (for COLLECTION format) */
    val collectionName: String? = null
)

/**
 * A generated file.
 */
data class GeneratedFile(
    /** File name */
    val filename: String,

    /** File content */
    val content: String,

    /** Programming language */
    val language: String
)

/**
 * Generation statistics.
 */
data class GenerationStats(
    val totalEndpoints: Int,
    val totalTests: Int,
    val positiveTests: Int,
    val negativeTests: Int,
    val assertions: Int
)

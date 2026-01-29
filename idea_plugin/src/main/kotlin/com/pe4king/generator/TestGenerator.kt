package com.pe4king.generator

import com.pe4king.core.models.*
import java.time.Instant

/**
 * Main test generator.
 * Converts EndpointInfo to TestModel with assertions and negative tests.
 */
class TestGenerator {

    /**
     * Generates test model for a single endpoint.
     */
    fun generateForEndpoint(endpoint: EndpointInfo, config: GeneratorConfig): EndpointTest {
        val scenarios = buildScenarios(endpoint, config)
        return EndpointTest(endpoint, scenarios)
    }

    /**
     * Generates complete test model for multiple endpoints.
     */
    fun generate(
        endpoints: List<EndpointInfo>,
        specTitle: String,
        specVersion: String,
        config: GeneratorConfig
    ): TestModel {
        val endpointTests = endpoints.map { generateForEndpoint(it, config) }

        return TestModel(
            meta = TestMeta(
                source = "OpenAPI Spec",
                generatedAt = Instant.now().toString(),
                specTitle = specTitle,
                specVersion = specVersion
            ),
            config = config,
            endpoints = endpointTests
        )
    }

    /**
     * Builds all test scenarios for an endpoint.
     */
    private fun buildScenarios(endpoint: EndpointInfo, config: GeneratorConfig): List<TestScenario> {
        val scenarios = mutableListOf<TestScenario>()

        // Positive scenario
        scenarios.add(buildPositiveScenario(endpoint, config))

        // Negative scenarios
        if (config.generateNegativeTests) {
            scenarios.addAll(buildNegativeScenarios(endpoint))
        }

        return scenarios
    }

    /**
     * Builds positive (happy path) scenario.
     */
    private fun buildPositiveScenario(endpoint: EndpointInfo, config: GeneratorConfig): TestScenario {
        val testName = generateTestName(endpoint)

        // Build request params
        val pathParams = endpoint.pathParams.associate { param ->
            param.name to if (config.usePlaceholders) {
                "\${${param.name.uppercase()}}"
            } else {
                generateSampleValue(param.schema).toString()
            }
        }

        val queryParams = endpoint.queryParams.associate { param ->
            param.name to (param.example?.toString()
                ?: param.schema.enumValues?.firstOrNull()?.toString()
                ?: generateSampleValue(param.schema).toString())
        }

        // Build request body
        val body = if (endpoint.requestBodySchema.isNotEmpty()) {
            buildRequestBody(endpoint.requestBodySchema)
        } else null

        // Build assertions
        val assertions = buildAssertions(endpoint)

        return TestScenario(
            name = testName,
            displayName = "${endpoint.method} ${endpoint.path}",
            type = TestType.POSITIVE,
            request = TestRequest(
                pathParams = pathParams,
                queryParams = queryParams,
                body = body
            ),
            expected = ExpectedResponse(
                statusCode = endpoint.successStatus,
                contentType = "application/json",
                assertions = assertions
            )
        )
    }

    /**
     * Builds negative test scenarios.
     */
    private fun buildNegativeScenarios(endpoint: EndpointInfo): List<TestScenario> {
        val scenarios = mutableListOf<TestScenario>()
        val baseName = generateTestName(endpoint)

        // 404 Not Found (for endpoints with path params)
        if (endpoint.pathParams.isNotEmpty()) {
            scenarios.add(TestScenario(
                name = "${baseName}_not_found",
                displayName = "${endpoint.method} ${endpoint.path} - Not Found",
                type = TestType.NEGATIVE,
                request = TestRequest(),
                expected = ExpectedResponse(statusCode = 404, assertions = emptyList())
            ))
        }

        // 400 Bad Request (for endpoints with required body)
        if (endpoint.requestBodyRequired) {
            scenarios.add(TestScenario(
                name = "${baseName}_empty_body",
                displayName = "${endpoint.method} ${endpoint.path} - Empty Body",
                type = TestType.NEGATIVE,
                request = TestRequest(body = emptyMap<String, Any>()),
                expected = ExpectedResponse(statusCode = 400, assertions = emptyList())
            ))
        }

        // 401 Unauthorized (if security defined)
        if (endpoint.security.isNotEmpty()) {
            scenarios.add(TestScenario(
                name = "${baseName}_unauthorized",
                displayName = "${endpoint.method} ${endpoint.path} - Unauthorized",
                type = TestType.NEGATIVE,
                request = TestRequest(),
                expected = ExpectedResponse(statusCode = 401, assertions = emptyList())
            ))
        }

        // Constraint-based negative tests
        if (endpoint.requestBodySchema.isNotEmpty()) {
            scenarios.addAll(buildConstraintViolationTests(endpoint, baseName))
        }

        return scenarios
    }

    /**
     * Builds constraint violation tests.
     */
    private fun buildConstraintViolationTests(endpoint: EndpointInfo, baseName: String): List<TestScenario> {
        val scenarios = mutableListOf<TestScenario>()
        val fields = endpoint.requestBodySchema
        val testableFields = fields.filter { !it.path.contains(".") }.take(5)

        for (field in testableFields) {
            // Invalid enum
            if (!field.enumValues.isNullOrEmpty()) {
                scenarios.add(TestScenario(
                    name = "${baseName}_invalid_enum_${sanitizeName(field.name)}",
                    displayName = "${endpoint.method} ${endpoint.path} - Invalid ${field.name} enum",
                    type = TestType.NEGATIVE,
                    request = TestRequest(body = buildBodyWithField(fields, field.name, "INVALID_ENUM_VALUE")),
                    expected = ExpectedResponse(statusCode = 400, assertions = emptyList())
                ))
            }

            // Below minimum
            field.minimum?.let { min ->
                scenarios.add(TestScenario(
                    name = "${baseName}_below_min_${sanitizeName(field.name)}",
                    displayName = "${endpoint.method} ${endpoint.path} - ${field.name} below minimum",
                    type = TestType.NEGATIVE,
                    request = TestRequest(body = buildBodyWithField(fields, field.name, min.toInt() - 1)),
                    expected = ExpectedResponse(statusCode = 400, assertions = emptyList())
                ))
            }

            // Above maximum
            field.maximum?.let { max ->
                scenarios.add(TestScenario(
                    name = "${baseName}_above_max_${sanitizeName(field.name)}",
                    displayName = "${endpoint.method} ${endpoint.path} - ${field.name} above maximum",
                    type = TestType.NEGATIVE,
                    request = TestRequest(body = buildBodyWithField(fields, field.name, max.toInt() + 1)),
                    expected = ExpectedResponse(statusCode = 400, assertions = emptyList())
                ))
            }

            // String too short
            field.minLength?.let { minLen ->
                if (minLen > 0) {
                    val tooShort = if (minLen > 1) "x".repeat(minLen - 1) else ""
                    scenarios.add(TestScenario(
                        name = "${baseName}_too_short_${sanitizeName(field.name)}",
                        displayName = "${endpoint.method} ${endpoint.path} - ${field.name} too short",
                        type = TestType.NEGATIVE,
                        request = TestRequest(body = buildBodyWithField(fields, field.name, tooShort)),
                        expected = ExpectedResponse(statusCode = 400, assertions = emptyList())
                    ))
                }
            }

            // String too long
            field.maxLength?.let { maxLen ->
                val tooLong = "x".repeat(maxLen + 10)
                scenarios.add(TestScenario(
                    name = "${baseName}_too_long_${sanitizeName(field.name)}",
                    displayName = "${endpoint.method} ${endpoint.path} - ${field.name} too long",
                    type = TestType.NEGATIVE,
                    request = TestRequest(body = buildBodyWithField(fields, field.name, tooLong)),
                    expected = ExpectedResponse(statusCode = 400, assertions = emptyList())
                ))
            }

            // Missing required field
            if (field.required) {
                scenarios.add(TestScenario(
                    name = "${baseName}_missing_${sanitizeName(field.name)}",
                    displayName = "${endpoint.method} ${endpoint.path} - Missing ${field.name}",
                    type = TestType.NEGATIVE,
                    request = TestRequest(body = buildBodyWithoutField(fields, field.name)),
                    expected = ExpectedResponse(statusCode = 400, assertions = emptyList())
                ))
            }
        }

        return scenarios
    }

    /**
     * Builds assertions from response fields.
     */
    private fun buildAssertions(endpoint: EndpointInfo): List<Assertion> {
        val assertions = mutableListOf<Assertion>()

        if (endpoint.hasResponseSchema && endpoint.responseFields.isNotEmpty()) {
            val checkedArrays = mutableSetOf<String>()

            for (field in endpoint.responseFields) {
                // Add array not empty check before [0] access
                val arrayMatch = Regex("^([^\\[]+)\\[0\\]").find(field.path)
                if (arrayMatch != null) {
                    val arrayPath = arrayMatch.groupValues[1]
                    if (arrayPath !in checkedArrays) {
                        checkedArrays.add(arrayPath)
                        assertions.add(Assertion.notEmpty(arrayPath, "$arrayPath array is not empty"))
                    }
                }

                assertions.addAll(fieldToAssertions(field))
            }
        }

        // Fallback: basic body check
        if (assertions.isEmpty()) {
            assertions.add(Assertion.notNull("$", "Response body is not null"))
        }

        return assertions
    }

    /**
     * Converts field to assertions based on constraints.
     */
    private fun fieldToAssertions(field: SchemaField): List<Assertion> {
        val assertions = mutableListOf<Assertion>()

        // Skip deeply nested fields
        val depth = field.path.count { it == '.' }
        if (depth > 3) return assertions

        // Enum values -> oneOf
        if (!field.enumValues.isNullOrEmpty()) {
            assertions.add(Assertion.oneOf(field.path, field.enumValues!!))
            return assertions
        }

        // Only apply string patterns to STRING type fields
        val isStringField = field.fieldType == FieldType.STRING

        // Format-specific (only for strings)
        if (isStringField) {
            field.format?.let { format ->
                getFormatMatcher(format)?.let { assertions.add(it.copy(path = field.path)) }
            }
        }

        // Pattern (only for strings)
        if (isStringField && field.pattern != null && field.format == null) {
            assertions.add(Assertion.matchesPattern(field.path, field.pattern!!))
        }

        // Numeric constraints
        field.minimum?.let { assertions.add(Assertion.greaterThanOrEqual(field.path, it)) }
        field.maximum?.let { assertions.add(Assertion.lessThanOrEqual(field.path, it)) }

        // String length
        field.minLength?.let { if (it > 0) assertions.add(Assertion.hasMinLength(field.path, it)) }
        field.maxLength?.let { assertions.add(Assertion.hasMaxLength(field.path, it)) }

        // Try name inference
        if (assertions.isEmpty()) {
            inferFromName(field)?.let { assertions.add(it) }
        }

        // Fallback: type-based
        if (assertions.isEmpty()) {
            assertions.add(typeToAssertion(field))
        }

        return assertions
    }

    /**
     * Gets format-specific matcher.
     */
    private fun getFormatMatcher(format: String): Assertion? {
        return when (format) {
            "uuid" -> Assertion.matchesPattern("", "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
            "email" -> Assertion.contains("", "@")
            "uri", "url" -> Assertion.matchesPattern("", "^https?://")
            "date" -> Assertion.matchesPattern("", "^\\d{4}-\\d{2}-\\d{2}$")
            "date-time" -> Assertion.matchesPattern("", "^\\d{4}-\\d{2}-\\d{2}")
            else -> null
        }
    }

    /**
     * Infers matcher from field name.
     * Only applies string patterns to STRING fields.
     */
    private fun inferFromName(field: SchemaField): Assertion? {
        val name = field.name.lowercase()
        val isString = field.fieldType == FieldType.STRING

        return when {
            name == "id" || name.endsWith("_id") || name.endsWith("id") ->
                Assertion.notNull(field.path)
            isString && name.contains("email") ->
                Assertion.contains(field.path, "@")
            isString && (name.contains("url") || name.contains("link")) ->
                Assertion.matchesPattern(field.path, "^https?://")
            isString && (name.endsWith("_at") || name.contains("date")) ->
                Assertion.matchesPattern(field.path, "^\\d{4}-\\d{2}-\\d{2}")
            name.contains("count") || name.contains("total") ->
                Assertion.greaterThanOrEqual(field.path, 0)
            else -> null
        }
    }

    /**
     * Type-based assertion fallback.
     */
    private fun typeToAssertion(field: SchemaField): Assertion {
        return when (field.fieldType) {
            FieldType.ARRAY -> Assertion.notEmpty(field.path)
            FieldType.BOOLEAN -> Assertion(field.path, MatcherType.IS_TYPE, FieldType.BOOLEAN)
            FieldType.INTEGER, FieldType.NUMBER -> Assertion(field.path, MatcherType.IS_TYPE, FieldType.NUMBER)
            else -> Assertion.notNull(field.path)
        }
    }

    /**
     * Builds request body from schema fields.
     */
    private fun buildRequestBody(fields: List<SchemaField>): Map<String, Any?> {
        val body = mutableMapOf<String, Any?>()

        for (field in fields) {
            if (field.required && !field.path.contains(".")) {
                body[field.name] = generateSampleValue(field)
            }
        }

        return body
    }

    /**
     * Builds body with one field set to specific value.
     */
    private fun buildBodyWithField(fields: List<SchemaField>, targetField: String, value: Any): Map<String, Any?> {
        val body = mutableMapOf<String, Any?>()

        for (field in fields) {
            if (!field.path.contains(".") && field.required && field.name != targetField) {
                body[field.name] = generateSampleValue(field)
            }
        }

        body[targetField] = value
        return body
    }

    /**
     * Builds body without specific field.
     */
    private fun buildBodyWithoutField(fields: List<SchemaField>, excludeField: String): Map<String, Any?> {
        val body = mutableMapOf<String, Any?>()

        for (field in fields) {
            if (!field.path.contains(".") && field.required && field.name != excludeField) {
                body[field.name] = generateSampleValue(field)
            }
        }

        return body
    }

    /**
     * Generates sample value for a field.
     */
    private fun generateSampleValue(field: SchemaField): Any? {
        field.enumValues?.firstOrNull()?.let { return it }

        return when (field.format) {
            "uuid" -> "\${UUID}"
            "email" -> "test@example.com"
            "date" -> "2024-01-01"
            "date-time" -> "2024-01-01T00:00:00Z"
            "uri", "url" -> "https://example.com"
            else -> when (field.fieldType) {
                FieldType.STRING -> "Test ${field.name}"
                FieldType.INTEGER -> 1
                FieldType.NUMBER -> 1.0
                FieldType.BOOLEAN -> true
                FieldType.ARRAY -> emptyList<Any>()
                FieldType.OBJECT -> emptyMap<String, Any>()
                else -> null
            }
        }
    }

    /**
     * Generates test name from endpoint.
     */
    private fun generateTestName(endpoint: EndpointInfo): String {
        endpoint.operationId?.let {
            return "test_${toSnakeCase(it)}"
        }

        val pathParts = endpoint.path
            .replace(Regex("\\{(\\w+)\\}"), "by_$1")
            .split("/")
            .filter { it.isNotEmpty() }
            .joinToString("_") { toSnakeCase(it) }

        return "test_${endpoint.method.name.lowercase()}_$pathParts"
    }

    private fun toSnakeCase(str: String): String {
        return str
            .replace(Regex("([A-Z])"), "_$1")
            .lowercase()
            .removePrefix("_")
            .replace("-", "_")
            .replace(Regex("_+"), "_")
    }

    private fun sanitizeName(name: String): String {
        return name.replace(Regex("[^a-zA-Z0-9]"), "_").lowercase()
    }
}

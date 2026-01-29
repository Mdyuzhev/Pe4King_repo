package com.pe4king.collections

import com.pe4king.collections.models.*

/**
 * Pre-defined test snippets library (like Postman Snippets).
 */
object SnippetLibrary {

    /**
     * Snippet definition with display info.
     */
    data class SnippetDefinition(
        val type: TestSnippetType,
        val name: String,
        val description: String,
        val icon: String,
        val defaultConfig: TestSnippet
    )

    /**
     * Available snippets organized by category.
     */
    val SNIPPET_LIBRARY: Map<String, List<SnippetDefinition>> = mapOf(
        "Status" to listOf(
            SnippetDefinition(
                type = TestSnippetType.STATUS,
                name = "Status is 200",
                description = "Response status code equals 200",
                icon = "check",
                defaultConfig = TestSnippet(type = TestSnippetType.STATUS, expected = 200)
            ),
            SnippetDefinition(
                type = TestSnippetType.STATUS,
                name = "Status is 201",
                description = "Response status code equals 201 (Created)",
                icon = "check",
                defaultConfig = TestSnippet(type = TestSnippetType.STATUS, expected = 201)
            ),
            SnippetDefinition(
                type = TestSnippetType.STATUS,
                name = "Status is 204",
                description = "Response status code equals 204 (No Content)",
                icon = "check",
                defaultConfig = TestSnippet(type = TestSnippetType.STATUS, expected = 204)
            ),
            SnippetDefinition(
                type = TestSnippetType.STATUS_FAMILY,
                name = "Status is 2xx",
                description = "Response status code is successful (200-299)",
                icon = "check-all",
                defaultConfig = TestSnippet(type = TestSnippetType.STATUS_FAMILY, expected = "2xx")
            ),
            SnippetDefinition(
                type = TestSnippetType.STATUS,
                name = "Status is 400",
                description = "Response status code equals 400 (Bad Request)",
                icon = "error",
                defaultConfig = TestSnippet(type = TestSnippetType.STATUS, expected = 400)
            ),
            SnippetDefinition(
                type = TestSnippetType.STATUS,
                name = "Status is 401",
                description = "Response status code equals 401 (Unauthorized)",
                icon = "lock",
                defaultConfig = TestSnippet(type = TestSnippetType.STATUS, expected = 401)
            ),
            SnippetDefinition(
                type = TestSnippetType.STATUS,
                name = "Status is 404",
                description = "Response status code equals 404 (Not Found)",
                icon = "search",
                defaultConfig = TestSnippet(type = TestSnippetType.STATUS, expected = 404)
            )
        ),

        "Body" to listOf(
            SnippetDefinition(
                type = TestSnippetType.NOT_EMPTY,
                name = "Body is not empty",
                description = "Response body exists and is not empty",
                icon = "file",
                defaultConfig = TestSnippet(type = TestSnippetType.NOT_EMPTY)
            ),
            SnippetDefinition(
                type = TestSnippetType.HAS_JSON_BODY,
                name = "Body is JSON",
                description = "Response has application/json content type",
                icon = "json",
                defaultConfig = TestSnippet(type = TestSnippetType.HAS_JSON_BODY)
            ),
            SnippetDefinition(
                type = TestSnippetType.HAS_FIELD,
                name = "Body has field",
                description = "Response body contains specific field",
                icon = "symbol-field",
                defaultConfig = TestSnippet(type = TestSnippetType.HAS_FIELD, field = "id")
            ),
            SnippetDefinition(
                type = TestSnippetType.FIELD_NOT_NULL,
                name = "Field is not null",
                description = "Specific field exists and is not null",
                icon = "symbol-key",
                defaultConfig = TestSnippet(type = TestSnippetType.FIELD_NOT_NULL, field = "id")
            ),
            SnippetDefinition(
                type = TestSnippetType.FIELD_EQUALS,
                name = "Field equals value",
                description = "Specific field equals expected value",
                icon = "symbol-constant",
                defaultConfig = TestSnippet(type = TestSnippetType.FIELD_EQUALS, field = "status", expected = "active")
            )
        ),

        "Performance" to listOf(
            SnippetDefinition(
                type = TestSnippetType.RESPONSE_TIME,
                name = "Response time < 200ms",
                description = "Response received within 200 milliseconds",
                icon = "dashboard",
                defaultConfig = TestSnippet(type = TestSnippetType.RESPONSE_TIME, maxMs = 200)
            ),
            SnippetDefinition(
                type = TestSnippetType.RESPONSE_TIME,
                name = "Response time < 500ms",
                description = "Response received within 500 milliseconds",
                icon = "dashboard",
                defaultConfig = TestSnippet(type = TestSnippetType.RESPONSE_TIME, maxMs = 500)
            ),
            SnippetDefinition(
                type = TestSnippetType.RESPONSE_TIME,
                name = "Response time < 1s",
                description = "Response received within 1 second",
                icon = "dashboard",
                defaultConfig = TestSnippet(type = TestSnippetType.RESPONSE_TIME, maxMs = 1000)
            )
        ),

        "Headers" to listOf(
            SnippetDefinition(
                type = TestSnippetType.HEADER_EXISTS,
                name = "Has Content-Type",
                description = "Response has Content-Type header",
                icon = "list-flat",
                defaultConfig = TestSnippet(type = TestSnippetType.HEADER_EXISTS, header = "Content-Type")
            ),
            SnippetDefinition(
                type = TestSnippetType.HEADER_EXISTS,
                name = "Has Authorization",
                description = "Response has Authorization header",
                icon = "key",
                defaultConfig = TestSnippet(type = TestSnippetType.HEADER_EXISTS, header = "Authorization")
            ),
            SnippetDefinition(
                type = TestSnippetType.HEADER_EQUALS,
                name = "Content-Type is JSON",
                description = "Content-Type header equals application/json",
                icon = "json",
                defaultConfig = TestSnippet(type = TestSnippetType.HEADER_EQUALS, header = "Content-Type", expected = "application/json")
            )
        ),

        "JSONPath" to listOf(
            SnippetDefinition(
                type = TestSnippetType.ARRAY_LENGTH,
                name = "Array length equals",
                description = "Check array has exact length",
                icon = "symbol-array",
                defaultConfig = TestSnippet(type = TestSnippetType.ARRAY_LENGTH, field = "$.items", expected = 10, operator = ComparisonOperator.EQUALS)
            ),
            SnippetDefinition(
                type = TestSnippetType.ARRAY_LENGTH,
                name = "Array not empty",
                description = "Check array has items",
                icon = "symbol-array",
                defaultConfig = TestSnippet(type = TestSnippetType.ARRAY_LENGTH, field = "$.items", expected = 0, operator = ComparisonOperator.GREATER)
            ),
            SnippetDefinition(
                type = TestSnippetType.ALL_MATCH,
                name = "All items match",
                description = "All array items satisfy condition",
                icon = "check-all",
                defaultConfig = TestSnippet(type = TestSnippetType.ALL_MATCH, field = "$.items[*]", condition = "active == true")
            ),
            SnippetDefinition(
                type = TestSnippetType.ANY_MATCH,
                name = "Any item matches",
                description = "At least one item satisfies condition",
                icon = "pass",
                defaultConfig = TestSnippet(type = TestSnippetType.ANY_MATCH, field = "$.items[*]", condition = "priority == \"high\"")
            ),
            SnippetDefinition(
                type = TestSnippetType.HAS_FIELD,
                name = "Has nested field (JSONPath)",
                description = "Check field exists using JSONPath",
                icon = "symbol-field",
                defaultConfig = TestSnippet(type = TestSnippetType.HAS_FIELD, field = "$.data.users[0].email")
            )
        ),

        "Custom" to listOf(
            SnippetDefinition(
                type = TestSnippetType.CUSTOM,
                name = "Array not empty",
                description = "Check that array has items",
                icon = "symbol-array",
                defaultConfig = TestSnippet(
                    type = TestSnippetType.CUSTOM,
                    expression = "response.body.items.length > 0",
                    description = "Items array is not empty"
                )
            ),
            SnippetDefinition(
                type = TestSnippetType.CUSTOM,
                name = "Custom expression...",
                description = "Write your own expression",
                icon = "code",
                defaultConfig = TestSnippet(type = TestSnippetType.CUSTOM, expression = "", description = "")
            )
        )
    )

    /**
     * Get all snippets as flat list.
     */
    fun getAllSnippets(): List<SnippetDefinition> {
        return SNIPPET_LIBRARY.values.flatten()
    }

    /**
     * Create TestSnippet from definition.
     */
    fun createSnippetFromDefinition(def: SnippetDefinition): TestSnippet {
        return def.defaultConfig.copy(enabled = true)
    }

    /**
     * Get display name for a test snippet.
     */
    fun getSnippetDisplayName(snippet: TestSnippet): String {
        return when (snippet.type) {
            TestSnippetType.STATUS -> "Status = ${snippet.expected}"
            TestSnippetType.STATUS_FAMILY -> "Status is ${snippet.expected}"
            TestSnippetType.NOT_EMPTY -> "Body not empty"
            TestSnippetType.HAS_JSON_BODY -> "Body is JSON"
            TestSnippetType.HAS_FIELD -> "Has field \"${snippet.field}\""
            TestSnippetType.FIELD_NOT_NULL -> "\"${snippet.field}\" not null"
            TestSnippetType.FIELD_EQUALS -> "\"${snippet.field}\" = ${snippet.expected}"
            TestSnippetType.RESPONSE_TIME -> "Time < ${snippet.maxMs}ms"
            TestSnippetType.HEADER_EXISTS -> "Has header \"${snippet.header}\""
            TestSnippetType.HEADER_EQUALS -> "\"${snippet.header}\" = ${snippet.expected}"
            TestSnippetType.ARRAY_LENGTH -> "len(${snippet.field}) ${snippet.operator.symbol} ${snippet.expected}"
            TestSnippetType.ALL_MATCH -> "all(${snippet.field}) match ${snippet.condition}"
            TestSnippetType.ANY_MATCH -> "any(${snippet.field}) match ${snippet.condition}"
            TestSnippetType.CUSTOM -> snippet.description
                ?: snippet.expression?.take(30)?.plus("...")
                ?: "Custom"
        }
    }

    /**
     * Convert snippet to Python test code.
     */
    fun snippetToPython(snippet: TestSnippet): String {
        return when (snippet.type) {
            TestSnippetType.STATUS ->
                "test(response['status'] == ${snippet.expected}, 'Status should be ${snippet.expected}')"

            TestSnippetType.STATUS_FAMILY -> {
                val family = snippet.expected as String
                val start = family.first()
                "test(str(response['status']).startswith('$start'), 'Status should be $family')"
            }

            TestSnippetType.NOT_EMPTY ->
                "test(response['body'], 'Body should not be empty')"

            TestSnippetType.HAS_JSON_BODY ->
                "test('application/json' in response['headers'].get('content-type', ''), 'Should be JSON')"

            TestSnippetType.HAS_FIELD ->
                "test('${snippet.field}' in response['body'], 'Should have field \"${snippet.field}\"')"

            TestSnippetType.FIELD_NOT_NULL ->
                "test(response['body'].get('${snippet.field}') is not None, '\"${snippet.field}\" should not be null')"

            TestSnippetType.FIELD_EQUALS -> {
                val value = if (snippet.expected is String) "'${snippet.expected}'" else snippet.expected
                val expected = snippet.expected?.toString() ?: ""
                "test(response['body'].get('${snippet.field}') == $value, \"${snippet.field} should equal $expected\")"
            }

            TestSnippetType.RESPONSE_TIME ->
                "test(response['time_ms'] < ${snippet.maxMs}, 'Response time should be < ${snippet.maxMs}ms')"

            TestSnippetType.HEADER_EXISTS ->
                "test('${snippet.header?.lowercase()}' in response['headers'], 'Should have header \"${snippet.header}\"')"

            TestSnippetType.HEADER_EQUALS ->
                "test(response['headers'].get('${snippet.header?.lowercase()}') == '${snippet.expected}', '\"${snippet.header}\" should equal \"${snippet.expected}\"')"

            TestSnippetType.ARRAY_LENGTH -> {
                val op = snippet.operator.symbol
                "test(len(response['body'].get('${snippet.field}', [])) $op ${snippet.expected}, 'Array length check')"
            }

            TestSnippetType.ALL_MATCH,
            TestSnippetType.ANY_MATCH -> {
                val func = if (snippet.type == TestSnippetType.ALL_MATCH) "all" else "any"
                "# ${snippet.type}\ntest($func(...), '${snippet.type}')"
            }

            TestSnippetType.CUSTOM -> {
                val desc = (snippet.description ?: "Custom assertion").replace("\"", "\\\"")
                if (!snippet.expression.isNullOrEmpty()) {
                    "# ${snippet.description ?: "Custom test"}\ntest(${snippet.expression}, \"$desc\")"
                } else {
                    "# Custom test\ntest(True, \"Add your assertion here\")"
                }
            }
        }
    }

    /**
     * Convert snippet to REST Assured assertion.
     */
    fun snippetToRestAssured(snippet: TestSnippet): String {
        return when (snippet.type) {
            TestSnippetType.STATUS ->
                ".statusCode(${snippet.expected})"

            TestSnippetType.STATUS_FAMILY -> {
                val family = snippet.expected as String
                when (family) {
                    "2xx" -> ".statusCode(Matchers.allOf(Matchers.greaterThanOrEqualTo(200), Matchers.lessThan(300)))"
                    "4xx" -> ".statusCode(Matchers.allOf(Matchers.greaterThanOrEqualTo(400), Matchers.lessThan(500)))"
                    "5xx" -> ".statusCode(Matchers.allOf(Matchers.greaterThanOrEqualTo(500), Matchers.lessThan(600)))"
                    else -> ".statusCode(Matchers.greaterThanOrEqualTo(${family.first().digitToInt()}00))"
                }
            }

            TestSnippetType.NOT_EMPTY ->
                ".body(notNullValue())"

            TestSnippetType.HAS_JSON_BODY ->
                ".contentType(ContentType.JSON)"

            TestSnippetType.HAS_FIELD ->
                ".body(\"${snippet.field}\", notNullValue())"

            TestSnippetType.FIELD_NOT_NULL ->
                ".body(\"${snippet.field}\", notNullValue())"

            TestSnippetType.FIELD_EQUALS -> {
                val value = if (snippet.expected is String) "\"${snippet.expected}\"" else snippet.expected
                ".body(\"${snippet.field}\", equalTo($value))"
            }

            TestSnippetType.RESPONSE_TIME ->
                ".time(lessThan(${snippet.maxMs}L))"

            TestSnippetType.HEADER_EXISTS ->
                ".header(\"${snippet.header}\", notNullValue())"

            TestSnippetType.HEADER_EQUALS ->
                ".header(\"${snippet.header}\", equalTo(\"${snippet.expected}\"))"

            TestSnippetType.ARRAY_LENGTH -> {
                val path = snippet.field?.removePrefix("$.") ?: ""
                when (snippet.operator) {
                    ComparisonOperator.EQUALS -> ".body(\"$path.size()\", equalTo(${snippet.expected}))"
                    ComparisonOperator.GREATER -> ".body(\"$path.size()\", greaterThan(${snippet.expected}))"
                    ComparisonOperator.GREATER_OR_EQUAL -> ".body(\"$path.size()\", greaterThanOrEqualTo(${snippet.expected}))"
                    ComparisonOperator.LESS -> ".body(\"$path.size()\", lessThan(${snippet.expected}))"
                    ComparisonOperator.LESS_OR_EQUAL -> ".body(\"$path.size()\", lessThanOrEqualTo(${snippet.expected}))"
                    ComparisonOperator.NOT_EQUALS -> ".body(\"$path.size()\", not(equalTo(${snippet.expected})))"
                }
            }

            TestSnippetType.ALL_MATCH,
            TestSnippetType.ANY_MATCH ->
                "// TODO: ${snippet.type} - ${snippet.condition}"

            TestSnippetType.CUSTOM ->
                "// Custom: ${snippet.description ?: snippet.expression}"
        }
    }
}

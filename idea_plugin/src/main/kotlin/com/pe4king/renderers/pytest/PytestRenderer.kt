package com.pe4king.renderers.pytest

import com.fasterxml.jackson.databind.ObjectMapper
import com.pe4king.core.models.*
import com.pe4king.renderers.TestRenderer

/**
 * Renders TestModel to pytest test files.
 */
class PytestRenderer : TestRenderer {

    override val name: String = "pytest"
    override val fileExtension: String = ".py"

    private val matchers = PytestMatchers()
    private val objectMapper = ObjectMapper()

    override fun render(model: TestModel): List<GeneratedFile> {
        val files = mutableListOf<GeneratedFile>()

        // Main test file
        files.add(GeneratedFile(
            filename = "test_api.py",
            content = renderMainFile(model),
            language = "python"
        ))

        // conftest.py with fixtures
        files.add(GeneratedFile(
            filename = "conftest.py",
            content = PytestTemplates.CONFTEST.replace("{baseUrl}", model.config.baseUrl),
            language = "python"
        ))

        // requirements.txt
        files.add(GeneratedFile(
            filename = "requirements.txt",
            content = PytestTemplates.REQUIREMENTS,
            language = "text"
        ))

        return files
    }

    private fun renderMainFile(model: TestModel): String {
        val header = PytestTemplates.FILE_HEADER
            .replace("{source}", model.meta.source)
            .replace("{generatedAt}", model.meta.generatedAt)
            .replace("{baseUrl}", model.config.baseUrl)

        val tests = StringBuilder()
        for (endpointTest in model.endpoints) {
            for (scenario in endpointTest.scenarios) {
                tests.append(renderTest(endpointTest, scenario))
            }
        }

        return header + tests.toString()
    }

    private fun renderTest(endpointTest: EndpointTest, scenario: TestScenario): String {
        val endpoint = endpointTest.endpoint

        if (scenario.disabled) {
            return PytestTemplates.NEGATIVE_TEST
                .replace("{testName}", scenario.name)
                .replace("{displayName}", scenario.displayName)
                .replace("{statusCode}", scenario.expected.statusCode.toString())
                .replace("{disabledReason}", scenario.disabledReason ?: "TODO: Implement")
        }

        val arrange = buildArrange(endpoint, scenario)
        val request = buildRequest(endpoint, scenario)
        val assertions = buildAssertions(scenario)

        return PytestTemplates.TEST_FUNCTION
            .replace("{testName}", scenario.name)
            .replace("{displayName}", scenario.displayName)
            .replace("{method}", endpoint.method.name)
            .replace("{path}", endpoint.path)
            .replace("{arrange}", arrange)
            .replace("{request}", request)
            .replace("{statusCode}", scenario.expected.statusCode.toString())
            .replace("{assertions}", assertions)
    }

    private fun buildArrange(endpoint: EndpointInfo, scenario: TestScenario): String {
        val lines = mutableListOf<String>()

        // Path parameters
        for ((name, value) in scenario.request.pathParams) {
            lines.add("    $name = \"$value\"")
        }

        // Build path
        val pathExpr = if (endpoint.pathParams.isNotEmpty()) {
            val pathTemplate = endpoint.path.replace(Regex("\\{(\\w+)\\}"), "{\$1}")
            "f\"$pathTemplate\""
        } else {
            "\"${endpoint.path}\""
        }
        lines.add("    path = $pathExpr")

        // Request body
        scenario.request.body?.let { body ->
            val bodyStr = toPythonDict(body)
                .split("\n")
                .mapIndexed { i, line -> if (i == 0) line else "    $line" }
                .joinToString("\n")
            lines.add("    body = $bodyStr")
        }

        return lines.joinToString("\n")
    }

    private fun buildRequest(endpoint: EndpointInfo, scenario: TestScenario): String {
        val method = endpoint.method.name.lowercase()
        val hasBody = scenario.request.body != null
        val hasQuery = scenario.request.queryParams.isNotEmpty()

        val parts = mutableListOf("api_client.$method(path")

        if (hasBody) {
            parts.add("json=body")
        }

        if (hasQuery) {
            val params = scenario.request.queryParams.entries
                .joinToString(", ") { (k, v) -> "\"$k\": \"$v\"" }
            parts.add("params={$params}")
        }

        return parts.joinToString(", ") + ")"
    }

    private fun buildAssertions(scenario: TestScenario): String {
        val lines = mutableListOf<String>()

        // Content-Type check (skip for 204/202)
        val noContentStatuses = listOf(204, 202)
        if (scenario.expected.contentType != null &&
            scenario.expected.statusCode !in noContentStatuses) {
            lines.add("    assert response.headers.get(\"Content-Type\", \"\").startswith(\"${scenario.expected.contentType}\")")
        }

        // No assertions case
        if (scenario.expected.assertions.isEmpty()) {
            lines.add("    # No response schema defined - only status code validated")
            return lines.joinToString("\n")
        }

        // Parse response body
        lines.add("    data = response.json()")
        lines.add("")

        // Track arrays for bounds checking
        val checkedArrays = mutableSetOf<String>()

        for (assertion in scenario.expected.assertions) {
            // Array bounds check before [0] access
            val arrayMatch = Regex("^([^\\[]+)\\[0\\]").find(assertion.path)
            if (arrayMatch != null) {
                val arrayPath = arrayMatch.groupValues[1]
                if (arrayPath !in checkedArrays) {
                    checkedArrays.add(arrayPath)
                    lines.add("    ${matchers.arrayNotEmpty(arrayPath)}")
                }
            }

            lines.add("    ${matchers.fromAssertion(assertion)}")
        }

        return lines.joinToString("\n")
    }

    private fun toPythonDict(obj: Any?): String {
        return when (obj) {
            is Map<*, *> -> {
                if (obj.isEmpty()) return "{}"
                val entries = obj.entries.joinToString(",\n        ") { (k, v) ->
                    "\"$k\": ${toPythonValue(v)}"
                }
                "{\n        $entries\n    }"
            }
            is List<*> -> {
                val items = obj.joinToString(", ") { toPythonValue(it) }
                "[$items]"
            }
            else -> toPythonValue(obj)
        }
    }

    private fun toPythonValue(value: Any?): String {
        return when (value) {
            null -> "None"
            is Boolean -> if (value) "True" else "False"
            is String -> "\"$value\""
            is Number -> value.toString()
            is Map<*, *> -> toPythonDict(value)
            is List<*> -> toPythonDict(value)
            else -> "\"$value\""
        }
    }
}

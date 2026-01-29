package com.pe4king.renderers.restassured

import com.fasterxml.jackson.databind.ObjectMapper
import com.pe4king.core.models.*
import com.pe4king.renderers.TestRenderer

/**
 * Renders TestModel to REST Assured (Java) test files.
 * Uses 3-layer architecture:
 * - Layer 1: BaseTest.java, BaseClient.java (static framework)
 * - Layer 2: {Tag}Client.java (API clients per tag)
 * - Layer 3: {Tag}ApiTest.java (test classes using clients)
 */
class RestAssuredRenderer : TestRenderer {

    override val name: String = "rest-assured"
    override val fileExtension: String = ".java"

    private val matchers = RestAssuredMatchers()
    private val objectMapper = ObjectMapper()

    override fun render(model: TestModel): List<GeneratedFile> {
        return renderLayered(model)
    }

    /**
     * Renders 3-layer architecture.
     */
    private fun renderLayered(model: TestModel): List<GeneratedFile> {
        val files = mutableListOf<GeneratedFile>()
        val pkg = model.config.javaPackage ?: "com.api.tests"
        val pkgPath = pkg.replace(".", "/")

        // === Layer 1: Base classes ===
        files.add(GeneratedFile(
            filename = "src/test/java/$pkgPath/base/BaseTest.java",
            content = RestAssuredTemplates.BASE_TEST
                .replace("{package}", pkg)
                .replace("{baseUrl}", model.config.baseUrl),
            language = "java"
        ))

        files.add(GeneratedFile(
            filename = "src/test/java/$pkgPath/base/BaseClient.java",
            content = RestAssuredTemplates.BASE_CLIENT
                .replace("{package}", pkg),
            language = "java"
        ))

        // === Group endpoints by tag ===
        val endpointsByTag = groupEndpointsByTag(model.endpoints)

        // === Layer 2 + Layer 3: For each tag ===
        for ((tag, endpoints) in endpointsByTag) {
            val clientClassName = toClassName(tag) + "Client"
            val testClassName = toClassName(tag) + "ApiTest"

            // Layer 2: API Client
            files.add(GeneratedFile(
                filename = "src/test/java/$pkgPath/clients/$clientClassName.java",
                content = renderApiClient(model, tag, clientClassName, endpoints),
                language = "java"
            ))

            // Layer 3: Test class
            files.add(GeneratedFile(
                filename = "src/test/java/$pkgPath/tests/$testClassName.java",
                content = renderTestClassWithClient(model, tag, testClassName, clientClassName, endpoints),
                language = "java"
            ))
        }

        // pom.xml
        val groupId = pkg.split(".").take(2).joinToString(".").ifEmpty { "com.api" }
        files.add(GeneratedFile(
            filename = "pom.xml",
            content = RestAssuredTemplates.POM_XML.replace("{groupId}", groupId),
            language = "xml"
        ))

        return files
    }

    /**
     * Groups endpoints by their first tag (or 'Default' if no tag).
     */
    private fun groupEndpointsByTag(endpoints: List<EndpointTest>): Map<String, List<EndpointTest>> {
        return endpoints.groupBy { ep ->
            ep.endpoint.tags.firstOrNull() ?: "Default"
        }
    }

    /**
     * Converts tag name to Java class name.
     */
    private fun toClassName(tag: String): String {
        return tag
            .split(Regex("[\\s_-]+"))
            .joinToString("") { word ->
                word.replaceFirstChar { it.uppercaseChar() }
            }
            .replace(Regex("[^a-zA-Z0-9]"), "")
    }

    /**
     * Layer 2: Renders API Client class.
     */
    private fun renderApiClient(model: TestModel, tag: String, className: String, endpoints: List<EndpointTest>): String {
        val pkg = model.config.javaPackage ?: "com.api.tests"

        val content = StringBuilder()
        content.append(RestAssuredTemplates.API_CLIENT_HEADER
            .replace("{package}", pkg)
            .replace("{tag}", tag)
            .replace("{className}", className))

        for (ep in endpoints) {
            content.append(renderClientMethod(ep.endpoint))
        }

        content.append(RestAssuredTemplates.API_CLIENT_FOOTER)
        return content.toString()
    }

    /**
     * Renders a single client method.
     */
    private fun renderClientMethod(endpoint: EndpointInfo): String {
        val methodName = sanitizeMethodName(endpoint.operationId ?: "${endpoint.method.name.lowercase()}_${endpoint.path}")
        val description = endpoint.summary ?: endpoint.operationId ?: "${endpoint.method} ${endpoint.path}"

        // Build parameters list
        val params = mutableListOf<String>()
        val pathParamLines = mutableListOf<String>()
        val queryParamLines = mutableListOf<String>()
        var bodyLine = ""

        // Path params
        for (param in endpoint.pathParams) {
            params.add("String ${param.name}")
            pathParamLines.add("            .pathParam(\"${param.name}\", ${param.name})")
        }

        // Query params (as Map)
        if (endpoint.queryParams.isNotEmpty()) {
            params.add("Map<String, Object> queryParams")
            queryParamLines.add("            .queryParams(queryParams)")
        }

        // Body
        if (endpoint.method in listOf(HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH)) {
            params.add("Object body")
            bodyLine = "            .body(body)\n"
        }

        val pathParamsStr = if (pathParamLines.isNotEmpty()) pathParamLines.joinToString("\n") + "\n" else ""
        val queryParamsStr = if (queryParamLines.isNotEmpty()) queryParamLines.joinToString("\n") + "\n" else ""

        return RestAssuredTemplates.API_CLIENT_METHOD
            .replace("{description}", description)
            .replace("{method}", endpoint.method.name)
            .replace("{path}", endpoint.path)
            .replace("{methodName}", methodName)
            .replace("{parameters}", params.joinToString(", "))
            .replace("{pathParams}", pathParamsStr)
            .replace("{queryParams}", queryParamsStr)
            .replace("{body}", bodyLine)
            .replace("{httpMethod}", endpoint.method.name.lowercase())
    }

    /**
     * Layer 3: Renders Test class using client.
     */
    private fun renderTestClassWithClient(
        model: TestModel,
        tag: String,
        className: String,
        clientClassName: String,
        endpoints: List<EndpointTest>
    ): String {
        val pkg = model.config.javaPackage ?: "com.api.tests"

        val content = StringBuilder()
        content.append(RestAssuredTemplates.TEST_CLASS_HEADER
            .replace("{package}", pkg)
            .replace("{tag}", tag)
            .replace("{source}", model.meta.source)
            .replace("{generatedAt}", model.meta.generatedAt)
            .replace("{className}", className)
            .replace("{clientClass}", clientClassName))

        var order = 1
        for (ep in sortByCrudOrder(endpoints)) {
            for (scenario in ep.scenarios) {
                content.append(renderTestMethodWithClient(ep, scenario, order++))
            }
        }

        content.append(RestAssuredTemplates.TEST_CLASS_FOOTER)
        return content.toString()
    }

    /**
     * Renders a test method that uses the client.
     */
    private fun renderTestMethodWithClient(ep: EndpointTest, scenario: TestScenario, order: Int): String {
        val clientMethod = sanitizeMethodName(ep.endpoint.operationId ?: "${ep.endpoint.method.name.lowercase()}_${ep.endpoint.path}")

        // Build call params
        val callParams = mutableListOf<String>()

        // Path params
        for (param in ep.endpoint.pathParams) {
            val value = scenario.request.pathParams[param.name] ?: "test-${param.name}"
            val quotedValue = if (value.startsWith("\"")) value else "\"$value\""
            callParams.add(quotedValue)
        }

        // Query params
        if (ep.endpoint.queryParams.isNotEmpty()) {
            if (scenario.request.queryParams.isNotEmpty()) {
                val mapEntries = scenario.request.queryParams.entries
                    .map { (k, v) -> "\"$k\", ${toJavaLiteral(v)}" }
                    .joinToString(", ")
                callParams.add("Map.of($mapEntries)")
            } else {
                callParams.add("Map.of()")
            }
        }

        // Body
        if (ep.endpoint.method in listOf(HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH)) {
            val body = scenario.request.body
            if (body != null && body is Map<*, *> && body.isNotEmpty()) {
                callParams.add(objectToMapOf(body as Map<String, Any?>))
            } else {
                callParams.add("Map.of()")
            }
        }

        val assertions = buildAssertionsForClient(scenario)

        return RestAssuredTemplates.TEST_METHOD_WITH_CLIENT
            .replace("{order}", order.toString())
            .replace("{displayName}", scenario.displayName)
            .replace("{testName}", scenario.name)
            .replace("{clientMethod}", clientMethod)
            .replace("{callParams}", callParams.joinToString(", "))
            .replace("{statusCode}", scenario.expected.statusCode.toString())
            .replace("{assertions}", assertions)
    }

    /**
     * Builds assertions for client-based tests.
     */
    private fun buildAssertionsForClient(scenario: TestScenario): String {
        if (scenario.expected.assertions.isEmpty()) {
            return "" // Just status code check
        }

        val lines = mutableListOf<String>()
        val checkedArrays = mutableSetOf<String>()

        for (assertion in scenario.expected.assertions) {
            // Skip root-only assertions
            if (assertion.path == "$" && assertion.matcher == MatcherType.NOT_NULL) {
                continue
            }

            // Array bounds check
            val arrayMatch = Regex("^([^\\[]+)\\[0\\]").find(assertion.path)
            if (arrayMatch != null) {
                val arrayPath = arrayMatch.groupValues[1]
                if (arrayPath !in checkedArrays) {
                    checkedArrays.add(arrayPath)
                    lines.add("            ${matchers.arrayNotEmpty(arrayPath)}")
                }
            }

            lines.add("            ${matchers.fromAssertion(assertion)}")
        }

        return if (lines.isEmpty()) "" else "\n" + lines.joinToString("\n")
    }

    /**
     * Converts object to Map.of() Java literal.
     */
    private fun objectToMapOf(obj: Map<String, Any?>): String {
        val entries = obj.entries
            .take(5) // Limit to avoid huge maps
            .map { (k, v) -> "\"$k\", ${toJavaLiteral(v)}" }
            .joinToString(", ")
        return "Map.of($entries)"
    }

    /**
     * Sort endpoints by CRUD order: POST -> GET -> PUT/PATCH -> DELETE
     */
    private fun sortByCrudOrder(endpoints: List<EndpointTest>): List<EndpointTest> {
        val methodOrder = mapOf(
            HttpMethod.POST to 1,
            HttpMethod.GET to 2,
            HttpMethod.PUT to 3,
            HttpMethod.PATCH to 4,
            HttpMethod.DELETE to 5
        )

        return endpoints.sortedWith(compareBy(
            { methodOrder[it.endpoint.method] ?: 99 },
            { it.endpoint.path.length }
        ))
    }

    /**
     * Sanitizes name for Java method.
     */
    private fun sanitizeMethodName(name: String): String {
        return name
            .replace(Regex("[^a-zA-Z0-9_]"), "_")
            .replace(Regex("_+"), "_")
            .replace(Regex("^_|_$"), "")
            .lowercase()
    }

    private fun toJavaLiteral(value: Any?): String {
        return when (value) {
            null -> "null"
            is String -> "\"${value.replace("\"", "\\\"")}\""
            is Boolean -> if (value) "true" else "false"
            is Number -> value.toString()
            is List<*> -> if (value.isEmpty()) "List.of()" else "List.of(${value.joinToString(", ") { toJavaLiteral(it) }})"
            is Map<*, *> -> "Map.of()"
            else -> "\"$value\""
        }
    }
}

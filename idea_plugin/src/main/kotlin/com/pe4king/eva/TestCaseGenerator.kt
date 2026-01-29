package com.pe4king.eva

import java.io.File
import java.util.regex.Pattern

/**
 * Generates test cases from automated test source files.
 * Parses REST Assured / JUnit tests and extracts test case information.
 */
class TestCaseGenerator {

    data class TestCase(
        val id: String,
        val location: String,           // Расположение
        val name: String,               // Наименование
        val automated: String = "Да",   // Автоматизирован
        val preconditions: List<String>,// Предусловия
        val steps: List<TestStep>,      // Шаги + Ожидаемый результат
        val postconditions: List<String> = emptyList(),
        val testData: String = "",      // Тестовые данные
        val priority: String,           // Приоритет
        val tags: List<String> = emptyList()
    )

    data class TestStep(
        val action: String,             // Шаг
        val expected: String            // Ожидаемый результат
    )

    /**
     * Parse test file and generate test cases.
     */
    fun parseTestFile(file: File): List<TestCase> {
        val content = file.readText()
        val className = extractClassName(content) ?: file.nameWithoutExtension
        val packagePath = extractPackage(content)?.replace(".", " -> ") ?: "Tests"

        val testCases = mutableListOf<TestCase>()
        var testIndex = 1

        // Find all test methods
        val testPattern = Pattern.compile(
            """@Test\s*\n\s*(?:@Order\(\d+\)\s*\n\s*)?(?:@DisplayName\("([^"]+)"\)\s*\n\s*)?void\s+(\w+)\s*\(\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}""",
            Pattern.MULTILINE or Pattern.DOTALL
        )

        val matcher = testPattern.matcher(content)
        while (matcher.find()) {
            val displayName = matcher.group(1)
            val methodName = matcher.group(2)
            val methodBody = matcher.group(3)

            val testCase = parseTestMethod(
                id = "TC-${className.take(3).uppercase()}-${String.format("%03d", testIndex)}",
                location = "$packagePath -> $className",
                displayName = displayName ?: methodName,
                methodName = methodName,
                methodBody = methodBody
            )
            testCases.add(testCase)
            testIndex++
        }

        return testCases
    }

    private fun parseTestMethod(
        id: String,
        location: String,
        displayName: String,
        methodName: String,
        methodBody: String
    ): TestCase {
        val steps = mutableListOf<TestStep>()
        val preconditions = mutableListOf<String>()

        // Determine test type and priority
        val isNegative = methodName.contains("empty_body") ||
                         methodName.contains("not_found") ||
                         methodName.contains("invalid") ||
                         methodName.contains("unauthorized")

        val priority = if (isNegative) "Средний" else "Высокий"

        // Extract HTTP method and path from displayName or methodBody
        val httpMethod = extractHttpMethod(displayName, methodBody)
        val endpoint = extractEndpoint(displayName, methodBody)

        // Add standard preconditions
        preconditions.add("API сервер запущен и доступен")
        if (!isNegative) {
            when {
                methodName.contains("get_") -> preconditions.add("В системе существуют тестовые данные")
                methodName.contains("delete_") -> preconditions.add("Удаляемый ресурс существует в системе")
                methodName.contains("put_") || methodName.contains("patch_") ->
                    preconditions.add("Обновляемый ресурс существует в системе")
            }
        }

        // Parse request step
        val params = extractParams(methodBody)
        val requestStep = buildRequestStep(httpMethod, endpoint, params, methodBody)

        // Parse assertions and build expected results
        val assertions = extractAssertions(methodBody)
        val expectedResult = buildExpectedResult(assertions, isNegative)

        steps.add(TestStep(requestStep, expectedResult))

        // Build human-readable name
        val humanName = buildHumanName(displayName, methodName, isNegative)

        return TestCase(
            id = id,
            location = location,
            name = humanName,
            preconditions = preconditions,
            steps = steps,
            priority = priority,
            testData = params,
            tags = if (isNegative) listOf("Negative") else listOf("Positive")
        )
    }

    private fun extractClassName(content: String): String? {
        val pattern = Pattern.compile("""class\s+(\w+)""")
        val matcher = pattern.matcher(content)
        return if (matcher.find()) matcher.group(1) else null
    }

    private fun extractPackage(content: String): String? {
        val pattern = Pattern.compile("""package\s+([\w.]+)""")
        val matcher = pattern.matcher(content)
        return if (matcher.find()) matcher.group(1) else null
    }

    private fun extractHttpMethod(displayName: String, methodBody: String): String {
        // From displayName like "GET /api/users"
        val methods = listOf("GET", "POST", "PUT", "PATCH", "DELETE")
        for (method in methods) {
            if (displayName.startsWith(method) || methodBody.contains(".$method(") ||
                methodBody.contains(".${method.lowercase()}(")) {
                return method
            }
        }
        // From method call like client.get_api_...
        return when {
            methodBody.contains(".get_") || methodBody.contains(".get(") -> "GET"
            methodBody.contains(".post_") || methodBody.contains(".post(") -> "POST"
            methodBody.contains(".put_") || methodBody.contains(".put(") -> "PUT"
            methodBody.contains(".patch_") || methodBody.contains(".patch(") -> "PATCH"
            methodBody.contains(".delete_") || methodBody.contains(".delete(") -> "DELETE"
            else -> "GET"
        }
    }

    private fun extractEndpoint(displayName: String, methodBody: String): String {
        // From displayName "GET /api/estore/cameras"
        val pathPattern = Pattern.compile("""[A-Z]+\s+(/[^\s"]+)""")
        val matcher = pathPattern.matcher(displayName)
        if (matcher.find()) {
            return matcher.group(1)
        }
        // Fallback - extract from method name
        return "/api/..."
    }

    private fun extractParams(methodBody: String): String {
        val params = mutableListOf<String>()

        // Map.of("key", "value", ...)
        val mapPattern = Pattern.compile("""Map\.of\(([^)]+)\)""")
        val matcher = mapPattern.matcher(methodBody)
        if (matcher.find()) {
            val mapContent = matcher.group(1)
            val kvPattern = Pattern.compile(""""(\w+)",\s*"([^"]+)"""")
            val kvMatcher = kvPattern.matcher(mapContent)
            while (kvMatcher.find()) {
                params.add("${kvMatcher.group(1)}=${kvMatcher.group(2)}")
            }
        }

        // Path params like ("uuid", "test-value")
        val pathParamPattern = Pattern.compile(""""(\w+)",\s*"([^"]+)"""")
        val pathMatcher = pathParamPattern.matcher(methodBody)
        while (pathMatcher.find()) {
            val key = pathMatcher.group(1)
            val value = pathMatcher.group(2)
            if (!params.any { it.startsWith("$key=") }) {
                params.add("$key=$value")
            }
        }

        return params.joinToString("; ")
    }

    private fun buildRequestStep(httpMethod: String, endpoint: String, params: String, methodBody: String): String {
        val sb = StringBuilder()
        sb.append("Отправить $httpMethod запрос на $endpoint")

        if (params.isNotEmpty() && !methodBody.contains("Map.of()")) {
            sb.append(" с параметрами: $params")
        }

        if (methodBody.contains("empty_body") || (methodBody.contains("Map.of()") &&
            (httpMethod == "POST" || httpMethod == "PUT" || httpMethod == "PATCH"))) {
            sb.append(" (тело запроса пустое)")
        }

        return sb.toString()
    }

    private fun extractAssertions(methodBody: String): List<String> {
        val assertions = mutableListOf<String>()

        // statusCode(XXX)
        val statusPattern = Pattern.compile("""\.statusCode\((\d+)\)""")
        val statusMatcher = statusPattern.matcher(methodBody)
        if (statusMatcher.find()) {
            assertions.add("status:${statusMatcher.group(1)}")
        }

        // .body("field", matcher)
        val bodyPattern = Pattern.compile("""\.body\("([^"]+)",\s*(\w+)\(([^)]*)\)\)""")
        val bodyMatcher = bodyPattern.matcher(methodBody)
        while (bodyMatcher.find()) {
            val field = bodyMatcher.group(1)
            val matcher = bodyMatcher.group(2)
            val value = bodyMatcher.group(3).replace("\"", "")
            assertions.add("body:$field:$matcher:$value")
        }

        // Simple matchers without args: notNullValue(), not(empty())
        val simpleBodyPattern = Pattern.compile("""\.body\("([^"]+)",\s*(notNullValue|not\(empty\)|hasSize)\(\)\)""")
        val simpleBodyMatcher = simpleBodyPattern.matcher(methodBody)
        while (simpleBodyMatcher.find()) {
            val field = simpleBodyMatcher.group(1)
            val matcher = simpleBodyMatcher.group(2)
            assertions.add("body:$field:$matcher:")
        }

        return assertions
    }

    private fun buildExpectedResult(assertions: List<String>, isNegative: Boolean): String {
        val results = mutableListOf<String>()

        for (assertion in assertions) {
            val parts = assertion.split(":")
            when (parts[0]) {
                "status" -> {
                    val code = parts[1]
                    val statusText = when (code) {
                        "200" -> "200 OK"
                        "201" -> "201 Created"
                        "204" -> "204 No Content"
                        "400" -> "400 Bad Request"
                        "401" -> "401 Unauthorized"
                        "403" -> "403 Forbidden"
                        "404" -> "404 Not Found"
                        "500" -> "500 Internal Server Error"
                        else -> code
                    }
                    results.add("Код ответа: $statusText")
                }
                "body" -> {
                    val field = parts[1]
                    val matcher = parts[2]
                    val value = parts.getOrElse(3) { "" }

                    val fieldDesc = if (field.isEmpty() || field == "") "Тело ответа"
                                   else "Поле '$field'"

                    val matcherDesc = when (matcher) {
                        "notNullValue" -> "присутствует (не null)"
                        "not(empty)" -> "не пустое"
                        "empty" -> "пустое"
                        "equalTo" -> "равно '$value'"
                        "containsString" -> "содержит '$value'"
                        "greaterThan" -> "больше $value"
                        "lessThan" -> "меньше $value"
                        "hasSize" -> "имеет размер $value"
                        else -> matcher
                    }
                    results.add("$fieldDesc $matcherDesc")
                }
            }
        }

        return if (results.isEmpty()) {
            if (isNegative) "Сервер отклоняет запрос" else "Запрос выполнен успешно"
        } else {
            results.joinToString("\n")
        }
    }

    private fun buildHumanName(displayName: String, methodName: String, isNegative: Boolean): String {
        // If displayName is just "GET /api/..." - make it more human
        if (displayName.matches(Regex("""[A-Z]+\s+/.*"""))) {
            val parts = displayName.split(" ", limit = 2)
            val method = parts[0]
            val path = parts.getOrElse(1) { "" }

            val action = when (method) {
                "GET" -> "Получение"
                "POST" -> "Создание"
                "PUT" -> "Обновление"
                "PATCH" -> "Частичное обновление"
                "DELETE" -> "Удаление"
                else -> method
            }

            val resource = path.split("/").lastOrNull { it.isNotEmpty() && !it.startsWith("{") } ?: "ресурса"

            return when {
                isNegative && methodName.contains("empty_body") -> "$action $resource - пустое тело запроса"
                isNegative && methodName.contains("not_found") -> "$action $resource - ресурс не найден"
                isNegative && methodName.contains("invalid") -> "$action $resource - невалидные данные"
                else -> "$action $resource"
            }
        }
        return displayName
    }
}

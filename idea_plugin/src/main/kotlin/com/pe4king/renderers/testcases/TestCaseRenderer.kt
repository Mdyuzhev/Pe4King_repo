package com.pe4king.renderers.testcases

import com.pe4king.core.models.*
import com.pe4king.renderers.TestRenderer
import org.apache.poi.ss.usermodel.*
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.ByteArrayOutputStream
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * Renders TestModel to TestIT-compatible Excel format.
 * Uses the same IR (TestModel) as other renderers for consistency.
 */
class TestCaseRenderer : TestRenderer {

    override val name = "TestIT Excel"
    override val fileExtension = "xlsx"

    companion object {
        // TestIT Excel columns
        private const val COL_ID = 0
        private const val COL_LOCATION = 1
        private const val COL_NAME = 2
        private const val COL_AUTOMATED = 3
        private const val COL_PRECONDITIONS = 4
        private const val COL_STEPS = 5
        private const val COL_POSTCONDITIONS = 6
        private const val COL_EXPECTED = 7
        private const val COL_TEST_DATA = 8
        private const val COL_COMMENTS = 9
        private const val COL_ITERATIONS = 10
        private const val COL_PRIORITY = 11
        private const val COL_STATUS = 12
        private const val COL_CREATED = 13
        private const val COL_AUTHOR = 14
        private const val COL_DURATION = 15
        private const val COL_TAGS = 16

        private val HEADERS = listOf(
            "ID", "Расположение", "Наименование", "Автоматизирован",
            "Предусловия", "Шаги", "Постусловия", "Ожидаемый результат",
            "Тестовые данные", "Комментарии", "Итерации", "Приоритет",
            "Статус", "Дата создания", "Автор", "Длительность", "Тег"
        )
    }

    override fun render(model: TestModel): List<GeneratedFile> {
        val workbook = XSSFWorkbook()
        val projectName = sanitizeSheetName(model.meta.specTitle)
        val sheet = workbook.createSheet("Project_$projectName")

        // Styles
        val headerStyle = createHeaderStyle(workbook)

        // Header row
        val headerRow = sheet.createRow(0)
        HEADERS.forEachIndexed { index, header ->
            val cell = headerRow.createCell(index)
            cell.setCellValue(header)
            cell.setCellStyle(headerStyle)
        }

        // Data rows
        var rowIndex = 1
        var testCaseIndex = 1
        val now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("M/d/yyyy H:mm:ss"))

        for (endpointTest in model.endpoints) {
            val endpoint = endpointTest.endpoint
            val location = buildLocation(endpoint, model.meta.specTitle)

            for (scenario in endpointTest.scenarios) {
                val testCaseId = "TC-${testCaseIndex.toString().padStart(3, '0')}"

                // Main row with test case metadata
                val mainRow = sheet.createRow(rowIndex++)
                mainRow.createCell(COL_ID).setCellValue(testCaseId)
                mainRow.createCell(COL_LOCATION).setCellValue(location)
                mainRow.createCell(COL_NAME).setCellValue(buildTestCaseName(scenario, endpoint))
                mainRow.createCell(COL_AUTOMATED).setCellValue("Да")
                mainRow.createCell(COL_PRIORITY).setCellValue(getPriority(scenario.type))
                mainRow.createCell(COL_STATUS).setCellValue("Готов")
                mainRow.createCell(COL_CREATED).setCellValue(now)
                mainRow.createCell(COL_AUTHOR).setCellValue("Pe4King")
                mainRow.createCell(COL_DURATION).setCellValue("0h 1m 0s")
                mainRow.createCell(COL_TAGS).setCellValue(getTags(scenario, endpoint))

                // Preconditions rows
                val preconditions = buildPreconditions(scenario, endpoint)
                for (precondition in preconditions) {
                    val precRow = sheet.createRow(rowIndex++)
                    precRow.createCell(COL_PRECONDITIONS).setCellValue(precondition)
                }

                // Steps and Expected Results
                val steps = buildSteps(scenario, endpoint)
                val expectedResults = buildExpectedResults(scenario)

                // First step row
                if (steps.isNotEmpty()) {
                    val stepRow = sheet.createRow(rowIndex++)
                    stepRow.createCell(COL_STEPS).setCellValue(steps.joinToString("\n"))
                    stepRow.createCell(COL_EXPECTED).setCellValue(expectedResults.joinToString("\n"))

                    // Test data
                    val testData = buildTestData(scenario)
                    if (testData.isNotEmpty()) {
                        stepRow.createCell(COL_TEST_DATA).setCellValue(testData)
                    }
                }

                testCaseIndex++
            }
        }

        // Auto-size columns
        for (i in 0..16) {
            sheet.autoSizeColumn(i)
            // Cap width at 50 characters
            if (sheet.getColumnWidth(i) > 50 * 256) {
                sheet.setColumnWidth(i, 50 * 256)
            }
        }

        // Write to bytes
        val outputStream = ByteArrayOutputStream()
        workbook.write(outputStream)
        workbook.close()

        val filename = "${sanitizeFilename(model.meta.specTitle)}_TestCases.xlsx"

        return listOf(
            GeneratedFile(
                filename = filename,
                content = "", // Excel is binary, we'll handle this specially
                language = "xlsx"
            )
        )
    }

    /**
     * Render to binary content directly.
     * This method should be called instead of render() for Excel output.
     */
    fun renderToBytes(model: TestModel): Pair<String, ByteArray> {
        val workbook = XSSFWorkbook()
        val projectName = sanitizeSheetName(model.meta.specTitle)
        val sheet = workbook.createSheet("Project_$projectName")

        val headerStyle = createHeaderStyle(workbook)

        // Header row
        val headerRow = sheet.createRow(0)
        HEADERS.forEachIndexed { index, header ->
            val cell = headerRow.createCell(index)
            cell.setCellValue(header)
            cell.setCellStyle(headerStyle)
        }

        var rowIndex = 1
        var testCaseIndex = 1
        val now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("M/d/yyyy H:mm:ss"))

        for (endpointTest in model.endpoints) {
            val endpoint = endpointTest.endpoint
            val location = buildLocation(endpoint, model.meta.specTitle)

            for (scenario in endpointTest.scenarios) {
                val testCaseId = "TC-${testCaseIndex.toString().padStart(3, '0')}"

                // Main row
                val mainRow = sheet.createRow(rowIndex++)
                mainRow.createCell(COL_ID).setCellValue(testCaseId)
                mainRow.createCell(COL_LOCATION).setCellValue(location)
                mainRow.createCell(COL_NAME).setCellValue(buildTestCaseName(scenario, endpoint))
                mainRow.createCell(COL_AUTOMATED).setCellValue("Да")
                mainRow.createCell(COL_PRIORITY).setCellValue(getPriority(scenario.type))
                mainRow.createCell(COL_STATUS).setCellValue("Готов")
                mainRow.createCell(COL_CREATED).setCellValue(now)
                mainRow.createCell(COL_AUTHOR).setCellValue("Pe4King")
                mainRow.createCell(COL_DURATION).setCellValue("0h 1m 0s")
                mainRow.createCell(COL_TAGS).setCellValue(getTags(scenario, endpoint))

                // Preconditions
                val preconditions = buildPreconditions(scenario, endpoint)
                for (precondition in preconditions) {
                    val precRow = sheet.createRow(rowIndex++)
                    precRow.createCell(COL_PRECONDITIONS).setCellValue(precondition)
                }

                // Steps + Expected
                val steps = buildSteps(scenario, endpoint)
                val expectedResults = buildExpectedResults(scenario)

                if (steps.isNotEmpty()) {
                    val stepRow = sheet.createRow(rowIndex++)
                    stepRow.createCell(COL_STEPS).setCellValue(steps.joinToString("\n"))
                    stepRow.createCell(COL_EXPECTED).setCellValue(expectedResults.joinToString("\n"))

                    val testData = buildTestData(scenario)
                    if (testData.isNotEmpty()) {
                        stepRow.createCell(COL_TEST_DATA).setCellValue(testData)
                    }
                }

                testCaseIndex++
            }
        }

        // Auto-size columns
        for (i in 0..16) {
            sheet.autoSizeColumn(i)
            if (sheet.getColumnWidth(i) > 50 * 256) {
                sheet.setColumnWidth(i, 50 * 256)
            }
        }

        val outputStream = ByteArrayOutputStream()
        workbook.write(outputStream)
        workbook.close()

        val filename = "${sanitizeFilename(model.meta.specTitle)}_TestCases.xlsx"
        return Pair(filename, outputStream.toByteArray())
    }

    // === Helper methods ===

    private fun createHeaderStyle(workbook: Workbook): CellStyle {
        val style = workbook.createCellStyle()
        val font = workbook.createFont()
        font.bold = true
        style.setFont(font)
        style.fillForegroundColor = IndexedColors.GREY_25_PERCENT.index
        style.fillPattern = FillPatternType.SOLID_FOREGROUND
        style.borderBottom = BorderStyle.THIN
        style.borderTop = BorderStyle.THIN
        style.borderLeft = BorderStyle.THIN
        style.borderRight = BorderStyle.THIN
        return style
    }

    private fun buildLocation(endpoint: EndpointInfo, specTitle: String): String {
        val tag = endpoint.tags.firstOrNull() ?: "API"
        return "$specTitle -> $tag"
    }

    private fun buildTestCaseName(scenario: TestScenario, endpoint: EndpointInfo): String {
        // Convert technical name to human-readable
        val method = endpoint.method.name
        val resource = endpoint.path.split("/").lastOrNull {
            it.isNotEmpty() && !it.startsWith("{")
        } ?: "ресурса"

        val action = when (method) {
            "GET" -> "Получение"
            "POST" -> "Создание"
            "PUT" -> "Обновление"
            "PATCH" -> "Частичное обновление"
            "DELETE" -> "Удаление"
            else -> method
        }

        return when {
            scenario.name.contains("not_found") -> "$action $resource — ресурс не найден"
            scenario.name.contains("empty_body") -> "$action $resource — пустое тело запроса"
            scenario.name.contains("unauthorized") -> "$action $resource — без авторизации"
            scenario.name.contains("invalid_enum") -> "$action $resource — невалидное значение enum"
            scenario.name.contains("below_min") -> "$action $resource — значение ниже минимума"
            scenario.name.contains("above_max") -> "$action $resource — значение выше максимума"
            scenario.name.contains("too_short") -> "$action $resource — строка слишком короткая"
            scenario.name.contains("too_long") -> "$action $resource — строка слишком длинная"
            scenario.name.contains("missing_") -> {
                val field = scenario.name.substringAfter("missing_").replace("_", " ")
                "$action $resource — отсутствует обязательное поле $field"
            }
            scenario.type == TestType.NEGATIVE -> "$action $resource — негативный сценарий"
            else -> endpoint.summary ?: "$action $resource"
        }
    }

    private fun getPriority(type: TestType): String {
        return when (type) {
            TestType.POSITIVE -> "Высокий"
            TestType.NEGATIVE -> "Средний"
            TestType.EDGE -> "Низкий"
        }
    }

    private fun getTags(scenario: TestScenario, endpoint: EndpointInfo): String {
        val tags = mutableListOf<String>()

        when (scenario.type) {
            TestType.POSITIVE -> tags.add("Positive")
            TestType.NEGATIVE -> tags.add("Negative")
            TestType.EDGE -> tags.add("Edge")
        }

        tags.add(endpoint.method.name)
        endpoint.tags.firstOrNull()?.let { tags.add(it) }

        return tags.joinToString(", ")
    }

    private fun buildPreconditions(scenario: TestScenario, endpoint: EndpointInfo): List<String> {
        val preconditions = mutableListOf<String>()

        preconditions.add("API сервер запущен и доступен")

        if (scenario.type == TestType.POSITIVE) {
            when (endpoint.method) {
                HttpMethod.GET -> {
                    if (endpoint.pathParams.isNotEmpty()) {
                        preconditions.add("Запрашиваемый ресурс существует в системе")
                    } else {
                        preconditions.add("В системе существуют тестовые данные")
                    }
                }
                HttpMethod.PUT, HttpMethod.PATCH -> {
                    preconditions.add("Обновляемый ресурс существует в системе")
                }
                HttpMethod.DELETE -> {
                    preconditions.add("Удаляемый ресурс существует в системе")
                }
                HttpMethod.POST -> {
                    // No special precondition for create
                }
                else -> {}
            }
        }

        if (endpoint.security.isNotEmpty() && !scenario.name.contains("unauthorized")) {
            preconditions.add("Пользователь авторизован в системе")
        }

        return preconditions
    }

    private fun buildSteps(scenario: TestScenario, endpoint: EndpointInfo): List<String> {
        val steps = mutableListOf<String>()
        val method = endpoint.method.name
        val path = endpoint.path

        // Step 1: Prepare request
        if (scenario.request.pathParams.isNotEmpty()) {
            val params = scenario.request.pathParams.entries.joinToString(", ") {
                "${it.key} = ${it.value}"
            }
            steps.add("Подготовить path параметры: $params")
        }

        if (scenario.request.queryParams.isNotEmpty()) {
            val params = scenario.request.queryParams.entries.joinToString(", ") {
                "${it.key} = ${it.value}"
            }
            steps.add("Подготовить query параметры: $params")
        }

        if (scenario.request.body != null) {
            val bodyDesc = when {
                scenario.name.contains("empty_body") -> "пустым телом запроса {}"
                scenario.request.body is Map<*, *> && (scenario.request.body as? Map<*, *>)?.isEmpty() == true ->
                    "пустым телом запроса {}"
                else -> "телом запроса согласно тестовым данным"
            }
            steps.add("Подготовить запрос с $bodyDesc")
        }

        // Step 2: Send request
        steps.add("Отправить $method запрос на $path")

        // Step 3: Verify response
        steps.add("Проверить ответ сервера")

        return steps
    }

    private fun buildExpectedResults(scenario: TestScenario): List<String> {
        val results = mutableListOf<String>()

        // Status code
        val statusCode = scenario.expected.statusCode
        val statusText = when (statusCode) {
            200 -> "200 OK"
            201 -> "201 Created"
            204 -> "204 No Content"
            400 -> "400 Bad Request"
            401 -> "401 Unauthorized"
            403 -> "403 Forbidden"
            404 -> "404 Not Found"
            422 -> "422 Unprocessable Entity"
            500 -> "500 Internal Server Error"
            else -> statusCode.toString()
        }
        results.add("Код ответа: $statusText")

        // Assertions from IR
        for (assertion in scenario.expected.assertions) {
            val description = assertion.description ?: buildAssertionDescription(assertion)
            results.add(description)
        }

        // If no assertions but positive test, add generic check
        if (scenario.expected.assertions.isEmpty() && scenario.type == TestType.POSITIVE) {
            results.add("Тело ответа соответствует схеме")
        }

        return results
    }

    private fun buildAssertionDescription(assertion: Assertion): String {
        val path = if (assertion.path == "$" || assertion.path.isEmpty()) {
            "Тело ответа"
        } else {
            "Поле '${assertion.path}'"
        }

        return when (assertion.matcher) {
            MatcherType.NOT_NULL -> "$path присутствует (не null)"
            MatcherType.IS_NULL -> "$path равно null"
            MatcherType.EQUALS -> "$path равно '${assertion.value}'"
            MatcherType.NOT_EQUALS -> "$path не равно '${assertion.value}'"
            MatcherType.CONTAINS -> "$path содержит '${assertion.value}'"
            MatcherType.MATCHES_PATTERN -> "$path соответствует формату"
            MatcherType.ONE_OF -> "$path одно из: ${assertion.value}"
            MatcherType.IS_TYPE -> "$path имеет тип ${assertion.value}"
            MatcherType.NOT_EMPTY -> "$path не пустое"
            MatcherType.IS_EMPTY -> "$path пустое"
            MatcherType.GREATER_THAN -> "$path больше ${assertion.value}"
            MatcherType.GREATER_THAN_OR_EQUAL -> "$path >= ${assertion.value}"
            MatcherType.LESS_THAN -> "$path меньше ${assertion.value}"
            MatcherType.LESS_THAN_OR_EQUAL -> "$path <= ${assertion.value}"
            MatcherType.HAS_SIZE -> "$path имеет размер ${assertion.value}"
            MatcherType.HAS_SIZE_GREATER_THAN -> "$path имеет размер > ${assertion.value}"
            MatcherType.HAS_SIZE_LESS_THAN -> "$path имеет размер < ${assertion.value}"
            MatcherType.HAS_MIN_LENGTH -> "$path имеет минимальную длину ${assertion.value}"
            MatcherType.HAS_MAX_LENGTH -> "$path имеет максимальную длину ${assertion.value}"
            MatcherType.HAS_KEY -> "$path содержит ключ '${assertion.value}'"
            MatcherType.EVERY -> "$path: каждый элемент ${assertion.value}"
        }
    }

    private fun buildTestData(scenario: TestScenario): String {
        val data = mutableListOf<String>()

        scenario.request.pathParams.forEach { (k, v) -> data.add("$k = $v") }
        scenario.request.queryParams.forEach { (k, v) -> data.add("$k = $v") }

        if (scenario.request.body != null && scenario.request.body !is Map<*, *>) {
            data.add("body = ${scenario.request.body}")
        } else if (scenario.request.body is Map<*, *>) {
            @Suppress("UNCHECKED_CAST")
            val map = scenario.request.body as? Map<*, *>
            if (map?.isNotEmpty() == true) {
                map.forEach { (k, v) -> data.add("$k = $v") }
            }
        }

        return data.joinToString("; ")
    }

    private fun sanitizeSheetName(name: String): String {
        return name.replace(Regex("[\\[\\]\\*\\?/\\\\:]"), "_").take(31)
    }

    private fun sanitizeFilename(name: String): String {
        return name.replace(Regex("[^a-zA-Z0-9_\\-]"), "_")
    }
}

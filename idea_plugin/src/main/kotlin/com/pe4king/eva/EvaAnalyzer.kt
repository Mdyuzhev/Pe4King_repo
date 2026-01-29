package com.pe4king.eva

import java.io.File
import java.util.regex.Pattern

/**
 * Analyzes test files for quality metrics.
 * Supports Java (REST Assured) and Python (pytest/requests).
 */
class EvaAnalyzer {

    /**
     * Analyze a single test file.
     */
    fun analyzeFile(file: File): EvaReport {
        val content = file.readText()
        val language = detectLanguage(file)

        val tests = when (language) {
            Language.JAVA -> analyzeJavaTests(content)
            Language.PYTHON -> analyzePythonTests(content)
            Language.UNKNOWN -> emptyList()
        }

        return EvaReport(
            fileName = file.name,
            tests = tests,
            summary = calculateSummary(tests)
        )
    }

    /**
     * Analyze a directory of test files.
     */
    fun analyzeDirectory(dir: File): List<EvaReport> {
        return dir.walkTopDown()
            .filter { it.isFile && isTestFile(it) }
            .map { analyzeFile(it) }
            .toList()
    }

    private fun detectLanguage(file: File): Language {
        return when (file.extension.lowercase()) {
            "java", "kt" -> Language.JAVA
            "py" -> Language.PYTHON
            else -> Language.UNKNOWN
        }
    }

    private fun isTestFile(file: File): Boolean {
        val name = file.name.lowercase()
        return (name.contains("test") || name.contains("spec")) &&
               file.extension.lowercase() in listOf("java", "kt", "py")
    }

    /**
     * Analyze Java/Kotlin REST Assured tests.
     */
    private fun analyzeJavaTests(content: String): List<TestAnalysis> {
        val tests = mutableListOf<TestAnalysis>()

        // Find test methods: @Test void methodName() or fun methodName()
        val testPattern = Pattern.compile(
            """@Test[^}]*?(?:void|fun)\s+(\w+)\s*\([^)]*\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}""",
            Pattern.DOTALL
        )

        val matcher = testPattern.matcher(content)
        while (matcher.find()) {
            val testName = matcher.group(1)
            val testBody = matcher.group(2)
            tests.add(analyzeJavaTestBody(testName, testBody))
        }

        return tests
    }

    private fun analyzeJavaTestBody(name: String, body: String): TestAnalysis {
        val assertions = mutableListOf<AssertionInfo>()
        val issues = mutableListOf<String>()

        // Check for statusCode
        if (body.contains("statusCode(")) {
            val codeMatch = Regex("""statusCode\((\d+)\)""").find(body)
            assertions.add(AssertionInfo("statusCode", null, "equalTo(${codeMatch?.groupValues?.get(1) ?: "?"})"))
        }

        // Check for body assertions
        val bodyPattern = Regex("""\.body\("([^"]+)",\s*(\w+)\(""")
        bodyPattern.findAll(body).forEach { match ->
            assertions.add(AssertionInfo("body", match.groupValues[1], match.groupValues[2]))
        }

        // Check for header assertions
        val headerPattern = Regex("""\.header\("([^"]+)",\s*(\w+)\(""")
        headerPattern.findAll(body).forEach { match ->
            assertions.add(AssertionInfo("header", match.groupValues[1], match.groupValues[2]))
        }

        // Check for assertThat
        val assertThatPattern = Regex("""assertThat\([^)]+\)\.(\w+)\(""")
        assertThatPattern.findAll(body).forEach { match ->
            assertions.add(AssertionInfo("assertThat", null, match.groupValues[1]))
        }

        // Determine oracle depth
        val oracleDepth = calculateOracleDepth(assertions)

        // Find issues
        if (assertions.isEmpty()) {
            issues.add("No assertions found")
        }
        if (assertions.size == 1 && assertions[0].type == "statusCode") {
            issues.add("Only status code checked - add body assertions")
        }
        if (!assertions.any { it.type == "body" && it.field?.contains(".") == true }) {
            issues.add("No nested field checks")
        }

        val score = calculateScore(oracleDepth, assertions.size, issues.size)

        return TestAnalysis(
            name = name,
            oracleDepth = oracleDepth,
            assertionCount = assertions.size,
            assertions = assertions,
            issues = issues,
            score = score
        )
    }

    /**
     * Analyze Python pytest tests.
     */
    private fun analyzePythonTests(content: String): List<TestAnalysis> {
        val tests = mutableListOf<TestAnalysis>()

        // Find test functions: def test_name():
        val testPattern = Pattern.compile(
            """def\s+(test_\w+)\s*\([^)]*\):\s*\n((?:\s{4,}[^\n]+\n)+)""",
            Pattern.MULTILINE
        )

        val matcher = testPattern.matcher(content)
        while (matcher.find()) {
            val testName = matcher.group(1)
            val testBody = matcher.group(2)
            tests.add(analyzePythonTestBody(testName, testBody))
        }

        return tests
    }

    private fun analyzePythonTestBody(name: String, body: String): TestAnalysis {
        val assertions = mutableListOf<AssertionInfo>()
        val issues = mutableListOf<String>()

        // Check for status_code
        if (body.contains("status_code")) {
            assertions.add(AssertionInfo("statusCode", null, "=="))
        }

        // Check for response.json() assertions
        val jsonPattern = Regex("""assert\s+response\.json\(\)\[["'](\w+)["']\]""")
        jsonPattern.findAll(body).forEach { match ->
            assertions.add(AssertionInfo("body", match.groupValues[1], "assert"))
        }

        // Check for general asserts
        val assertCount = body.split("assert ").size - 1
        if (assertCount > assertions.size) {
            repeat(assertCount - assertions.size) {
                assertions.add(AssertionInfo("assert", null, "custom"))
            }
        }

        val oracleDepth = calculateOracleDepth(assertions)

        if (assertions.isEmpty()) {
            issues.add("No assertions found")
        }

        val score = calculateScore(oracleDepth, assertions.size, issues.size)

        return TestAnalysis(
            name = name,
            oracleDepth = oracleDepth,
            assertionCount = assertions.size,
            assertions = assertions,
            issues = issues,
            score = score
        )
    }

    private fun calculateOracleDepth(assertions: List<AssertionInfo>): OracleDepth {
        if (assertions.isEmpty()) return OracleDepth.L0

        val hasStatusCode = assertions.any { it.type == "statusCode" }
        val hasBody = assertions.any { it.type == "body" }
        val hasNestedField = assertions.any { it.field?.contains(".") == true }
        val hasTypeCheck = assertions.any {
            it.matcher in listOf("isA", "instanceOf", "matches", "matchesPattern")
        }

        return when {
            hasTypeCheck -> OracleDepth.L5
            hasNestedField -> OracleDepth.L4
            hasBody -> OracleDepth.L3
            hasStatusCode && assertions.size > 1 -> OracleDepth.L2
            hasStatusCode -> OracleDepth.L1
            else -> OracleDepth.L0
        }
    }

    private fun calculateScore(depth: OracleDepth, assertionCount: Int, issueCount: Int): Int {
        val depthScore = depth.score
        val densityScore = minOf(100, assertionCount * 15)
        val issuesPenalty = issueCount * 10

        return maxOf(0, (depthScore * 0.6 + densityScore * 0.4 - issuesPenalty).toInt())
    }

    private fun calculateSummary(tests: List<TestAnalysis>): EvaSummary {
        if (tests.isEmpty()) {
            return EvaSummary(
                totalTests = 0,
                averageScore = 0,
                averageOracleDepth = OracleDepth.L0,
                averageAssertions = 0.0,
                grade = EvaGrade.F,
                recommendations = listOf("No tests found")
            )
        }

        val avgScore = tests.map { it.score }.average().toInt()
        val avgAssertions = tests.map { it.assertionCount }.average()
        val avgDepthLevel = tests.map { it.oracleDepth.level }.average().toInt()
        val avgDepth = OracleDepth.values().find { it.level == avgDepthLevel } ?: OracleDepth.L0

        val grade = EvaGrade.values().find { avgScore >= it.minScore } ?: EvaGrade.F

        val recommendations = mutableListOf<String>()
        if (avgDepth.level < 3) {
            recommendations.add("Add body field assertions to reach L3+")
        }
        if (avgAssertions < 3) {
            recommendations.add("Increase assertion density (target: 4+ per test)")
        }
        if (tests.any { it.issues.isNotEmpty() }) {
            recommendations.add("Fix ${tests.sumOf { it.issues.size }} issues found")
        }

        return EvaSummary(
            totalTests = tests.size,
            averageScore = avgScore,
            averageOracleDepth = avgDepth,
            averageAssertions = avgAssertions,
            grade = grade,
            recommendations = recommendations
        )
    }

    private enum class Language {
        JAVA, PYTHON, UNKNOWN
    }
}

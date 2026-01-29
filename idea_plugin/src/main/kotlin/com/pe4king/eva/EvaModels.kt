package com.pe4king.eva

/**
 * EVA (Evaluation of Verification Assets) — Test Quality Analysis.
 * Based on Sharmanka Evaluation Framework.
 */

data class EvaReport(
    val fileName: String,
    val tests: List<TestAnalysis>,
    val summary: EvaSummary
)

data class TestAnalysis(
    val name: String,
    val oracleDepth: OracleDepth,
    val assertionCount: Int,
    val assertions: List<AssertionInfo>,
    val issues: List<String>,
    val score: Int  // 0-100
)

data class AssertionInfo(
    val type: String,       // statusCode, body, header
    val field: String?,     // body field path: "id", "user.email"
    val matcher: String     // equalTo, notNullValue, hasSize
)

data class EvaSummary(
    val totalTests: Int,
    val averageScore: Int,
    val averageOracleDepth: OracleDepth,
    val averageAssertions: Double,
    val grade: EvaGrade,
    val recommendations: List<String>
)

enum class OracleDepth(val level: Int, val description: String, val score: Int) {
    L0(0, "No assertions", 0),
    L1(1, "Status code only", 10),
    L2(2, "Status + response exists", 25),
    L3(3, "Top-level fields", 50),
    L4(4, "Nested fields", 70),
    L5(5, "Field types/formats", 85),
    L6(6, "Business logic", 100)
}

enum class EvaGrade(val minScore: Int, val description: String) {
    S(90, "Production-ready"),
    A(80, "High quality"),
    B(70, "Good base"),
    C(60, "Acceptable draft"),
    D(50, "Weak"),
    F(0, "Not usable")
}

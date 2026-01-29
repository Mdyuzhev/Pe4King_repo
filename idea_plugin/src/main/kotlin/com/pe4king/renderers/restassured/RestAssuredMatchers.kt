package com.pe4king.renderers.restassured

import com.pe4king.core.models.Assertion
import com.pe4king.core.models.FieldType
import com.pe4king.core.models.MatcherType

/**
 * Generates REST Assured Hamcrest matcher code from Assertion model.
 */
class RestAssuredMatchers {

    /**
     * Generates REST Assured body assertion from Assertion model.
     */
    fun fromAssertion(assertion: Assertion): String {
        val path = normalizeJsonPath(assertion.path)

        return when (assertion.matcher) {
            MatcherType.NOT_NULL -> ".body(\"$path\", notNullValue())"
            MatcherType.IS_NULL -> ".body(\"$path\", nullValue())"
            MatcherType.EQUALS -> ".body(\"$path\", equalTo(${toJavaValue(assertion.value)}))"
            MatcherType.NOT_EQUALS -> ".body(\"$path\", not(equalTo(${toJavaValue(assertion.value)})))"
            MatcherType.CONTAINS -> ".body(\"$path\", containsString(\"${assertion.value}\"))"
            MatcherType.MATCHES_PATTERN -> ".body(\"$path\", matchesPattern(\"${escapeJavaString(assertion.value.toString())}\"))"
            MatcherType.ONE_OF -> {
                val values = assertion.value as? List<*> ?: emptyList<Any>()
                val oneOfArgs = values.joinToString(", ") { toJavaValue(it) }
                ".body(\"$path\", oneOf($oneOfArgs))"
            }
            MatcherType.IS_TYPE -> {
                val typeValue = assertion.value
                val javaType = when (typeValue) {
                    is FieldType -> toJavaType(typeValue)
                    is String -> toJavaTypeFromString(typeValue)
                    else -> "Object.class"
                }
                ".body(\"$path\", instanceOf($javaType))"
            }
            MatcherType.NOT_EMPTY -> ".body(\"$path\", not(empty()))"
            MatcherType.IS_EMPTY -> ".body(\"$path\", empty())"
            MatcherType.GREATER_THAN -> ".body(\"$path\", greaterThan(${assertion.value}))"
            MatcherType.GREATER_THAN_OR_EQUAL -> ".body(\"$path\", greaterThanOrEqualTo(${assertion.value}))"
            MatcherType.LESS_THAN -> ".body(\"$path\", lessThan(${assertion.value}))"
            MatcherType.LESS_THAN_OR_EQUAL -> ".body(\"$path\", lessThanOrEqualTo(${assertion.value}))"
            MatcherType.HAS_SIZE -> ".body(\"$path\", hasSize(${assertion.value}))"
            MatcherType.HAS_SIZE_GREATER_THAN -> ".body(\"$path.size()\", greaterThan(${assertion.value}))"
            MatcherType.HAS_SIZE_LESS_THAN -> ".body(\"$path.size()\", lessThan(${assertion.value}))"
            MatcherType.HAS_MIN_LENGTH -> ".body(\"$path.size()\", greaterThanOrEqualTo(${assertion.value}))"
            MatcherType.HAS_MAX_LENGTH -> ".body(\"$path.size()\", lessThanOrEqualTo(${assertion.value}))"
            MatcherType.HAS_KEY -> ".body(\"$path\", hasKey(\"${assertion.value}\"))"
            MatcherType.EVERY -> ".body(\"$path\", everyItem(notNullValue()))"
        }
    }

    /**
     * Generates array not empty check.
     */
    fun arrayNotEmpty(path: String): String {
        val normalized = normalizeJsonPath(path)
        // For root array, use size() check
        return if (normalized.isEmpty()) {
            ".body(\"size()\", greaterThan(0))"
        } else {
            ".body(\"$normalized.size()\", greaterThan(0))"
        }
    }

    /**
     * Normalizes JSON path for REST Assured GPath.
     * - "$" (root) -> "$" (keep for explicit root)
     * - "$.field" -> "field"
     * - "$[0]" -> "[0]"
     * - "$[0].field" -> "[0].field"
     */
    private fun normalizeJsonPath(path: String): String {
        return when {
            path == "$" -> ""
            path.startsWith("$.") -> path.removePrefix("$.")
            path.startsWith("$[") -> path.removePrefix("$")
            else -> path
        }
    }

    private fun toJavaValue(value: Any?): String {
        return when (value) {
            is String -> "\"$value\""
            is Boolean -> value.toString()
            is Int -> value.toString()
            is Long -> "${value}L"
            is Float -> "${value}f"
            is Double -> value.toString()
            null -> "null"
            else -> "\"$value\""
        }
    }

    private fun escapeJavaString(s: String): String {
        return s.replace("\\", "\\\\")
            .replace("\"", "\\\"")
    }

    private fun toJavaType(type: FieldType): String {
        return when (type) {
            FieldType.STRING -> "String.class"
            FieldType.INTEGER -> "Integer.class"
            FieldType.NUMBER -> "Number.class"
            FieldType.BOOLEAN -> "Boolean.class"
            FieldType.ARRAY -> "List.class"
            FieldType.OBJECT -> "Map.class"
            else -> "Object.class"
        }
    }

    private fun toJavaTypeFromString(type: String): String {
        return when (type.lowercase()) {
            "string" -> "String.class"
            "integer" -> "Integer.class"
            "number" -> "Number.class"
            "boolean" -> "Boolean.class"
            "array" -> "List.class"
            "object" -> "Map.class"
            else -> "Object.class"
        }
    }
}

package com.pe4king.renderers.pytest

import com.pe4king.core.models.Assertion
import com.pe4king.core.models.FieldType
import com.pe4king.core.models.MatcherType

/**
 * Generates Python assertion code from Assertion model.
 */
class PytestMatchers {

    /**
     * Generates assertion code from Assertion model.
     */
    fun fromAssertion(assertion: Assertion, varName: String = "data"): String {
        val accessor = buildAccessor(assertion.path, varName)

        return when (assertion.matcher) {
            MatcherType.NOT_NULL -> "assert $accessor is not None"
            MatcherType.IS_NULL -> "assert $accessor is None"
            MatcherType.EQUALS -> "assert $accessor == ${toPythonValue(assertion.value)}"
            MatcherType.NOT_EQUALS -> "assert $accessor != ${toPythonValue(assertion.value)}"
            MatcherType.CONTAINS -> "assert \"${assertion.value}\" in $accessor"
            MatcherType.MATCHES_PATTERN -> "assert re.match(r\"${assertion.value}\", $accessor)"
            MatcherType.ONE_OF -> {
                val values = assertion.value as? List<*> ?: emptyList<Any>()
                "assert $accessor in ${toPythonList(values)}"
            }
            MatcherType.IS_TYPE -> {
                val typeValue = assertion.value
                val pythonType = when (typeValue) {
                    is FieldType -> toPythonType(typeValue)
                    is String -> toPythonTypeFromString(typeValue)
                    else -> "object"
                }
                "assert isinstance($accessor, $pythonType)"
            }
            MatcherType.NOT_EMPTY -> "assert len($accessor) > 0"
            MatcherType.IS_EMPTY -> "assert len($accessor) == 0"
            MatcherType.GREATER_THAN -> "assert $accessor > ${assertion.value}"
            MatcherType.GREATER_THAN_OR_EQUAL -> "assert $accessor >= ${assertion.value}"
            MatcherType.LESS_THAN -> "assert $accessor < ${assertion.value}"
            MatcherType.LESS_THAN_OR_EQUAL -> "assert $accessor <= ${assertion.value}"
            MatcherType.HAS_SIZE -> "assert len($accessor) == ${assertion.value}"
            MatcherType.HAS_SIZE_GREATER_THAN -> "assert len($accessor) > ${assertion.value}"
            MatcherType.HAS_SIZE_LESS_THAN -> "assert len($accessor) < ${assertion.value}"
            MatcherType.HAS_MIN_LENGTH -> "assert len($accessor) >= ${assertion.value}"
            MatcherType.HAS_MAX_LENGTH -> "assert len($accessor) <= ${assertion.value}"
            MatcherType.HAS_KEY -> "assert \"${assertion.value}\" in $accessor"
            MatcherType.EVERY -> "assert all(item is not None for item in $accessor)"
        }
    }

    /**
     * Generates array not empty check.
     */
    fun arrayNotEmpty(path: String, varName: String = "data"): String {
        val accessor = buildAccessor(path, varName)
        return "assert len($accessor) > 0, \"Expected non-empty array at $path\""
    }

    /**
     * Builds Python accessor for JSON path.
     * "user.email" -> data["user"]["email"]
     * "items[0].id" -> data["items"][0]["id"]
     */
    private fun buildAccessor(path: String, varName: String): String {
        if (path == "$") return varName

        val parts = path.removePrefix("$.")
            .split(Regex("\\."))
            .flatMap { part ->
                val arrayMatch = Regex("(.+)\\[(\\d+)\\]").find(part)
                if (arrayMatch != null) {
                    listOf(arrayMatch.groupValues[1], arrayMatch.groupValues[2])
                } else {
                    listOf(part)
                }
            }
            .filter { it.isNotEmpty() }

        var accessor = varName
        for (part in parts) {
            accessor += if (part.all { it.isDigit() }) {
                "[$part]"
            } else {
                "[\"$part\"]"
            }
        }

        return accessor
    }

    private fun toPythonValue(value: Any?): String {
        return when (value) {
            is String -> "\"$value\""
            is Boolean -> if (value) "True" else "False"
            null -> "None"
            else -> value.toString()
        }
    }

    private fun toPythonList(values: List<*>): String {
        val quoted = values.joinToString(", ") { "\"$it\"" }
        return "[$quoted]"
    }

    private fun toPythonType(type: FieldType): String {
        return when (type) {
            FieldType.STRING -> "str"
            FieldType.INTEGER -> "int"
            FieldType.NUMBER -> "(int, float)"
            FieldType.BOOLEAN -> "bool"
            FieldType.ARRAY -> "list"
            FieldType.OBJECT -> "dict"
            else -> "object"
        }
    }

    private fun toPythonTypeFromString(type: String): String {
        return when (type.lowercase()) {
            "string" -> "str"
            "integer" -> "int"
            "number" -> "(int, float)"
            "boolean" -> "bool"
            "array" -> "list"
            "object" -> "dict"
            else -> "object"
        }
    }
}

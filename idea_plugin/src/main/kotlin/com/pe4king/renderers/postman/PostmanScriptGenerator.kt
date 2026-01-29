package com.pe4king.renderers.postman

import com.pe4king.core.models.Assertion
import com.pe4king.core.models.FieldType
import com.pe4king.core.models.MatcherType

/**
 * Generates Postman test scripts using pm.test() and pm.expect() (Chai BDD) syntax.
 */
class PostmanScriptGenerator {

    /**
     * Generates test script for response validation.
     */
    fun generateTestScript(
        statusCode: Int,
        assertions: List<Assertion>,
        testName: String
    ): List<String> {
        val lines = mutableListOf<String>()

        // Status code test
        lines.add("pm.test(\"Status code is $statusCode\", function () {")
        lines.add("    pm.response.to.have.status($statusCode);")
        lines.add("});")
        lines.add("")

        // Skip body validation for no-content responses
        val noContentStatuses = listOf(204, 202)
        if (statusCode in noContentStatuses) {
            lines.add("// No response body expected")
            return lines
        }

        if (assertions.isEmpty()) {
            lines.add("// No response schema defined")
            return lines
        }

        // Response validation test
        lines.add("pm.test(\"$testName - Response validation\", function () {")
        lines.add("    const jsonData = pm.response.json();")
        lines.add("")

        // Array bounds checking
        val checkedArrays = mutableSetOf<String>()

        for (assertion in assertions) {
            val arrayMatch = Regex("^([^\\[]+)\\[0\\]").find(assertion.path)
            if (arrayMatch != null) {
                val arrayPath = arrayMatch.groupValues[1]
                if (arrayPath !in checkedArrays) {
                    checkedArrays.add(arrayPath)
                    val accessor = buildAccessor(arrayPath)
                    lines.add("    pm.expect($accessor).to.be.an('array').that.is.not.empty;")
                }
            }
            lines.add("    ${assertionToScript(assertion)}")
        }

        lines.add("});")
        return lines
    }

    /**
     * Generates pre-request script.
     */
    fun generatePreRequestScript(hasPathParams: Boolean, hasBody: Boolean): List<String> {
        val lines = mutableListOf<String>()
        lines.add("// Pre-request Script")

        if (hasPathParams || hasBody) {
            lines.add("if (!pm.environment.get(\"testUUID\")) {")
            lines.add("    pm.environment.set(\"testUUID\", pm.variables.replaceIn(\"{{${'$'}guid}}\"));")
            lines.add("}")
            lines.add("pm.environment.set(\"timestamp\", new Date().toISOString());")
        }

        return lines
    }

    private fun assertionToScript(assertion: Assertion): String {
        val accessor = buildAccessor(assertion.path)

        return when (assertion.matcher) {
            MatcherType.NOT_NULL -> "pm.expect($accessor).to.not.be.null;"
            MatcherType.IS_NULL -> "pm.expect($accessor).to.be.null;"
            MatcherType.EQUALS -> "pm.expect($accessor).to.eql(${toJsValue(assertion.value)});"
            MatcherType.NOT_EQUALS -> "pm.expect($accessor).to.not.eql(${toJsValue(assertion.value)});"
            MatcherType.CONTAINS -> "pm.expect($accessor).to.include(\"${assertion.value}\");"
            MatcherType.MATCHES_PATTERN -> {
                val pattern = (assertion.value as? String ?: "")
                    .removePrefix("^")
                    .removeSuffix("$")
                    .replace("/", "\\/")
                "pm.expect($accessor).to.match(/$pattern/);"
            }
            MatcherType.ONE_OF -> {
                val values = assertion.value as? List<*> ?: emptyList<Any>()
                "pm.expect(${toJsArray(values)}).to.include($accessor);"
            }
            MatcherType.IS_TYPE -> {
                val jsType = toJsType(assertion.value)
                "pm.expect(typeof $accessor).to.eql(\"$jsType\");"
            }
            MatcherType.NOT_EMPTY -> "pm.expect($accessor).to.not.be.empty;"
            MatcherType.IS_EMPTY -> "pm.expect($accessor).to.be.empty;"
            MatcherType.GREATER_THAN -> "pm.expect($accessor).to.be.above(${assertion.value});"
            MatcherType.GREATER_THAN_OR_EQUAL -> "pm.expect($accessor).to.be.at.least(${assertion.value});"
            MatcherType.LESS_THAN -> "pm.expect($accessor).to.be.below(${assertion.value});"
            MatcherType.LESS_THAN_OR_EQUAL -> "pm.expect($accessor).to.be.at.most(${assertion.value});"
            MatcherType.HAS_SIZE -> "pm.expect($accessor).to.have.lengthOf(${assertion.value});"
            MatcherType.HAS_SIZE_GREATER_THAN -> "pm.expect($accessor.length).to.be.above(${assertion.value});"
            MatcherType.HAS_SIZE_LESS_THAN -> "pm.expect($accessor.length).to.be.below(${assertion.value});"
            MatcherType.HAS_MIN_LENGTH -> "pm.expect($accessor.length).to.be.at.least(${assertion.value});"
            MatcherType.HAS_MAX_LENGTH -> "pm.expect($accessor.length).to.be.at.most(${assertion.value});"
            MatcherType.HAS_KEY -> "pm.expect($accessor).to.have.property(\"${assertion.value}\");"
            MatcherType.EVERY -> "pm.expect($accessor).to.be.an('array');"
        }
    }

    private fun buildAccessor(path: String): String {
        val parts = path.split(Regex("\\.|\\[(\\d+)\\]")).filter { it.isNotEmpty() }
        var accessor = "jsonData"

        for (part in parts) {
            if (part.matches(Regex("^\\d+$"))) {
                accessor += "[$part]"
            } else {
                accessor += "[\"$part\"]"
            }
        }

        return accessor
    }

    private fun toJsValue(value: Any?): String {
        return when (value) {
            null -> "null"
            is String -> "\"$value\""
            is Boolean -> value.toString()
            is Number -> value.toString()
            is List<*> -> toJsArray(value)
            else -> "\"$value\""
        }
    }

    private fun toJsArray(values: List<*>): String {
        return values.joinToString(", ", "[", "]") { toJsValue(it) }
    }

    private fun toJsType(value: Any?): String {
        return when (value) {
            is FieldType -> when (value) {
                FieldType.STRING -> "string"
                FieldType.INTEGER, FieldType.NUMBER -> "number"
                FieldType.BOOLEAN -> "boolean"
                FieldType.ARRAY -> "object" // Arrays are objects in JS typeof
                FieldType.OBJECT -> "object"
                else -> "object"
            }
            is String -> when (value.lowercase()) {
                "string" -> "string"
                "integer", "number" -> "number"
                "boolean" -> "boolean"
                else -> "object"
            }
            else -> "object"
        }
    }
}

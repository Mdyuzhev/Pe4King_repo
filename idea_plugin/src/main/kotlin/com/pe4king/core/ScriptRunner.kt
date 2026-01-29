package com.pe4king.core

import com.intellij.openapi.diagnostic.Logger
import org.graalvm.polyglot.Context
import org.graalvm.polyglot.Value

/**
 * Executes JavaScript test scripts using GraalJS.
 * Collects results as JS arrays, then converts to Kotlin.
 */
class ScriptRunner {

    private val log = Logger.getInstance(ScriptRunner::class.java)

    data class TestResult(
        val name: String,
        val passed: Boolean,
        val error: String? = null
    )

    data class ScriptResult(
        val success: Boolean,
        val tests: List<TestResult>,
        val logs: List<String>,
        val error: String? = null
    )

    /**
     * Execute test script against response.
     */
    fun execute(
        script: String,
        responseStatus: Int,
        responseBody: Any?,
        responseHeaders: Map<String, String>,
        responseTimeMs: Long
    ): ScriptResult {
        if (script.isBlank()) {
            return ScriptResult(success = true, tests = emptyList(), logs = emptyList())
        }

        try {
            // Create GraalJS context with minimal permissions
            val context = Context.newBuilder("js")
                .option("engine.WarnInterpreterOnly", "false")
                .build()

            return context.use { ctx ->
                // Build response object as JS code
                val responseJs = buildResponseJs(responseStatus, responseBody, responseHeaders, responseTimeMs)

                // Wrapper script that collects results in JS arrays
                val wrapperScript = """
                    var __tests = [];
                    var __logs = [];

                    function test(name, condition) {
                        __tests.push({ name: name, passed: Boolean(condition) });
                    }

                    function log() {
                        var args = [];
                        for (var i = 0; i < arguments.length; i++) {
                            var arg = arguments[i];
                            args.push(typeof arg === 'object' ? JSON.stringify(arg) : String(arg));
                        }
                        __logs.push(args.join(' '));
                    }

                    var response = $responseJs;

                    $script

                    // Return results as JSON
                    JSON.stringify({ tests: __tests, logs: __logs });
                """.trimIndent()

                log.info("Executing script...")
                val result = ctx.eval("js", wrapperScript)

                // Parse JSON result
                val jsonResult = result.asString()
                log.info("Script result: $jsonResult")

                parseResults(jsonResult)
            }

        } catch (e: Exception) {
            log.error("Script execution failed: ${e.message}", e)
            return ScriptResult(
                success = false,
                tests = emptyList(),
                logs = emptyList(),
                error = "Script error: ${e.message?.take(200) ?: "Unknown error"}"
            )
        }
    }

    /**
     * Build response object as JS literal.
     */
    private fun buildResponseJs(
        status: Int,
        body: Any?,
        headers: Map<String, String>,
        timeMs: Long
    ): String {
        val bodyJs = toJsLiteral(body)
        val headersJs = headers.entries.joinToString(",") { (k, v) ->
            "\"${escapeJs(k)}\": \"${escapeJs(v)}\""
        }

        return """
            {
                status: $status,
                time: $timeMs,
                body: $bodyJs,
                headers: {$headersJs}
            }
        """.trimIndent()
    }

    /**
     * Convert any value to JS literal.
     */
    private fun toJsLiteral(value: Any?): String {
        return when (value) {
            null -> "null"
            is String -> "\"${escapeJs(value)}\""
            is Number -> value.toString()
            is Boolean -> value.toString()
            is Map<*, *> -> {
                val entries = value.entries.joinToString(",") { (k, v) ->
                    "\"${escapeJs(k.toString())}\": ${toJsLiteral(v)}"
                }
                "{$entries}"
            }
            is List<*> -> {
                val items = value.joinToString(",") { toJsLiteral(it) }
                "[$items]"
            }
            is Array<*> -> {
                val items = value.joinToString(",") { toJsLiteral(it) }
                "[$items]"
            }
            else -> "\"${escapeJs(value.toString())}\""
        }
    }

    /**
     * Escape string for JS.
     */
    private fun escapeJs(str: String): String {
        return str
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
    }

    /**
     * Parse JSON results from script.
     */
    private fun parseResults(json: String): ScriptResult {
        return try {
            val mapper = com.fasterxml.jackson.databind.ObjectMapper()
            val root = mapper.readTree(json)

            val tests = root["tests"]?.map { testNode ->
                TestResult(
                    name = testNode["name"]?.asText() ?: "Unknown",
                    passed = testNode["passed"]?.asBoolean() ?: false
                )
            } ?: emptyList()

            val logs = root["logs"]?.map { it.asText() } ?: emptyList()

            ScriptResult(success = true, tests = tests, logs = logs)
        } catch (e: Exception) {
            log.error("Failed to parse script results: ${e.message}")
            ScriptResult(success = false, tests = emptyList(), logs = emptyList(), error = "Parse error: ${e.message}")
        }
    }
}

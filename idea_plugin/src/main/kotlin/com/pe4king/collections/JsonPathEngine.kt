package com.pe4king.collections

import com.jayway.jsonpath.JsonPath
import com.jayway.jsonpath.PathNotFoundException
import com.jayway.jsonpath.Configuration
import com.jayway.jsonpath.Option

/**
 * JSONPath query engine wrapper.
 * Uses jayway json-path library.
 */
object JsonPathEngine {

    private val config = Configuration.builder()
        .options(Option.SUPPRESS_EXCEPTIONS, Option.DEFAULT_PATH_LEAF_TO_NULL)
        .build()

    /**
     * Query JSON and return all matching values.
     */
    fun query(json: Any, path: String): List<Any?> {
        return try {
            val normalizedPath = normalizePath(path)
            val result = JsonPath.using(config).parse(json).read<Any>(normalizedPath)
            when (result) {
                is List<*> -> result
                null -> emptyList()
                else -> listOf(result)
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * Query JSON and return first matching value.
     */
    fun queryFirst(json: Any, path: String): Any? {
        return query(json, path).firstOrNull()
    }

    /**
     * Check if path exists in JSON.
     */
    fun exists(json: Any, path: String): Boolean {
        return try {
            val normalizedPath = normalizePath(path)
            val result = JsonPath.using(config).parse(json).read<Any>(normalizedPath)
            result != null && (result !is List<*> || result.isNotEmpty())
        } catch (e: PathNotFoundException) {
            false
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Get value by simple dot-path (e.g., "data.user.name").
     */
    fun getByPath(obj: Any?, path: String): Any? {
        if (obj == null || path.isBlank()) return obj

        var current: Any? = obj
        val parts = path.split(".")

        for (part in parts) {
            current = when (current) {
                is Map<*, *> -> current[part]
                is List<*> -> {
                    val index = part.toIntOrNull()
                    if (index != null && index >= 0 && index < current.size) {
                        current[index]
                    } else null
                }
                else -> null
            }
            if (current == null) break
        }

        return current
    }

    /**
     * Normalize path to ensure $ prefix.
     */
    private fun normalizePath(path: String): String {
        val trimmed = path.trim()
        return when {
            trimmed.startsWith("$") -> trimmed
            trimmed.startsWith(".") -> "$$trimmed"
            trimmed.startsWith("[") -> "$$trimmed"
            else -> "$.$trimmed"
        }
    }

    /**
     * Extract value from response by path.
     * Supports: JSONPath ($...), headers.name, status
     */
    fun extractFromResponse(
        response: ResponseData,
        path: String
    ): Any? {
        return when {
            path.startsWith("$") -> queryFirst(response.body ?: emptyMap<String, Any>(), path)
            path.startsWith("headers.") -> response.headers[path.removePrefix("headers.")]
            path == "status" -> response.status
            path == "body" -> response.body
            else -> getByPath(response.body, path)
        }
    }
}

/**
 * Response data for variable extraction.
 */
data class ResponseData(
    val body: Any?,
    val headers: Map<String, String>,
    val status: Int
)

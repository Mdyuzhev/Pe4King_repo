package com.pe4king.collections

import com.fasterxml.jackson.databind.ObjectMapper
import com.pe4king.collections.models.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.Instant
import java.util.concurrent.TimeUnit

/**
 * Test Runner for executing collection requests sequentially.
 */
class TestRunner {

    /**
     * Runner options.
     */
    data class RunnerOptions(
        val environment: Map<String, String> = emptyMap(),
        val stopOnError: Boolean = false,
        val delay: Long = 0
    )

    /**
     * Request run result.
     */
    data class RequestRunResult(
        val requestId: String,
        val requestName: String,
        val method: String,
        var url: String,
        var status: RunStatus = RunStatus.PENDING,
        var httpStatus: Int? = null,
        var httpStatusText: String? = null,
        var responseTime: Long? = null,
        var responseSize: Long? = null,
        var response: ResponseInfo? = null,
        var error: String? = null,
        var assertions: AssertionResults? = null,
        var snippetResults: List<SnippetTestResult> = emptyList()
    )

    data class ResponseInfo(
        val headers: Map<String, String>,
        val body: String
    )

    data class AssertionResults(
        var passed: Int = 0,
        var failed: Int = 0,
        val tests: MutableList<TestResult> = mutableListOf()
    )

    data class TestResult(
        val name: String,
        val passed: Boolean,
        val actual: Any? = null,
        val expected: Any? = null,
        val error: String? = null
    )

    enum class RunStatus {
        PENDING, RUNNING, PASSED, FAILED, ERROR, SKIPPED
    }

    /**
     * ApiCollection run result.
     */
    data class CollectionRunResult(
        val collectionId: String,
        val collectionName: String,
        var status: CollectionStatus = CollectionStatus.RUNNING,
        val startedAt: String = Instant.now().toString(),
        var completedAt: String? = null,
        val totalRequests: Int,
        var completed: Int = 0,
        var passed: Int = 0,
        var failed: Int = 0,
        var errors: Int = 0,
        var skipped: Int = 0,
        var totalTime: Long = 0,
        val results: MutableList<RequestRunResult> = mutableListOf()
    )

    enum class CollectionStatus {
        RUNNING, COMPLETED, STOPPED
    }

    private var isRunning = false
    private var shouldStop = false
    private var currentResult: CollectionRunResult? = null
    private val variableStore = VariableManager.createStore()
    private val objectMapper = ObjectMapper()

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    /**
     * Callback interfaces for progress updates.
     */
    interface RunnerCallback {
        fun onStart(result: CollectionRunResult)
        fun onRequestStart(result: RequestRunResult, index: Int)
        fun onRequestComplete(result: RequestRunResult, index: Int)
        fun onProgress(result: CollectionRunResult)
        fun onComplete(result: CollectionRunResult)
    }

    /**
     * Check if runner is currently executing.
     */
    val running: Boolean get() = isRunning

    /**
     * Get current run result.
     */
    val result: CollectionRunResult? get() = currentResult

    /**
     * Run all requests in a collection.
     */
    fun runCollection(
        collection: ApiCollection,
        options: RunnerOptions = RunnerOptions(),
        callback: RunnerCallback? = null
    ): CollectionRunResult {
        val requests = flattenRequests(collection)
        return runRequests(requests, collection.id, collection.name, options, callback)
    }

    /**
     * Run specific requests in order.
     */
    fun runRequests(
        requests: List<SavedRequest>,
        collectionId: String,
        collectionName: String,
        options: RunnerOptions = RunnerOptions(),
        callback: RunnerCallback? = null
    ): CollectionRunResult {
        if (isRunning) {
            throw IllegalStateException("Runner is already executing")
        }

        isRunning = true
        shouldStop = false

        val result = CollectionRunResult(
            collectionId = collectionId,
            collectionName = collectionName,
            status = CollectionStatus.RUNNING,
            totalRequests = requests.size
        )

        // Initialize results
        for (req in requests) {
            result.results.add(RequestRunResult(
                requestId = req.id,
                requestName = req.name,
                method = req.method,
                url = req.url
            ))
        }

        currentResult = result
        callback?.onStart(result)

        val startTime = System.currentTimeMillis()

        for (i in requests.indices) {
            if (shouldStop) {
                // Mark remaining as skipped
                for (j in i until requests.size) {
                    result.results[j].status = RunStatus.SKIPPED
                    result.skipped++
                }
                break
            }

            val request = requests[i]
            val requestResult = result.results[i]

            requestResult.status = RunStatus.RUNNING
            callback?.onRequestStart(requestResult, i)

            try {
                executeRequest(request, requestResult, options)
                result.completed++

                when (requestResult.status) {
                    RunStatus.PASSED -> result.passed++
                    RunStatus.FAILED -> {
                        result.failed++
                        if (options.stopOnError) shouldStop = true
                    }
                    RunStatus.ERROR -> {
                        result.errors++
                        if (options.stopOnError) shouldStop = true
                    }
                    else -> {}
                }
            } catch (e: Exception) {
                requestResult.status = RunStatus.ERROR
                requestResult.error = e.message
                result.errors++
                result.completed++
                if (options.stopOnError) shouldStop = true
            }

            callback?.onRequestComplete(requestResult, i)
            callback?.onProgress(result)

            // Delay between requests
            if (options.delay > 0 && i < requests.size - 1 && !shouldStop) {
                Thread.sleep(options.delay)
            }
        }

        result.totalTime = System.currentTimeMillis() - startTime
        result.completedAt = Instant.now().toString()
        result.status = if (shouldStop) CollectionStatus.STOPPED else CollectionStatus.COMPLETED

        isRunning = false
        callback?.onComplete(result)

        return result
    }

    /**
     * Execute single request with tests.
     */
    private fun executeRequest(
        request: SavedRequest,
        result: RequestRunResult,
        options: RunnerOptions
    ) {
        val url = VariableManager.replaceVariables(request.url, variableStore)
        val startTime = System.currentTimeMillis()

        val requestBuilder = Request.Builder().url(url)

        // Add headers
        for ((key, value) in request.headers) {
            val resolvedValue = VariableManager.replaceVariables(value, variableStore)
            requestBuilder.addHeader(key, resolvedValue)
        }

        // Set method and body
        val body = request.body?.let { VariableManager.replaceVariables(it, variableStore) }
        val mediaType = "application/json".toMediaType()

        when (request.method.uppercase()) {
            "GET" -> requestBuilder.get()
            "DELETE" -> {
                if (body != null) {
                    requestBuilder.delete(body.toRequestBody(mediaType))
                } else {
                    requestBuilder.delete()
                }
            }
            "POST" -> requestBuilder.post((body ?: "").toRequestBody(mediaType))
            "PUT" -> requestBuilder.put((body ?: "").toRequestBody(mediaType))
            "PATCH" -> requestBuilder.patch((body ?: "").toRequestBody(mediaType))
            "HEAD" -> requestBuilder.head()
            else -> requestBuilder.method(request.method.uppercase(), null)
        }

        val httpRequest = requestBuilder.build()

        try {
            val response = httpClient.newCall(httpRequest).execute()
            val responseTime = System.currentTimeMillis() - startTime
            val responseBody = response.body?.string() ?: ""

            result.url = url
            result.httpStatus = response.code
            result.httpStatusText = response.message
            result.responseTime = responseTime
            result.responseSize = responseBody.length.toLong()

            val headers = mutableMapOf<String, String>()
            for (name in response.headers.names()) {
                headers[name] = response.headers[name] ?: ""
            }
            result.response = ResponseInfo(headers, responseBody)

            // Parse response body as JSON if possible
            val parsedBody: Any? = try {
                objectMapper.readValue(responseBody, Any::class.java)
            } catch (e: Exception) {
                responseBody
            }

            val responseData = ResponseData(
                body = parsedBody,
                headers = headers,
                status = response.code
            )

            // Execute test snippets
            if (request.tests.isNotEmpty()) {
                val snippetResults = executeSnippets(request.tests, responseData)
                result.snippetResults = snippetResults

                val passed = snippetResults.count { it.passed }
                val failed = snippetResults.count { !it.passed }

                result.assertions = AssertionResults(passed, failed)

                result.status = if (failed > 0) RunStatus.FAILED else RunStatus.PASSED
            } else {
                // No tests, check HTTP status
                result.status = if (isSuccessStatus(response.code)) RunStatus.PASSED else RunStatus.FAILED
            }

            // Extract variables
            for (extraction in request.extractVariables) {
                val value = JsonPathEngine.extractFromResponse(responseData, extraction.path)
                VariableManager.setVariable(variableStore, extraction.name, value, request.id)
            }

        } catch (e: Exception) {
            result.status = RunStatus.ERROR
            result.error = e.message
            result.responseTime = System.currentTimeMillis() - startTime
        }
    }

    /**
     * Execute test snippets against response.
     */
    fun executeSnippets(
        snippets: List<TestSnippet>,
        response: ResponseData
    ): List<SnippetTestResult> {
        return snippets
            .filter { it.enabled }
            .map { executeSnippet(it, response) }
    }

    /**
     * Execute single snippet.
     */
    fun executeSnippet(
        snippet: TestSnippet,
        response: ResponseData
    ): SnippetTestResult {
        val name = SnippetLibrary.getSnippetDisplayName(snippet)

        return try {
            val body = response.body
            val headers = response.headers.mapKeys { it.key.lowercase() }

            when (snippet.type) {
                TestSnippetType.STATUS -> SnippetTestResult(
                    snippet = snippet,
                    name = name,
                    passed = response.status == snippet.expected,
                    actual = response.status
                )

                TestSnippetType.STATUS_FAMILY -> {
                    val family = snippet.expected as String
                    val firstDigit = family.first()
                    val passed = response.status.toString().startsWith(firstDigit.toString())
                    SnippetTestResult(snippet, name, passed, response.status)
                }

                TestSnippetType.NOT_EMPTY -> {
                    val notEmpty = body != null && (body !is Map<*, *> || body.isNotEmpty())
                    SnippetTestResult(snippet, name, notEmpty, body?.javaClass?.simpleName)
                }

                TestSnippetType.HAS_JSON_BODY -> {
                    val contentType = headers["content-type"] ?: ""
                    SnippetTestResult(
                        snippet, name,
                        contentType.contains("application/json"),
                        contentType
                    )
                }

                TestSnippetType.HAS_FIELD -> {
                    val hasField = JsonPathEngine.exists(body ?: emptyMap<String, Any>(), snippet.field ?: "")
                    SnippetTestResult(snippet, name, hasField)
                }

                TestSnippetType.FIELD_NOT_NULL -> {
                    val fieldValue = JsonPathEngine.queryFirst(body ?: emptyMap<String, Any>(), snippet.field ?: "")
                    SnippetTestResult(
                        snippet, name,
                        fieldValue != null,
                        fieldValue
                    )
                }

                TestSnippetType.FIELD_EQUALS -> {
                    val actualValue = JsonPathEngine.queryFirst(body ?: emptyMap<String, Any>(), snippet.field ?: "")
                    SnippetTestResult(
                        snippet, name,
                        actualValue == snippet.expected,
                        actualValue
                    )
                }

                TestSnippetType.RESPONSE_TIME -> {
                    // Response time not available in ResponseData, skip
                    SnippetTestResult(snippet, name, true, "N/A")
                }

                TestSnippetType.HEADER_EXISTS -> {
                    val headerKey = snippet.header?.lowercase() ?: ""
                    SnippetTestResult(snippet, name, headers.containsKey(headerKey))
                }

                TestSnippetType.HEADER_EQUALS -> {
                    val headerKey = snippet.header?.lowercase() ?: ""
                    val headerValue = headers[headerKey]
                    SnippetTestResult(
                        snippet, name,
                        headerValue == snippet.expected,
                        headerValue
                    )
                }

                TestSnippetType.ARRAY_LENGTH -> {
                    val arr = JsonPathEngine.query(body ?: emptyMap<String, Any>(), snippet.field ?: "")
                    val actualLength = arr.size
                    val expectedLength = (snippet.expected as? Number)?.toInt() ?: 0
                    val passed = when (snippet.operator) {
                        ComparisonOperator.EQUALS -> actualLength == expectedLength
                        ComparisonOperator.NOT_EQUALS -> actualLength != expectedLength
                        ComparisonOperator.GREATER -> actualLength > expectedLength
                        ComparisonOperator.GREATER_OR_EQUAL -> actualLength >= expectedLength
                        ComparisonOperator.LESS -> actualLength < expectedLength
                        ComparisonOperator.LESS_OR_EQUAL -> actualLength <= expectedLength
                    }
                    SnippetTestResult(snippet, name, passed, actualLength)
                }

                TestSnippetType.ALL_MATCH -> {
                    val items = JsonPathEngine.query(body ?: emptyMap<String, Any>(), snippet.field ?: "")
                    if (items.isEmpty()) {
                        SnippetTestResult(snippet, name, false, "empty array")
                    } else {
                        val allPass = items.all { item ->
                            evaluateItemCondition(item, snippet.condition ?: "")
                        }
                        SnippetTestResult(snippet, name, allPass, "${items.size} items")
                    }
                }

                TestSnippetType.ANY_MATCH -> {
                    val items = JsonPathEngine.query(body ?: emptyMap<String, Any>(), snippet.field ?: "")
                    val anyPass = items.any { item ->
                        evaluateItemCondition(item, snippet.condition ?: "")
                    }
                    SnippetTestResult(snippet, name, anyPass, "${items.size} items")
                }

                TestSnippetType.CUSTOM -> {
                    // Custom expressions not fully supported in Kotlin
                    SnippetTestResult(snippet, name, false, error = "Custom expressions not supported")
                }
            }
        } catch (e: Exception) {
            SnippetTestResult(snippet, name, false, error = e.message)
        }
    }

    /**
     * Evaluate condition on item.
     */
    private fun evaluateItemCondition(item: Any?, condition: String): Boolean {
        if (item == null || item !is Map<*, *>) return false

        val match = Regex("^(\\w+(?:\\.\\w+)*)\\s*(===?|!==?|>=?|<=?)\\s*(.+)$").find(condition)
            ?: return JsonPathEngine.exists(item, "$.$condition")

        val (_, fieldPath, op, expectedStr) = match.groupValues
        val actual = JsonPathEngine.queryFirst(item, "$.$fieldPath")
        val expected = parseConditionValue(expectedStr.trim())

        return when (op) {
            "==", "===" -> actual == expected
            "!=", "!==" -> actual != expected
            ">" -> compareNumbers(actual, expected) > 0
            ">=" -> compareNumbers(actual, expected) >= 0
            "<" -> compareNumbers(actual, expected) < 0
            "<=" -> compareNumbers(actual, expected) <= 0
            else -> false
        }
    }

    private fun compareNumbers(a: Any?, b: Any?): Int {
        val numA = (a as? Number)?.toDouble() ?: 0.0
        val numB = (b as? Number)?.toDouble() ?: 0.0
        return numA.compareTo(numB)
    }

    private fun parseConditionValue(str: String): Any? {
        return when {
            str == "true" -> true
            str == "false" -> false
            str == "null" -> null
            str.matches(Regex("^-?\\d+(\\.\\d+)?$")) -> str.toDouble()
            str.matches(Regex("^['\"](.*)['\"]\$")) -> str.substring(1, str.length - 1)
            else -> str
        }
    }

    /**
     * Stop current execution.
     */
    fun stop() {
        if (isRunning) {
            shouldStop = true
        }
    }

    /**
     * Check if HTTP status is success (2xx).
     */
    fun isSuccessStatus(status: Int?): Boolean {
        return status != null && status in 200..299
    }

    /**
     * Flatten all requests from collection (including folders).
     */
    fun flattenRequests(collection: ApiCollection): List<SavedRequest> {
        val requests = mutableListOf<SavedRequest>()
        requests.addAll(collection.requests)

        fun addFolderRequests(folders: List<CollectionFolder>) {
            for (folder in folders) {
                requests.addAll(folder.requests)
                if (folder.folders.isNotEmpty()) {
                    addFolderRequests(folder.folders)
                }
            }
        }

        addFolderRequests(collection.folders)
        return requests
    }
}

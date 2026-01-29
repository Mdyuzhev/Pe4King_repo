package com.pe4king.collections.models

import java.time.Instant
import java.util.UUID

/**
 * Variable extraction configuration.
 */
data class VariableExtraction(
    val name: String,
    val path: String,
    val scope: VariableScope = VariableScope.COLLECTION
)

enum class VariableScope {
    COLLECTION, FOLDER, REQUEST
}

/**
 * Stored variable with metadata.
 */
data class Variable(
    val name: String,
    val value: Any?,
    val source: String  // requestId where extracted
)

/**
 * Variable store with scoped storage.
 */
data class VariableStore(
    val collectionVars: MutableMap<String, Variable> = mutableMapOf(),
    val folderVars: MutableMap<String, MutableMap<String, Variable>> = mutableMapOf(),
    val lastValues: MutableMap<String, Any?> = mutableMapOf()
)

/**
 * Test snippet types.
 */
enum class TestSnippetType {
    STATUS,
    STATUS_FAMILY,
    NOT_EMPTY,
    HAS_JSON_BODY,
    HAS_FIELD,
    FIELD_EQUALS,
    FIELD_NOT_NULL,
    RESPONSE_TIME,
    HEADER_EXISTS,
    HEADER_EQUALS,
    CUSTOM,
    ARRAY_LENGTH,
    ALL_MATCH,
    ANY_MATCH
}

/**
 * Comparison operators for assertions.
 */
enum class ComparisonOperator(val symbol: String) {
    EQUALS("=="),
    NOT_EQUALS("!="),
    GREATER(">"),
    GREATER_OR_EQUAL(">="),
    LESS("<"),
    LESS_OR_EQUAL("<=")
}

/**
 * Test snippet configuration.
 */
data class TestSnippet(
    val type: TestSnippetType,
    val enabled: Boolean = true,
    val expected: Any? = null,
    val field: String? = null,
    val header: String? = null,
    val maxMs: Int? = null,
    val expression: String? = null,
    val description: String? = null,
    val operator: ComparisonOperator = ComparisonOperator.EQUALS,
    val condition: String? = null
)

/**
 * Result of snippet test execution.
 */
data class SnippetTestResult(
    val snippet: TestSnippet,
    val name: String,
    val passed: Boolean,
    val actual: Any? = null,
    val error: String? = null
)

/**
 * Request body type.
 */
enum class BodyType {
    NONE, RAW, FORM_DATA, X_WWW_FORM_URLENCODED
}

/**
 * Pre-request and test scripts.
 */
data class RequestScripts(
    val preRequest: String? = null,
    val test: String? = null
)

/**
 * Saved request in collection.
 */
data class SavedRequest(
    val id: String = generateId(),
    val name: String,
    val method: String,
    val url: String,
    val headers: Map<String, String> = emptyMap(),
    val body: String? = null,
    val bodyType: BodyType = BodyType.NONE,
    val scripts: RequestScripts? = null,
    val tests: List<TestSnippet> = emptyList(),
    val extractVariables: List<VariableExtraction> = emptyList(),
    val createdAt: String = Instant.now().toString(),
    val updatedAt: String = Instant.now().toString()
)

/**
 * Folder in collection (supports nesting).
 */
data class CollectionFolder(
    val id: String = generateId(),
    val name: String,
    val requests: MutableList<SavedRequest> = mutableListOf(),
    val folders: MutableList<CollectionFolder> = mutableListOf(),
    val createdAt: String = Instant.now().toString()
)

/**
 * Collection of requests.
 */
data class ApiCollection(
    val id: String = generateId(),
    val name: String,
    val description: String? = null,
    val folders: MutableList<CollectionFolder> = mutableListOf(),
    val requests: MutableList<SavedRequest> = mutableListOf(),
    val variables: MutableMap<String, String> = mutableMapOf(),
    val createdAt: String = Instant.now().toString(),
    val updatedAt: String = Instant.now().toString()
)

/**
 * Tree node for UI display.
 */
data class CollectionTreeNode(
    val id: String,
    val type: TreeNodeType,
    val name: String,
    val collectionId: String? = null,
    val method: String? = null,
    val url: String? = null,
    val tests: List<TestSnippet>? = null,
    val children: MutableList<CollectionTreeNode> = mutableListOf()
)

enum class TreeNodeType {
    COLLECTION, FOLDER, REQUEST
}

/**
 * Generate unique ID.
 */
fun generateId(): String = UUID.randomUUID().toString().substring(0, 8)

/**
 * Factory functions.
 */
object CollectionFactory {
    fun createCollection(name: String, description: String? = null) = ApiCollection(
        name = name,
        description = description
    )

    fun createFolder(name: String) = CollectionFolder(name = name)

    fun createRequest(
        name: String,
        method: String,
        url: String,
        headers: Map<String, String> = emptyMap(),
        body: String? = null,
        bodyType: BodyType = BodyType.NONE
    ) = SavedRequest(
        name = name,
        method = method,
        url = url,
        headers = headers,
        body = body,
        bodyType = bodyType
    )
}

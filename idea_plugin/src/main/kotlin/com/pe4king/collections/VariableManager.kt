package com.pe4king.collections

import com.pe4king.collections.models.*

/**
 * Variable extraction and resolution manager.
 */
object VariableManager {

    private val VARIABLE_PATTERN = Regex("\\{\\{(\\w+)}}")

    /**
     * Create new empty variable store.
     */
    fun createStore(): VariableStore = VariableStore()

    /**
     * Extract variables from response.
     */
    fun extractVariables(
        response: ResponseData,
        extractions: List<VariableExtraction>,
        requestId: String
    ): List<Variable> {
        return extractions.mapNotNull { extraction ->
            val value = JsonPathEngine.extractFromResponse(response, extraction.path)
            if (value != null) {
                Variable(
                    name = extraction.name,
                    value = value,
                    source = requestId
                )
            } else null
        }
    }

    /**
     * Store variables in appropriate scope.
     */
    fun storeVariables(
        store: VariableStore,
        variables: List<Variable>,
        scope: VariableScope,
        folderId: String? = null
    ) {
        for (variable in variables) {
            when (scope) {
                VariableScope.COLLECTION -> {
                    store.collectionVars[variable.name] = variable
                }
                VariableScope.FOLDER -> {
                    val vars = store.folderVars.getOrPut(folderId ?: "root") { mutableMapOf() }
                    vars[variable.name] = variable
                }
                VariableScope.REQUEST -> {
                    // Request scope - only store in lastValues
                }
            }
            store.lastValues[variable.name] = variable.value
        }
    }

    /**
     * Get variable value by name.
     */
    fun getVariable(
        store: VariableStore,
        name: String,
        folderId: String? = null
    ): Any? {
        // Priority: folder > collection > lastValues
        if (folderId != null) {
            store.folderVars[folderId]?.get(name)?.let { return it.value }
        }
        store.collectionVars[name]?.let { return it.value }
        return store.lastValues[name]
    }

    /**
     * Resolve variables in string template.
     */
    fun resolveString(
        template: String,
        store: VariableStore,
        folderId: String? = null,
        initialVars: Map<String, String> = emptyMap()
    ): String {
        return VARIABLE_PATTERN.replace(template) { match ->
            val varName = match.groupValues[1]
            val value = initialVars[varName]
                ?: getVariable(store, varName, folderId)?.toString()
                ?: match.value // Keep original if not found
            value
        }
    }

    /**
     * Resolve variables in headers map.
     */
    fun resolveHeaders(
        headers: Map<String, String>,
        store: VariableStore,
        folderId: String? = null,
        initialVars: Map<String, String> = emptyMap()
    ): Map<String, String> {
        return headers.mapValues { (_, value) ->
            resolveString(value, store, folderId, initialVars)
        }
    }

    /**
     * Resolve variables in body.
     */
    fun resolveBody(
        body: String?,
        store: VariableStore,
        folderId: String? = null,
        initialVars: Map<String, String> = emptyMap()
    ): String? {
        return body?.let { resolveString(it, store, folderId, initialVars) }
    }

    /**
     * Resolve all variables in request.
     */
    fun resolveRequest(
        request: SavedRequest,
        store: VariableStore,
        folderId: String? = null,
        initialVars: Map<String, String> = emptyMap()
    ): SavedRequest {
        return request.copy(
            url = resolveString(request.url, store, folderId, initialVars),
            headers = resolveHeaders(request.headers, store, folderId, initialVars),
            body = resolveBody(request.body, store, folderId, initialVars)
        )
    }

    /**
     * Find all variable names in text.
     */
    fun findVariables(text: String): List<String> {
        return VARIABLE_PATTERN.findAll(text)
            .map { it.groupValues[1] }
            .distinct()
            .toList()
    }

    /**
     * Check if text has unresolved variables.
     */
    fun hasUnresolvedVariables(
        text: String,
        store: VariableStore,
        folderId: String? = null,
        initialVars: Map<String, String> = emptyMap()
    ): Boolean {
        return findVariables(text).any { varName ->
            initialVars[varName] == null && getVariable(store, varName, folderId) == null
        }
    }

    /**
     * Get all variable names from store.
     */
    fun getAllVariableNames(store: VariableStore): Set<String> {
        val names = mutableSetOf<String>()
        names.addAll(store.collectionVars.keys)
        store.folderVars.values.forEach { names.addAll(it.keys) }
        names.addAll(store.lastValues.keys)
        return names
    }

    /**
     * Replace variables in string (alias for resolveString).
     */
    fun replaceVariables(text: String, store: VariableStore): String {
        return resolveString(text, store)
    }

    /**
     * Set a variable value in store.
     */
    fun setVariable(store: VariableStore, name: String, value: Any?, source: String) {
        val variable = Variable(name, value, source)
        store.collectionVars[name] = variable
        store.lastValues[name] = value
    }
}

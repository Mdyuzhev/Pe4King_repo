package com.pe4king.collections

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.pe4king.collections.models.*
import java.io.File
import java.time.Instant

private const val COLLECTIONS_FILE = "pe4king-collections.json"
private const val COLLECTIONS_VERSION = "1.0.0"

/**
 * ApiCollections data container.
 */
data class CollectionsData(
    val version: String = COLLECTIONS_VERSION,
    val collections: MutableList<ApiCollection> = mutableListOf()
)

/**
 * ApiCollection Manager - handles persistence and CRUD operations.
 */
@Service(Service.Level.PROJECT)
class CollectionManager(private val project: Project) {

    private var data: CollectionsData
    private val storagePath: String
    private val mapper: ObjectMapper = jacksonObjectMapper().enable(SerializationFeature.INDENT_OUTPUT)

    private val listeners = mutableListOf<() -> Unit>()

    init {
        val pluginDir = File(PathManager.getPluginsPath(), "Pe4King")
        if (!pluginDir.exists()) {
            pluginDir.mkdirs()
        }
        storagePath = File(pluginDir, COLLECTIONS_FILE).absolutePath
        data = load()
    }

    /**
     * Get all collections.
     */
    val collections: List<ApiCollection> get() = data.collections

    /**
     * Add change listener.
     */
    fun addChangeListener(listener: () -> Unit) {
        listeners.add(listener)
    }

    /**
     * Remove change listener.
     */
    fun removeChangeListener(listener: () -> Unit) {
        listeners.remove(listener)
    }

    private fun notifyListeners() {
        listeners.forEach { it.invoke() }
    }

    /**
     * Load collections from storage.
     */
    private fun load(): CollectionsData {
        return try {
            val file = File(storagePath)
            if (file.exists()) {
                mapper.readValue(file)
            } else {
                CollectionsData()
            }
        } catch (e: Exception) {
            println("[Collections] Failed to load: ${e.message}")
            CollectionsData()
        }
    }

    /**
     * Save collections to storage.
     */
    private fun save() {
        try {
            mapper.writeValue(File(storagePath), data)
            notifyListeners()
        } catch (e: Exception) {
            println("[Collections] Failed to save: ${e.message}")
        }
    }

    // ========== Collection Operations ==========

    /**
     * Create new collection.
     */
    fun createCollection(name: String, description: String? = null): ApiCollection {
        val collection = CollectionFactory.createCollection(name, description)
        data.collections.add(collection)
        save()
        return collection
    }

    /**
     * Get collection by ID.
     */
    fun getCollection(collectionId: String): ApiCollection? {
        return data.collections.find { it.id == collectionId }
    }

    /**
     * Update collection.
     */
    fun updateCollection(collectionId: String, name: String? = null, description: String? = null) {
        val collection = getCollection(collectionId) ?: return
        val index = data.collections.indexOf(collection)
        if (index >= 0) {
            data.collections[index] = collection.copy(
                name = name ?: collection.name,
                description = description ?: collection.description,
                updatedAt = Instant.now().toString()
            )
            save()
        }
    }

    /**
     * Delete collection.
     */
    fun deleteCollection(collectionId: String) {
        data.collections.removeIf { it.id == collectionId }
        save()
    }

    // ========== Folder Operations ==========

    /**
     * Create folder in collection or parent folder.
     */
    fun createFolderIn(collectionId: String, name: String, parentFolderId: String? = null): CollectionFolder? {
        val collection = getCollection(collectionId) ?: return null
        val folder = CollectionFactory.createFolder(name)

        if (parentFolderId != null) {
            val parent = findFolder(collection, parentFolderId)
            parent?.folders?.add(folder) ?: return null
        } else {
            collection.folders.add(folder)
        }

        updateCollectionTimestamp(collectionId)
        save()
        return folder
    }

    /**
     * Find folder recursively.
     */
    private fun findFolder(collection: ApiCollection, folderId: String): CollectionFolder? {
        fun searchFolders(folders: List<CollectionFolder>): CollectionFolder? {
            for (folder in folders) {
                if (folder.id == folderId) return folder
                searchFolders(folder.folders)?.let { return it }
            }
            return null
        }
        return searchFolders(collection.folders)
    }

    /**
     * Delete folder.
     */
    fun deleteFolder(collectionId: String, folderId: String) {
        val collection = getCollection(collectionId) ?: return

        fun deleteFolderRecursive(folders: MutableList<CollectionFolder>): Boolean {
            val iterator = folders.iterator()
            while (iterator.hasNext()) {
                val folder = iterator.next()
                if (folder.id == folderId) {
                    iterator.remove()
                    return true
                }
                if (deleteFolderRecursive(folder.folders)) return true
            }
            return false
        }

        if (deleteFolderRecursive(collection.folders)) {
            updateCollectionTimestamp(collectionId)
            save()
        }
    }

    /**
     * Rename folder.
     */
    fun renameFolder(collectionId: String, folderId: String, newName: String) {
        val collection = getCollection(collectionId) ?: return
        val folder = findFolder(collection, folderId) ?: return

        val index = findFolderParent(collection, folderId)
        if (index != null) {
            // Update in parent's list
            val (parent, idx) = index
            if (parent == null) {
                collection.folders[idx] = folder.copy(name = newName)
            } else {
                parent.folders[idx] = folder.copy(name = newName)
            }
            updateCollectionTimestamp(collectionId)
            save()
        }
    }

    private fun findFolderParent(collection: ApiCollection, folderId: String): Pair<CollectionFolder?, Int>? {
        val idx = collection.folders.indexOfFirst { it.id == folderId }
        if (idx >= 0) return null to idx

        fun search(folders: List<CollectionFolder>): Pair<CollectionFolder?, Int>? {
            for (parent in folders) {
                val childIdx = parent.folders.indexOfFirst { it.id == folderId }
                if (childIdx >= 0) return parent to childIdx
                search(parent.folders)?.let { return it }
            }
            return null
        }
        return search(collection.folders)
    }

    // ========== Request Operations ==========

    /**
     * Save request to collection or folder.
     */
    fun saveRequest(
        collectionId: String,
        name: String,
        method: String,
        url: String,
        headers: Map<String, String> = emptyMap(),
        body: String? = null,
        bodyType: BodyType = BodyType.NONE,
        folderId: String? = null,
        scripts: RequestScripts? = null
    ): SavedRequest? {
        val collection = getCollection(collectionId) ?: return null

        val request = CollectionFactory.createRequest(name, method, url, headers, body, bodyType)
            .copy(scripts = scripts)

        if (folderId != null) {
            val folder = findFolder(collection, folderId) ?: return null
            folder.requests.add(request)
        } else {
            collection.requests.add(request)
        }

        updateCollectionTimestamp(collectionId)
        save()
        return request
    }

    /**
     * Update existing request.
     */
    fun updateRequest(collectionId: String, requestId: String, updates: SavedRequest) {
        val collection = getCollection(collectionId) ?: return
        val request = findRequest(collection, requestId) ?: return

        replaceRequest(collection, requestId, updates.copy(
            id = request.id,
            createdAt = request.createdAt,
            updatedAt = Instant.now().toString()
        ))
        updateCollectionTimestamp(collectionId)
        save()
    }

    /**
     * Find request recursively.
     */
    private fun findRequest(collection: ApiCollection, requestId: String): SavedRequest? {
        collection.requests.find { it.id == requestId }?.let { return it }

        fun searchFolders(folders: List<CollectionFolder>): SavedRequest? {
            for (folder in folders) {
                folder.requests.find { it.id == requestId }?.let { return it }
                searchFolders(folder.folders)?.let { return it }
            }
            return null
        }
        return searchFolders(collection.folders)
    }

    private fun replaceRequest(collection: ApiCollection, requestId: String, newRequest: SavedRequest): Boolean {
        val idx = collection.requests.indexOfFirst { it.id == requestId }
        if (idx >= 0) {
            collection.requests[idx] = newRequest
            return true
        }

        fun replaceInFolders(folders: MutableList<CollectionFolder>): Boolean {
            for (folder in folders) {
                val fidx = folder.requests.indexOfFirst { it.id == requestId }
                if (fidx >= 0) {
                    folder.requests[fidx] = newRequest
                    return true
                }
                if (replaceInFolders(folder.folders)) return true
            }
            return false
        }
        return replaceInFolders(collection.folders)
    }

    /**
     * Delete request.
     */
    fun deleteRequest(collectionId: String, requestId: String) {
        val collection = getCollection(collectionId) ?: return

        if (collection.requests.removeIf { it.id == requestId }) {
            updateCollectionTimestamp(collectionId)
            save()
            return
        }

        fun deleteFromFolders(folders: MutableList<CollectionFolder>): Boolean {
            for (folder in folders) {
                if (folder.requests.removeIf { it.id == requestId }) return true
                if (deleteFromFolders(folder.folders)) return true
            }
            return false
        }

        if (deleteFromFolders(collection.folders)) {
            updateCollectionTimestamp(collectionId)
            save()
        }
    }

    /**
     * Get request by ID.
     */
    fun getRequest(collectionId: String, requestId: String): SavedRequest? {
        val collection = getCollection(collectionId) ?: return null
        return findRequest(collection, requestId)
    }

    // ========== Test Snippet Operations ==========

    /**
     * Add test snippet to request.
     */
    fun addTestToRequest(collectionId: String, requestId: String, snippet: TestSnippet) {
        val collection = getCollection(collectionId) ?: return
        val request = findRequest(collection, requestId) ?: return

        val updatedTests = request.tests.toMutableList()
        updatedTests.add(snippet)

        replaceRequest(collection, requestId, request.copy(
            tests = updatedTests,
            updatedAt = Instant.now().toString()
        ))
        updateCollectionTimestamp(collectionId)
        save()
    }

    /**
     * Remove test snippet from request.
     */
    fun removeTestFromRequest(collectionId: String, requestId: String, index: Int) {
        val collection = getCollection(collectionId) ?: return
        val request = findRequest(collection, requestId) ?: return
        if (index < 0 || index >= request.tests.size) return

        val updatedTests = request.tests.toMutableList()
        updatedTests.removeAt(index)

        replaceRequest(collection, requestId, request.copy(
            tests = updatedTests,
            updatedAt = Instant.now().toString()
        ))
        updateCollectionTimestamp(collectionId)
        save()
    }

    /**
     * Toggle test enabled/disabled.
     */
    fun toggleTest(collectionId: String, requestId: String, index: Int) {
        val collection = getCollection(collectionId) ?: return
        val request = findRequest(collection, requestId) ?: return
        if (index < 0 || index >= request.tests.size) return

        val updatedTests = request.tests.toMutableList()
        val test = updatedTests[index]
        updatedTests[index] = test.copy(enabled = !test.enabled)

        replaceRequest(collection, requestId, request.copy(
            tests = updatedTests,
            updatedAt = Instant.now().toString()
        ))
        updateCollectionTimestamp(collectionId)
        save()
    }

    /**
     * Get all tests for a request.
     */
    fun getRequestTests(collectionId: String, requestId: String): List<TestSnippet> {
        val collection = getCollection(collectionId) ?: return emptyList()
        val request = findRequest(collection, requestId) ?: return emptyList()
        return request.tests
    }

    /**
     * Replace all tests for a request.
     */
    fun updateRequestTests(collectionId: String, requestId: String, tests: List<TestSnippet>) {
        val collection = getCollection(collectionId) ?: return
        val request = findRequest(collection, requestId) ?: return

        replaceRequest(collection, requestId, request.copy(
            tests = tests,
            updatedAt = Instant.now().toString()
        ))
        updateCollectionTimestamp(collectionId)
        save()
    }

    // ========== Variable Extraction Methods ==========

    /**
     * Add variable extraction to request.
     */
    fun addExtractionToRequest(collectionId: String, requestId: String, extraction: VariableExtraction) {
        val collection = getCollection(collectionId) ?: return
        val request = findRequest(collection, requestId) ?: return

        val updatedExtractions = request.extractVariables.toMutableList()
        updatedExtractions.add(extraction)

        replaceRequest(collection, requestId, request.copy(
            extractVariables = updatedExtractions,
            updatedAt = Instant.now().toString()
        ))
        updateCollectionTimestamp(collectionId)
        save()
    }

    /**
     * Remove variable extraction from request.
     */
    fun removeExtractionFromRequest(collectionId: String, requestId: String, index: Int) {
        val collection = getCollection(collectionId) ?: return
        val request = findRequest(collection, requestId) ?: return
        if (index < 0 || index >= request.extractVariables.size) return

        val updatedExtractions = request.extractVariables.toMutableList()
        updatedExtractions.removeAt(index)

        replaceRequest(collection, requestId, request.copy(
            extractVariables = updatedExtractions,
            updatedAt = Instant.now().toString()
        ))
        updateCollectionTimestamp(collectionId)
        save()
    }

    /**
     * Get all extractions for a request.
     */
    fun getRequestExtractions(collectionId: String, requestId: String): List<VariableExtraction> {
        val collection = getCollection(collectionId) ?: return emptyList()
        val request = findRequest(collection, requestId) ?: return emptyList()
        return request.extractVariables
    }

    // ========== Export ==========

    /**
     * Export collection to Postman format.
     */
    fun exportToPostman(collectionId: String): Map<String, Any>? {
        val collection = getCollection(collectionId) ?: return null

        fun convertRequest(req: SavedRequest) = mapOf(
            "name" to req.name,
            "request" to mapOf(
                "method" to req.method,
                "header" to req.headers.map { (key, value) -> mapOf("key" to key, "value" to value) },
                "url" to mapOf("raw" to req.url),
                "body" to if (req.body != null) mapOf(
                    "mode" to if (req.bodyType == BodyType.RAW) "raw" else "urlencoded",
                    "raw" to req.body
                ) else null
            )
        )

        fun convertFolder(folder: CollectionFolder): Map<String, Any> = mapOf(
            "name" to folder.name,
            "item" to folder.requests.map { convertRequest(it) } + folder.folders.map { convertFolder(it) }
        )

        return mapOf(
            "info" to mapOf(
                "name" to collection.name,
                "description" to (collection.description ?: ""),
                "schema" to "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            ),
            "item" to collection.requests.map { convertRequest(it) } + collection.folders.map { convertFolder(it) }
        )
    }

    /**
     * Get tree structure for UI.
     */
    fun getTreeData(): List<CollectionTreeNode> {
        return data.collections.map { collectionToTreeNode(it) }
    }

    private fun collectionToTreeNode(collection: ApiCollection): CollectionTreeNode {
        return CollectionTreeNode(
            id = collection.id,
            type = TreeNodeType.COLLECTION,
            name = collection.name,
            children = (collection.requests.map { requestToTreeNode(it, collection.id) } +
                    collection.folders.map { folderToTreeNode(it, collection.id) }).toMutableList()
        )
    }

    private fun folderToTreeNode(folder: CollectionFolder, collectionId: String): CollectionTreeNode {
        return CollectionTreeNode(
            id = folder.id,
            type = TreeNodeType.FOLDER,
            name = folder.name,
            collectionId = collectionId,
            children = (folder.requests.map { requestToTreeNode(it, collectionId) } +
                    folder.folders.map { folderToTreeNode(it, collectionId) }).toMutableList()
        )
    }

    private fun requestToTreeNode(request: SavedRequest, collectionId: String): CollectionTreeNode {
        return CollectionTreeNode(
            id = request.id,
            type = TreeNodeType.REQUEST,
            name = request.name,
            collectionId = collectionId,
            method = request.method,
            url = request.url,
            tests = request.tests
        )
    }

    private fun updateCollectionTimestamp(collectionId: String) {
        val idx = data.collections.indexOfFirst { it.id == collectionId }
        if (idx >= 0) {
            val c = data.collections[idx]
            data.collections[idx] = c.copy(updatedAt = Instant.now().toString())
        }
    }

    companion object {
        fun getInstance(project: Project): CollectionManager {
            return project.getService(CollectionManager::class.java)
        }
    }
}

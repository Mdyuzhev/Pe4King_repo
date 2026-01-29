package com.pe4king.ui.panels

import com.intellij.icons.AllIcons
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.pe4king.services.Pe4KingProjectService
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.JBUI
import com.pe4king.collections.CollectionManager
import com.pe4king.collections.TestRunner
import com.pe4king.collections.models.*
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Component
import java.awt.FlowLayout
import java.awt.Font
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.*
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeCellRenderer
import javax.swing.tree.DefaultTreeModel

/**
 * Panel for managing collections.
 */
class CollectionsPanel(
    private val project: Project,
    private val onRequestSelected: (SavedRequest, String) -> Unit
) : JPanel(BorderLayout()) {

    private val manager = CollectionManager.getInstance(project)
    private val tree: Tree
    private val rootNode = DefaultMutableTreeNode("Collections")
    private val treeModel = DefaultTreeModel(rootNode)

    init {
        // Toolbar
        val toolbar = createToolbar()
        add(toolbar, BorderLayout.NORTH)

        // Tree
        tree = Tree(treeModel)
        tree.isRootVisible = false
        tree.showsRootHandles = true
        tree.cellRenderer = CollectionTreeCellRenderer()

        tree.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                if (e.clickCount == 2) {
                    val path = tree.getPathForLocation(e.x, e.y) ?: return
                    val node = path.lastPathComponent as? DefaultMutableTreeNode ?: return
                    val userObj = node.userObject
                    if (userObj is RequestNodeData) {
                        onRequestSelected(userObj.request, userObj.collectionId)
                    }
                }
            }

            override fun mousePressed(e: MouseEvent) {
                if (e.isPopupTrigger) showPopup(e)
            }

            override fun mouseReleased(e: MouseEvent) {
                if (e.isPopupTrigger) showPopup(e)
            }
        })

        add(JBScrollPane(tree), BorderLayout.CENTER)

        // Listen for changes
        manager.addChangeListener { refresh() }

        // Initial load
        refresh()
    }

    private fun createToolbar(): JPanel {
        val toolbar = JPanel(FlowLayout(FlowLayout.LEFT, 4, 4))
        toolbar.border = JBUI.Borders.empty(2)

        val addCollectionBtn = JButton(AllIcons.General.Add)
        addCollectionBtn.toolTipText = "New Collection"
        addCollectionBtn.addActionListener { createCollection() }
        toolbar.add(addCollectionBtn)

        val fromSpecBtn = JButton(AllIcons.Actions.Download)
        fromSpecBtn.toolTipText = "Create from Spec"
        fromSpecBtn.addActionListener { createCollectionFromSpec() }
        toolbar.add(fromSpecBtn)

        val runBtn = JButton(AllIcons.Actions.Execute)
        runBtn.toolTipText = "Run Collection"
        runBtn.addActionListener { runSelectedCollection() }
        toolbar.add(runBtn)

        val refreshBtn = JButton(AllIcons.Actions.Refresh)
        refreshBtn.toolTipText = "Refresh"
        refreshBtn.addActionListener { refresh() }
        toolbar.add(refreshBtn)

        return toolbar
    }

    private fun showPopup(e: MouseEvent) {
        val path = tree.getPathForLocation(e.x, e.y) ?: return
        tree.selectionPath = path
        val node = path.lastPathComponent as? DefaultMutableTreeNode ?: return
        val userObj = node.userObject

        val popup = JPopupMenu()

        when (userObj) {
            is CollectionNodeData -> {
                popup.add(JMenuItem("Add Folder").apply {
                    addActionListener { createFolder(userObj.collection.id, null) }
                })
                popup.add(JMenuItem("Rename").apply {
                    addActionListener { renameCollection(userObj.collection) }
                })
                popup.addSeparator()
                popup.add(JMenuItem("Delete").apply {
                    addActionListener { deleteCollection(userObj.collection) }
                })
            }
            is FolderNodeData -> {
                popup.add(JMenuItem("Add Subfolder").apply {
                    addActionListener { createFolder(userObj.collectionId, userObj.folder.id) }
                })
                popup.add(JMenuItem("Rename").apply {
                    addActionListener { renameFolder(userObj.collectionId, userObj.folder) }
                })
                popup.addSeparator()
                popup.add(JMenuItem("Delete").apply {
                    addActionListener { deleteFolder(userObj.collectionId, userObj.folder.id) }
                })
            }
            is RequestNodeData -> {
                popup.add(JMenuItem("Open").apply {
                    addActionListener { onRequestSelected(userObj.request, userObj.collectionId) }
                })
                popup.addSeparator()
                popup.add(JMenuItem("Delete").apply {
                    addActionListener { deleteRequest(userObj.collectionId, userObj.request.id) }
                })
            }
        }

        if (popup.componentCount > 0) {
            popup.show(tree, e.x, e.y)
        }
    }

    fun refresh() {
        rootNode.removeAllChildren()

        for (collection in manager.collections) {
            val collectionNode = DefaultMutableTreeNode(CollectionNodeData(collection))

            // Add folders
            addFolders(collectionNode, collection.folders, collection.id)

            // Add root requests
            for (request in collection.requests) {
                collectionNode.add(DefaultMutableTreeNode(RequestNodeData(request, collection.id)))
            }

            rootNode.add(collectionNode)
        }

        treeModel.reload()
        expandAll()
    }

    private fun addFolders(parentNode: DefaultMutableTreeNode, folders: List<CollectionFolder>, collectionId: String) {
        for (folder in folders) {
            val folderNode = DefaultMutableTreeNode(FolderNodeData(folder, collectionId))

            // Add subfolders
            addFolders(folderNode, folder.folders, collectionId)

            // Add requests
            for (request in folder.requests) {
                folderNode.add(DefaultMutableTreeNode(RequestNodeData(request, collectionId)))
            }

            parentNode.add(folderNode)
        }
    }

    private fun expandAll() {
        var row = 0
        while (row < tree.rowCount) {
            tree.expandRow(row)
            row++
        }
    }

    private fun createCollection() {
        val name = Messages.showInputDialog(
            project,
            "Collection name:",
            "New Collection",
            null
        )
        if (!name.isNullOrBlank()) {
            manager.createCollection(name)
            refresh()
        }
    }

    private fun createFolder(collectionId: String, parentFolderId: String?) {
        val name = Messages.showInputDialog(
            project,
            "Folder name:",
            "New Folder",
            null
        )
        if (!name.isNullOrBlank()) {
            manager.createFolderIn(collectionId, name, parentFolderId)
            refresh()
        }
    }

    private fun renameCollection(collection: ApiCollection) {
        val newName = Messages.showInputDialog(
            project,
            "New name:",
            "Rename Collection",
            null,
            collection.name,
            null
        )
        if (!newName.isNullOrBlank()) {
            manager.updateCollection(collection.id, name = newName)
            refresh()
        }
    }

    private fun renameFolder(collectionId: String, folder: CollectionFolder) {
        val newName = Messages.showInputDialog(
            project,
            "New name:",
            "Rename Folder",
            null,
            folder.name,
            null
        )
        if (!newName.isNullOrBlank()) {
            manager.renameFolder(collectionId, folder.id, newName)
            refresh()
        }
    }

    private fun deleteCollection(collection: ApiCollection) {
        val result = Messages.showYesNoDialog(
            project,
            "Delete collection '${collection.name}'?",
            "Delete Collection",
            null
        )
        if (result == Messages.YES) {
            manager.deleteCollection(collection.id)
            refresh()
        }
    }

    private fun deleteFolder(collectionId: String, folderId: String) {
        val result = Messages.showYesNoDialog(
            project,
            "Delete folder and all its contents?",
            "Delete Folder",
            null
        )
        if (result == Messages.YES) {
            manager.deleteFolder(collectionId, folderId)
            refresh()
        }
    }

    private fun deleteRequest(collectionId: String, requestId: String) {
        val result = Messages.showYesNoDialog(
            project,
            "Delete this request?",
            "Delete Request",
            null
        )
        if (result == Messages.YES) {
            manager.deleteRequest(collectionId, requestId)
            refresh()
        }
    }

    /**
     * Create collection from loaded OpenAPI spec.
     */
    private fun createCollectionFromSpec() {
        val service = project.service<Pe4KingProjectService>()
        val spec = service.currentSpec

        if (spec == null) {
            Messages.showWarningDialog(
                project,
                "Please open an OpenAPI specification first.",
                "No Specification"
            )
            return
        }

        val collectionName = Messages.showInputDialog(
            project,
            "Collection name:",
            "Create from Spec",
            null,
            spec.title,
            null
        )
        if (collectionName.isNullOrBlank()) return

        val collection = manager.createCollection(collectionName, "Generated from ${spec.title} v${spec.version}")
        val baseUrl = spec.baseUrl

        // Group endpoints by tag
        val grouped = spec.endpoints.groupBy { it.tags.firstOrNull() ?: "Default" }

        for ((tag, endpoints) in grouped) {
            val folder = manager.createFolderIn(collection.id, tag)

            for (endpoint in endpoints) {
                val requestName = endpoint.summary ?: endpoint.operationId ?: "${endpoint.method} ${endpoint.path}"
                val url = "$baseUrl${endpoint.path}"
                val method = endpoint.method.name

                val headers = mutableMapOf("Content-Type" to "application/json")

                // Generate example body for POST/PUT/PATCH
                val body = if (endpoint.method in listOf(
                        com.pe4king.core.models.HttpMethod.POST,
                        com.pe4king.core.models.HttpMethod.PUT,
                        com.pe4king.core.models.HttpMethod.PATCH
                    )
                ) {
                    endpoint.requestBodyExample?.toString()
                        ?: generateExampleBody(endpoint.requestBodySchema)
                } else null

                manager.saveRequest(
                    collectionId = collection.id,
                    name = requestName,
                    method = method,
                    url = url,
                    headers = headers,
                    body = body,
                    bodyType = if (body != null) BodyType.RAW else BodyType.NONE,
                    folderId = folder?.id
                )
            }
        }

        refresh()
        Messages.showInfoMessage(
            project,
            "Created collection '${collectionName}' with ${spec.endpoints.size} requests.",
            "Collection Created"
        )
    }

    /**
     * Generate example JSON body from schema fields.
     */
    private fun generateExampleBody(fields: List<com.pe4king.core.models.SchemaField>): String? {
        if (fields.isEmpty()) return null

        val obj = mutableMapOf<String, Any?>()
        for (field in fields) {
            if (field.path == "$" || field.path.contains("[")) continue
            val key = field.name
            obj[key] = when (field.fieldType) {
                com.pe4king.core.models.FieldType.STRING -> field.enumValues?.firstOrNull() ?: "string"
                com.pe4king.core.models.FieldType.INTEGER -> 0
                com.pe4king.core.models.FieldType.NUMBER -> 0.0
                com.pe4king.core.models.FieldType.BOOLEAN -> false
                com.pe4king.core.models.FieldType.ARRAY -> emptyList<Any>()
                com.pe4king.core.models.FieldType.OBJECT -> emptyMap<String, Any>()
                else -> null
            }
        }

        return try {
            com.fasterxml.jackson.databind.ObjectMapper()
                .writerWithDefaultPrettyPrinter()
                .writeValueAsString(obj)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Save current request to collection.
     */
    fun saveRequest(
        name: String,
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String?,
        bodyType: BodyType
    ) {
        // Get or create collection
        val collections = manager.collections
        val collectionId = if (collections.isEmpty()) {
            val collection = manager.createCollection("My Collection")
            collection.id
        } else {
            // Show dialog to select collection
            val names = collections.map { it.name }.toTypedArray()
            val selected = Messages.showEditableChooseDialog(
                "Select collection:",
                "Save Request",
                null,
                names,
                names.firstOrNull() ?: "",
                null
            )
            if (selected.isNullOrBlank()) return
            collections.find { it.name == selected }?.id ?: return
        }

        manager.saveRequest(collectionId, name, method, url, headers, body, bodyType)
        refresh()
        Messages.showInfoMessage(project, "Request saved to collection", "Saved")
    }

    /**
     * Run selected collection.
     */
    private fun runSelectedCollection() {
        val path = tree.selectionPath ?: return
        val node = path.lastPathComponent as? DefaultMutableTreeNode ?: return
        val userObj = node.userObject

        val collection = when (userObj) {
            is CollectionNodeData -> userObj.collection
            is FolderNodeData -> manager.getCollection(userObj.collectionId)
            is RequestNodeData -> manager.getCollection(userObj.collectionId)
            else -> null
        }

        if (collection == null) {
            Messages.showWarningDialog(project, "Please select a collection to run", "No Collection")
            return
        }

        val requests = TestRunner().flattenRequests(collection)
        if (requests.isEmpty()) {
            Messages.showWarningDialog(project, "Collection has no requests", "Empty Collection")
            return
        }

        // Run in background
        ApplicationManager.getApplication().executeOnPooledThread {
            val runner = TestRunner()
            val result = runner.runCollection(collection)

            ApplicationManager.getApplication().invokeLater {
                showRunResults(result)
            }
        }
    }

    /**
     * Show run results dialog.
     */
    private fun showRunResults(result: TestRunner.CollectionRunResult) {
        val window = SwingUtilities.getWindowAncestor(this)
        val dialog = if (window is java.awt.Frame) {
            JDialog(window, "Run Results", true)
        } else {
            JDialog(null as java.awt.Frame?, "Run Results", true)
        }
        dialog.setLayout(BorderLayout())

        // Summary panel
        val summaryPanel = JPanel()
        summaryPanel.setLayout(BoxLayout(summaryPanel, BoxLayout.Y_AXIS))
        summaryPanel.border = JBUI.Borders.empty(10)

        val titleLabel = JLabel("${result.collectionName}")
        titleLabel.font = titleLabel.font.deriveFont(Font.BOLD, 16f)
        summaryPanel.add(titleLabel)
        summaryPanel.add(Box.createVerticalStrut(10))

        val statsText = """
            Total: ${result.totalRequests} |
            Passed: ${result.passed} |
            Failed: ${result.failed} |
            Errors: ${result.errors} |
            Time: ${result.totalTime}ms
        """.trimIndent().replace("\n", "")

        val statsLabel = JLabel(statsText)
        summaryPanel.add(statsLabel)
        summaryPanel.add(Box.createVerticalStrut(10))

        // Results list
        val resultsPanel = JPanel()
        resultsPanel.setLayout(BoxLayout(resultsPanel, BoxLayout.Y_AXIS))

        for (reqResult in result.results) {
            val statusIcon = when (reqResult.status) {
                TestRunner.RunStatus.PASSED -> "✓"
                TestRunner.RunStatus.FAILED -> "✗"
                TestRunner.RunStatus.ERROR -> "!"
                TestRunner.RunStatus.SKIPPED -> "○"
                else -> "?"
            }

            val statusColor = when (reqResult.status) {
                TestRunner.RunStatus.PASSED -> Color(97, 175, 121)
                TestRunner.RunStatus.FAILED -> Color(224, 108, 117)
                TestRunner.RunStatus.ERROR -> Color(224, 108, 117)
                else -> Color.GRAY
            }

            val requestPanel = JPanel(BorderLayout())
            requestPanel.border = JBUI.Borders.empty(4)

            val methodColor = getMethodColor(reqResult.method)
            val labelHtml = "<html><font color='$methodColor'>${reqResult.method}</font> ${reqResult.requestName}</html>"
            val nameLabel = JLabel(labelHtml)

            val statusStr = if (reqResult.httpStatus != null) {
                "${reqResult.httpStatus} (${reqResult.responseTime}ms)"
            } else {
                reqResult.error ?: "Unknown"
            }
            val statusLabel = JLabel("$statusIcon $statusStr")
            statusLabel.foreground = statusColor

            requestPanel.add(nameLabel, BorderLayout.CENTER)
            requestPanel.add(statusLabel, BorderLayout.EAST)

            // Show test results if any
            if (reqResult.snippetResults.isNotEmpty()) {
                val testsPanel = JPanel()
                testsPanel.setLayout(BoxLayout(testsPanel, BoxLayout.Y_AXIS))
                testsPanel.border = JBUI.Borders.empty(0, 20, 0, 0)

                for (snippetResult in reqResult.snippetResults) {
                    val testIcon = if (snippetResult.passed) "✓" else "✗"
                    val testColor = if (snippetResult.passed) Color(97, 175, 121) else Color(224, 108, 117)
                    val testLabel = JLabel("  $testIcon ${snippetResult.name}")
                    testLabel.foreground = testColor
                    testLabel.font = testLabel.font.deriveFont(11f)
                    testsPanel.add(testLabel)
                }

                val wrapper = JPanel(BorderLayout())
                wrapper.add(requestPanel, BorderLayout.NORTH)
                wrapper.add(testsPanel, BorderLayout.CENTER)
                resultsPanel.add(wrapper)
            } else {
                resultsPanel.add(requestPanel)
            }
        }

        val scrollPane = JBScrollPane(resultsPanel)
        scrollPane.preferredSize = java.awt.Dimension(500, 400)

        dialog.add(summaryPanel, BorderLayout.NORTH)
        dialog.add(scrollPane, BorderLayout.CENTER)

        val closeBtn = JButton("Close")
        closeBtn.addActionListener { dialog.dispose() }
        val btnPanel = JPanel()
        btnPanel.add(closeBtn)
        dialog.add(btnPanel, BorderLayout.SOUTH)

        dialog.pack()
        dialog.setLocationRelativeTo(this)
        dialog.setVisible(true)
    }

    private fun getMethodColor(method: String): String {
        return when (method.uppercase()) {
            "GET" -> "#61affe"
            "POST" -> "#49cc90"
            "PUT" -> "#fca130"
            "PATCH" -> "#50e3c2"
            "DELETE" -> "#f93e3e"
            else -> "#999999"
        }
    }

    // Node data classes
    data class CollectionNodeData(val collection: ApiCollection)
    data class FolderNodeData(val folder: CollectionFolder, val collectionId: String)
    data class RequestNodeData(val request: SavedRequest, val collectionId: String)

    /**
     * Custom tree cell renderer.
     */
    private inner class CollectionTreeCellRenderer : DefaultTreeCellRenderer() {
        override fun getTreeCellRendererComponent(
            tree: JTree,
            value: Any?,
            selected: Boolean,
            expanded: Boolean,
            leaf: Boolean,
            row: Int,
            hasFocus: Boolean
        ): Component {
            super.getTreeCellRendererComponent(tree, value, selected, expanded, leaf, row, hasFocus)

            val node = value as? DefaultMutableTreeNode ?: return this
            when (val userObj = node.userObject) {
                is CollectionNodeData -> {
                    text = userObj.collection.name
                    icon = AllIcons.Nodes.Folder
                }
                is FolderNodeData -> {
                    text = userObj.folder.name
                    icon = AllIcons.Nodes.Package
                }
                is RequestNodeData -> {
                    val method = userObj.request.method
                    text = "<html><font color='${getMethodColor(method)}'>${method}</font> ${userObj.request.name}</html>"
                    icon = AllIcons.Nodes.Method
                }
            }

            return this
        }

        private fun getMethodColor(method: String): String {
            return when (method.uppercase()) {
                "GET" -> "#61affe"
                "POST" -> "#49cc90"
                "PUT" -> "#fca130"
                "PATCH" -> "#50e3c2"
                "DELETE" -> "#f93e3e"
                else -> "#999999"
            }
        }
    }
}

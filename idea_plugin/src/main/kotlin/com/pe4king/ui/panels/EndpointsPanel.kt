package com.pe4king.ui.panels

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.ui.ColoredTreeCellRenderer
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.JBUI
import com.pe4king.core.models.EndpointInfo
import com.pe4king.core.models.HttpMethod
import com.pe4king.services.Pe4KingProjectService
import java.awt.BorderLayout
import java.awt.Color
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel

/**
 * Panel displaying API endpoints in a tree structure grouped by tags.
 */
class EndpointsPanel(
    private val project: Project,
    private val onEndpointSelected: (EndpointInfo) -> Unit
) : JPanel(BorderLayout()) {

    private val rootNode = DefaultMutableTreeNode("No specification loaded")
    private val treeModel = DefaultTreeModel(rootNode)
    private val tree = Tree(treeModel)

    init {
        tree.cellRenderer = EndpointTreeCellRenderer()
        tree.isRootVisible = true
        tree.showsRootHandles = true

        tree.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                if (e.clickCount == 2) {
                    val node = tree.lastSelectedPathComponent as? DefaultMutableTreeNode ?: return
                    val endpoint = node.userObject as? EndpointInfo ?: return
                    onEndpointSelected(endpoint)
                }
            }
        })

        add(JBScrollPane(tree), BorderLayout.CENTER)
        border = JBUI.Borders.empty(4)
    }

    /**
     * Refresh tree from current spec in service.
     */
    fun refresh() {
        val service = project.service<Pe4KingProjectService>()
        val spec = service.currentSpec

        if (spec == null) {
            rootNode.userObject = "No specification loaded"
            rootNode.removeAllChildren()
            treeModel.reload()
            return
        }

        rootNode.userObject = "${spec.title} (${spec.version})"
        rootNode.removeAllChildren()

        // Group endpoints by tag
        val grouped = spec.endpoints.groupBy { it.primaryTag() }

        grouped.toSortedMap().forEach { (tag, endpoints) ->
            val tagNode = DefaultMutableTreeNode(tag)
            endpoints.sortedBy { it.path }.forEach { endpoint ->
                tagNode.add(DefaultMutableTreeNode(endpoint))
            }
            rootNode.add(tagNode)
        }

        treeModel.reload()
        expandAll()
    }

    private fun expandAll() {
        var row = 0
        while (row < tree.rowCount) {
            tree.expandRow(row)
            row++
        }
    }

    /**
     * Get selected endpoint if any.
     */
    fun getSelectedEndpoint(): EndpointInfo? {
        val node = tree.lastSelectedPathComponent as? DefaultMutableTreeNode ?: return null
        return node.userObject as? EndpointInfo
    }

    /**
     * Get all selected endpoints.
     */
    fun getSelectedEndpoints(): List<EndpointInfo> {
        return tree.selectionPaths?.mapNotNull { path ->
            val node = path.lastPathComponent as? DefaultMutableTreeNode
            node?.userObject as? EndpointInfo
        } ?: emptyList()
    }
}

/**
 * Custom cell renderer for endpoint tree.
 */
private class EndpointTreeCellRenderer : ColoredTreeCellRenderer() {

    override fun customizeCellRenderer(
        tree: JTree,
        value: Any?,
        selected: Boolean,
        expanded: Boolean,
        leaf: Boolean,
        row: Int,
        hasFocus: Boolean
    ) {
        val node = value as? DefaultMutableTreeNode ?: return
        val obj = node.userObject

        when (obj) {
            is EndpointInfo -> {
                // Method badge
                append(
                    "${obj.method.name.padEnd(7)} ",
                    SimpleTextAttributes(SimpleTextAttributes.STYLE_BOLD, getMethodColor(obj.method))
                )
                // Path
                append(obj.path)
                // Summary if available
                obj.summary?.let {
                    append("  $it", SimpleTextAttributes.GRAYED_ATTRIBUTES)
                }
            }
            is String -> {
                append(obj, SimpleTextAttributes.REGULAR_BOLD_ATTRIBUTES)
            }
            else -> {
                append(obj.toString())
            }
        }
    }

    private fun getMethodColor(method: HttpMethod): Color {
        return when (method) {
            HttpMethod.GET -> Color(97, 175, 239)      // Blue
            HttpMethod.POST -> Color(152, 195, 121)    // Green
            HttpMethod.PUT -> Color(229, 192, 123)     // Yellow
            HttpMethod.DELETE -> Color(224, 108, 117)  // Red
            HttpMethod.PATCH -> Color(198, 120, 221)   // Purple
            HttpMethod.HEAD -> Color(86, 182, 194)     // Cyan
            HttpMethod.OPTIONS -> Color(171, 178, 191) // Gray
        }
    }
}

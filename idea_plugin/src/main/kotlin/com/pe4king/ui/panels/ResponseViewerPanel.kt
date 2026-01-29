package com.pe4king.ui.panels

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTabbedPane
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.table.JBTable
import com.intellij.util.ui.JBUI
import com.pe4king.ui.components.JsonEditorPanel
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Font
import javax.swing.JPanel
import javax.swing.table.DefaultTableModel

/**
 * Response data container.
 */
data class HttpResponse(
    val status: Int,
    val statusText: String,
    val headers: Map<String, String>,
    val body: String,
    val responseTimeMs: Long
) {
    val cookies: Map<String, String>
        get() = headers.entries
            .filter { it.key.equals("Set-Cookie", ignoreCase = true) }
            .flatMap { parseCookies(it.value) }
            .toMap()

    private fun parseCookies(cookieHeader: String): List<Pair<String, String>> {
        return cookieHeader.split(";")
            .map { it.trim() }
            .filter { it.contains("=") }
            .map {
                val parts = it.split("=", limit = 2)
                parts[0].trim() to (parts.getOrNull(1)?.trim() ?: "")
            }
            .filter { it.first.lowercase() !in listOf("path", "domain", "expires", "max-age", "secure", "httponly", "samesite") }
    }
}

/**
 * Panel for viewing HTTP response with tabs: Pretty, Raw, Headers, Cookies.
 */
class ResponseViewerPanel(project: Project) : JPanel(BorderLayout()) {

    private val tabbedPane = JBTabbedPane()
    private val statusLabel = JBLabel("")
    private val timeLabel = JBLabel("")

    // Pretty tab - JSON highlighting
    private val prettyArea = JsonEditorPanel(project, "", isReadOnly = true)

    // Raw tab
    private val rawArea = JBTextArea().apply {
        font = Font(Font.MONOSPACED, Font.PLAIN, 12)
        isEditable = false
        lineWrap = false
    }

    // Headers tab
    private val headersModel = object : DefaultTableModel(arrayOf("Header", "Value"), 0) {
        override fun isCellEditable(row: Int, column: Int) = false
    }
    private val headersTable = JBTable(headersModel)

    // Cookies tab
    private val cookiesModel = object : DefaultTableModel(arrayOf("Name", "Value"), 0) {
        override fun isCellEditable(row: Int, column: Int) = false
    }
    private val cookiesTable = JBTable(cookiesModel)

    private val objectMapper = ObjectMapper().apply {
        enable(SerializationFeature.INDENT_OUTPUT)
    }

    init {
        border = JBUI.Borders.empty(4)

        // Header with status
        val headerPanel = JPanel(BorderLayout())
        headerPanel.add(JBLabel("Response"), BorderLayout.WEST)

        val statusPanel = JPanel().apply {
            add(statusLabel)
            add(JBLabel(" • "))
            add(timeLabel)
        }
        headerPanel.add(statusPanel, BorderLayout.EAST)
        add(headerPanel, BorderLayout.NORTH)

        // Tabs
        tabbedPane.addTab("Pretty", prettyArea)
        tabbedPane.addTab("Raw", JBScrollPane(rawArea))
        tabbedPane.addTab("Headers", JBScrollPane(headersTable))
        tabbedPane.addTab("Cookies", JBScrollPane(cookiesTable))

        add(tabbedPane, BorderLayout.CENTER)

        // Initial state
        clear()
    }

    /**
     * Display HTTP response in all tabs.
     */
    fun showResponse(response: HttpResponse) {
        // Status
        statusLabel.text = "${response.status} ${response.statusText}"
        statusLabel.foreground = getStatusColor(response.status)

        // Time
        timeLabel.text = "${response.responseTimeMs} ms"
        timeLabel.foreground = getTimeColor(response.responseTimeMs)

        // Pretty tab - JSON highlighting
        prettyArea.text = response.body

        // Raw tab - original body
        rawArea.text = response.body
        rawArea.caretPosition = 0

        // Headers tab
        headersModel.rowCount = 0
        response.headers.forEach { (key, value) ->
            headersModel.addRow(arrayOf(key, value))
        }

        // Cookies tab
        cookiesModel.rowCount = 0
        response.cookies.forEach { (name, value) ->
            cookiesModel.addRow(arrayOf(name, value))
        }

        // Update tab titles with counts
        tabbedPane.setTitleAt(2, "Headers (${response.headers.size})")
        tabbedPane.setTitleAt(3, "Cookies (${response.cookies.size})")
    }

    /**
     * Show error state.
     */
    fun showError(message: String) {
        statusLabel.text = "Error"
        statusLabel.foreground = Color(224, 108, 117)
        timeLabel.text = ""

        prettyArea.text = message
        rawArea.text = message

        headersModel.rowCount = 0
        cookiesModel.rowCount = 0

        tabbedPane.setTitleAt(2, "Headers")
        tabbedPane.setTitleAt(3, "Cookies")
    }

    /**
     * Show loading state.
     */
    fun showLoading() {
        statusLabel.text = "Sending..."
        statusLabel.foreground = JBColor.GRAY
        timeLabel.text = ""
    }

    /**
     * Clear all response data.
     */
    fun clear() {
        statusLabel.text = ""
        timeLabel.text = ""

        prettyArea.text = ""
        rawArea.text = ""

        headersModel.rowCount = 0
        cookiesModel.rowCount = 0

        tabbedPane.setTitleAt(2, "Headers")
        tabbedPane.setTitleAt(3, "Cookies")
    }

    /**
     * Get current response body text (Pretty tab).
     */
    fun getResponseText(): String = prettyArea.text

    /**
     * Get current status code or null if no response.
     */
    fun getStatus(): Int? {
        val text = statusLabel.text
        return text.split(" ").firstOrNull()?.toIntOrNull()
    }

    private fun formatJson(text: String): String {
        return try {
            val tree = objectMapper.readTree(text)
            objectMapper.writeValueAsString(tree)
        } catch (e: Exception) {
            text
        }
    }

    private fun getStatusColor(status: Int): Color {
        return when (status) {
            in 200..299 -> Color(97, 175, 121)   // Green
            in 300..399 -> Color(229, 192, 123)  // Yellow
            in 400..499 -> Color(224, 108, 117)  // Red
            else -> Color(224, 108, 117)          // Red
        }
    }

    private fun getTimeColor(timeMs: Long): Color {
        return when {
            timeMs < 200 -> Color(97, 175, 121)   // Green - fast
            timeMs < 1000 -> Color(229, 192, 123) // Yellow - ok
            else -> Color(224, 108, 117)          // Red - slow
        }
    }
}

package com.pe4king.ui.panels

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.intellij.icons.AllIcons
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.Messages
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTabbedPane
import com.intellij.ui.components.JBTextField
import com.intellij.ui.table.JBTable
import com.intellij.util.ui.JBUI
import com.pe4king.collections.ResponseData
import com.pe4king.ui.components.JsonBodyEditor
import com.pe4king.ui.components.ScriptEditorPanel
import com.pe4king.core.ScriptRunner
import com.pe4king.collections.models.SavedRequest
import com.pe4king.core.models.EndpointInfo
import com.pe4king.core.models.HttpMethod
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Dimension
import java.awt.FlowLayout
import java.util.concurrent.TimeUnit
import javax.swing.*
import javax.swing.table.DefaultTableModel

/**
 * Panel for sending HTTP requests and viewing responses.
 * Features JSON syntax highlighting in the Body editor.
 */
class RequestPanel(
    private val project: Project,
    private val variablesPanel: VariablesPanel? = null,
    private val onSaveToCollection: ((String, String, String, Map<String, String>, String?) -> Unit)? = null
) : JPanel(BorderLayout()) {

    private var currentCollectionId: String? = null
    private var lastResponseData: ResponseData? = null

    private val methodCombo = ComboBox(HttpMethod.values())
    private val urlField = JBTextField("http://localhost:8080")
    private val sendButton = JButton("Send")
    private val headersModel = DefaultTableModel(arrayOf("Header", "Value"), 0)
    private val headersTable = JBTable(headersModel)
    
    // JSON editor with syntax highlighting
    private val bodyEditor = JsonBodyEditor(project)
    
    private lateinit var scriptEditor: ScriptEditorPanel
    private val scriptRunner = ScriptRunner()
    private var lastScriptResults: ScriptRunner.ScriptResult? = null
    private val testsResultsPanel = JPanel()
    private val objectMapper = ObjectMapper().apply {
        enable(SerializationFeature.INDENT_OUTPUT)
    }
    private val responseViewer = ResponseViewerPanel(project)

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    init {
        // Top: Method + URL + Send
        val topPanel = JPanel(BorderLayout(5, 0))
        topPanel.border = JBUI.Borders.empty(4)

        methodCombo.preferredSize = Dimension(100, 30)
        sendButton.preferredSize = Dimension(80, 30)

        val buttonsPanel = JPanel(FlowLayout(FlowLayout.RIGHT, 4, 0))

        val saveButton = JButton(AllIcons.Actions.MenuSaveall)
        saveButton.toolTipText = "Save to Collection"
        saveButton.addActionListener { saveToCollection() }
        buttonsPanel.add(saveButton)
        buttonsPanel.add(sendButton)

        topPanel.add(methodCombo, BorderLayout.WEST)
        topPanel.add(urlField, BorderLayout.CENTER)
        topPanel.add(buttonsPanel, BorderLayout.EAST)

        // Middle: Request tabs (Headers, Body, Tests)
        val requestTabs = JBTabbedPane()

        // Headers tab
        val headersPanel = JPanel(BorderLayout())
        headersPanel.add(JBScrollPane(headersTable), BorderLayout.CENTER)
        val addHeaderBtn = JButton("Add Header")
        addHeaderBtn.addActionListener {
            headersModel.addRow(arrayOf("", ""))
        }
        val headersToolbar = JPanel(FlowLayout(FlowLayout.LEFT))
        headersToolbar.add(addHeaderBtn)
        headersPanel.add(headersToolbar, BorderLayout.SOUTH)

        // Add default Content-Type header
        headersModel.addRow(arrayOf("Content-Type", "application/json"))

        requestTabs.addTab("Headers", headersPanel)

        // Body tab - JSON editor with syntax highlighting
        requestTabs.addTab("Body", bodyEditor)

        // Tests tab
        val testsPanel = createTestsPanel()
        requestTabs.addTab("Tests", testsPanel)

        // Set minimum size for request tabs
        requestTabs.minimumSize = Dimension(0, 150)

        // Main split: request tabs and response viewer - MOVABLE SPLITTER
        val splitter = JSplitPane(JSplitPane.VERTICAL_SPLIT, requestTabs, responseViewer).apply {
            resizeWeight = 0.5  // Equal distribution
            isContinuousLayout = true  // Smooth resizing
            dividerSize = 8  // Larger divider for easier grabbing
            // Set minimum sizes to prevent collapse
            topComponent.minimumSize = Dimension(0, 100)
            bottomComponent.minimumSize = Dimension(0, 100)
        }

        add(topPanel, BorderLayout.NORTH)
        add(splitter, BorderLayout.CENTER)

        // Send action
        sendButton.addActionListener { executeRequest() }
    }

    /**
     * Load endpoint data into the panel.
     */
    fun loadEndpoint(endpoint: EndpointInfo, baseUrl: String = "http://localhost:8080") {
        methodCombo.selectedItem = endpoint.method
        urlField.text = "$baseUrl${endpoint.path}"

        headersModel.rowCount = 0
        headersModel.addRow(arrayOf("Content-Type", "application/json"))

        // Set body - requestBodyExample should be a JSON string from the parser
        // But if it's still an object, serialize it properly
        bodyEditor.text = when (val example = endpoint.requestBodyExample) {
            is String -> example
            null -> ""
            else -> {
                // Fallback: convert to plain types and serialize
                try {
                    val plain = convertToPlainTypes(example)
                    objectMapper.writeValueAsString(plain)
                } catch (e: Exception) {
                    example.toString()
                }
            }
        }
        
        responseViewer.clear()
    }

    /**
     * Convert any object to plain Map/List/primitives for JSON serialization.
     * Handles Swagger Parser's special types.
     */
    private fun convertToPlainTypes(obj: Any?): Any? {
        return when (obj) {
            null -> null
            is String -> obj
            is Number -> obj
            is Boolean -> obj
            is Map<*, *> -> {
                val result = linkedMapOf<String, Any?>()
                for ((key, value) in obj.entries) {
                    if (key != null) {
                        result[key.toString()] = convertToPlainTypes(value)
                    }
                }
                result
            }
            is Iterable<*> -> obj.map { convertToPlainTypes(it) }
            is Array<*> -> obj.map { convertToPlainTypes(it) }
            else -> obj.toString()
        }
    }

    private fun executeRequest() {
        val method = methodCombo.selectedItem as HttpMethod
        val rawUrl = urlField.text.trim()

        if (rawUrl.isEmpty()) {
            responseViewer.showError("Error: URL is empty")
            return
        }

        // Resolve variables
        val url = resolveVariables(rawUrl)

        val startTime = System.currentTimeMillis()

        sendButton.isEnabled = false
        responseViewer.showLoading()

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val requestBuilder = Request.Builder().url(url)

                // Add headers with variable resolution
                for (i in 0 until headersModel.rowCount) {
                    val header = headersModel.getValueAt(i, 0)?.toString()?.trim() ?: ""
                    val rawValue = headersModel.getValueAt(i, 1)?.toString()?.trim() ?: ""
                    if (header.isNotEmpty() && rawValue.isNotEmpty()) {
                        val value = resolveVariables(rawValue)
                        requestBuilder.addHeader(header, value)
                    }
                }

                // Set method and body with variable resolution
                val rawBody = bodyEditor.text.trim()
                val body = resolveVariables(rawBody)
                val mediaType = "application/json".toMediaType()

                when (method) {
                    HttpMethod.GET -> requestBuilder.get()
                    HttpMethod.DELETE -> {
                        if (body.isNotEmpty()) {
                            requestBuilder.delete(body.toRequestBody(mediaType))
                        } else {
                            requestBuilder.delete()
                        }
                    }
                    HttpMethod.POST -> requestBuilder.post(body.toRequestBody(mediaType))
                    HttpMethod.PUT -> requestBuilder.put(body.toRequestBody(mediaType))
                    HttpMethod.PATCH -> requestBuilder.patch(body.toRequestBody(mediaType))
                    HttpMethod.HEAD -> requestBuilder.head()
                    HttpMethod.OPTIONS -> requestBuilder.method("OPTIONS", null)
                }

                val request = requestBuilder.build()
                val response = httpClient.newCall(request).execute()

                val responseBody = response.body?.string() ?: ""

                // Collect headers
                val responseHeaders = mutableMapOf<String, String>()
                for (name in response.headers.names()) {
                    responseHeaders[name] = response.headers[name] ?: ""
                }

                ApplicationManager.getApplication().invokeLater {
                    val httpResponse = HttpResponse(
                        status = response.code,
                        statusText = response.message,
                        headers = responseHeaders,
                        body = responseBody,
                        responseTimeMs = System.currentTimeMillis() - startTime
                    )
                    responseViewer.showResponse(httpResponse)
                    sendButton.isEnabled = true

                    // Run tests
                    runTests(responseBody, responseHeaders, response.code, System.currentTimeMillis() - startTime)
                }

            } catch (e: Exception) {
                ApplicationManager.getApplication().invokeLater {
                    responseViewer.showError("Error: ${e.message}\n\n${e.stackTraceToString()}")
                    sendButton.isEnabled = true
                }
            }
        }
    }

    private fun formatJson(json: String): String {
        return try {
            val parsed = objectMapper.readTree(json)
            objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(parsed)
        } catch (e: Exception) {
            json
        }
    }

    /**
     * Create tests panel with JS editor.
     */
    private fun createTestsPanel(): JPanel {
        val panel = JPanel(BorderLayout())

        scriptEditor = ScriptEditorPanel(project)

        // Results panel at bottom
        testsResultsPanel.layout = BoxLayout(testsResultsPanel, BoxLayout.Y_AXIS)
        testsResultsPanel.border = JBUI.Borders.empty(4)

        val resultsScroll = JBScrollPane(testsResultsPanel)
        resultsScroll.preferredSize = Dimension(0, 120)

        // Tests splitter - also movable
        val splitter = JSplitPane(JSplitPane.VERTICAL_SPLIT, scriptEditor, resultsScroll).apply {
            resizeWeight = 0.7
            isContinuousLayout = true
            dividerSize = 6
            topComponent.minimumSize = Dimension(0, 60)
            bottomComponent.minimumSize = Dimension(0, 40)
        }

        panel.add(splitter, BorderLayout.CENTER)
        return panel
    }

    /**
     * Run JS tests against response.
     */
    private fun runTests(responseBody: String, headers: Map<String, String>, status: Int, timeMs: Long) {
        // Parse body to object for script access
        val parsedBody: Any? = try {
            objectMapper.readValue(responseBody, Any::class.java)
        } catch (e: Exception) {
            responseBody
        }

        // Store for potential re-runs
        lastResponseData = ResponseData(
            body = parsedBody,
            headers = headers,
            status = status
        )

        // Execute JS script
        val script = scriptEditor.text
        lastScriptResults = scriptRunner.execute(
            script = script,
            responseStatus = status,
            responseBody = parsedBody,
            responseHeaders = headers,
            responseTimeMs = timeMs
        )

        // Display results
        refreshTestResults()
    }

    /**
     * Display test results.
     */
    private fun refreshTestResults() {
        testsResultsPanel.removeAll()

        val result = lastScriptResults
        if (result == null) {
            testsResultsPanel.add(JBLabel("Run request to see test results"))
            testsResultsPanel.revalidate()
            testsResultsPanel.repaint()
            return
        }

        // Show error if script failed
        if (!result.success && result.error != null) {
            val errorLabel = JBLabel("❌ ${result.error}")
            errorLabel.foreground = Color(224, 108, 117)
            errorLabel.border = JBUI.Borders.empty(4)
            testsResultsPanel.add(errorLabel)
        }

        // Show test results
        for (test in result.tests) {
            val icon = if (test.passed) "✓" else "✗"
            val color = if (test.passed) Color(97, 175, 121) else Color(224, 108, 117)

            val label = JBLabel("$icon ${test.name}")
            label.foreground = color
            label.border = JBUI.Borders.empty(2, 4)

            // Fix height
            label.maximumSize = Dimension(Int.MAX_VALUE, 24)
            testsResultsPanel.add(label)
        }

        // Show logs
        if (result.logs.isNotEmpty()) {
            testsResultsPanel.add(Box.createVerticalStrut(8))
            testsResultsPanel.add(JBLabel("Console:").apply {
                foreground = JBColor.GRAY
                border = JBUI.Borders.empty(2, 4)
            })

            for (log in result.logs) {
                val logLabel = JBLabel("  $log")
                logLabel.foreground = JBColor.GRAY
                logLabel.border = JBUI.Borders.empty(1, 4)
                testsResultsPanel.add(logLabel)
            }
        }

        // Summary
        if (result.tests.isNotEmpty()) {
            val passed = result.tests.count { it.passed }
            val total = result.tests.size
            val summaryColor = if (passed == total) Color(97, 175, 121) else Color(224, 108, 117)

            testsResultsPanel.add(Box.createVerticalStrut(8))
            val summaryLabel = JBLabel("$passed/$total tests passed")
            summaryLabel.foreground = summaryColor
            summaryLabel.border = JBUI.Borders.empty(4)
            testsResultsPanel.add(summaryLabel)
        }

        testsResultsPanel.add(Box.createVerticalGlue())
        testsResultsPanel.revalidate()
        testsResultsPanel.repaint()
    }

    /**
     * Get current response text.
     */
    fun getResponseText(): String = responseViewer.getResponseText()

    /**
     * Load request from collection.
     */
    fun loadFromCollection(request: SavedRequest, collectionId: String) {
        currentCollectionId = collectionId
        val method = HttpMethod.values().find { it.name == request.method } ?: HttpMethod.GET
        methodCombo.selectedItem = method
        urlField.text = request.url

        headersModel.rowCount = 0
        for ((key, value) in request.headers) {
            headersModel.addRow(arrayOf(key, value))
        }
        if (headersModel.rowCount == 0) {
            headersModel.addRow(arrayOf("Content-Type", "application/json"))
        }

        bodyEditor.text = formatJson(request.body ?: "")
        responseViewer.clear()
    }

    /**
     * Resolve variables in text ({{variableName}}).
     */
    private fun resolveVariables(text: String): String {
        if (variablesPanel == null) return text

        var result = text
        val variables = variablesPanel.getAllVariables(currentCollectionId)

        // Replace all {{variableName}} with values
        val regex = Regex("""\{\{(\w+)\}\}""")
        regex.findAll(text).forEach { match ->
            val varName = match.groupValues[1]
            val value = variables[varName]
            if (value != null) {
                result = result.replace("{{$varName}}", value)
            }
        }

        return result
    }

    /**
     * Save current request to collection.
     */
    private fun saveToCollection() {
        val name = Messages.showInputDialog(
            project,
            "Request name:",
            "Save to Collection",
            null
        )
        if (name.isNullOrBlank()) return

        val method = (methodCombo.selectedItem as HttpMethod).name
        val url = urlField.text.trim()
        val headers = mutableMapOf<String, String>()
        for (i in 0 until headersModel.rowCount) {
            val key = headersModel.getValueAt(i, 0)?.toString()?.trim() ?: ""
            val value = headersModel.getValueAt(i, 1)?.toString()?.trim() ?: ""
            if (key.isNotEmpty()) {
                headers[key] = value
            }
        }
        val body = bodyEditor.text.takeIf { it.isNotBlank() }

        onSaveToCollection?.invoke(name, method, url, headers, body)
    }
}

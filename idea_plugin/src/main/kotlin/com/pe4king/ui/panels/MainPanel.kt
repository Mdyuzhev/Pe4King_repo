package com.pe4king.ui.panels

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.components.service
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.ui.JBSplitter
import com.intellij.ui.components.JBTabbedPane
import com.intellij.util.messages.Topic
import com.intellij.util.ui.JBUI
import com.pe4king.collections.models.BodyType
import com.pe4king.core.models.EndpointInfo
import com.pe4king.core.models.OutputFormat
import com.pe4king.core.parser.ParseResult
import com.pe4king.services.Pe4KingProjectService
import com.pe4king.ui.dialogs.GenerateTestsDialog
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.JButton
import javax.swing.JPanel

/**
 * Main panel for Pe4King tool window.
 * Contains endpoints tree, collections tree, request panel, and toolbar.
 */
class MainPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val endpointsPanel: EndpointsPanel
    private val collectionsPanel: CollectionsPanel
    private val variablesPanel: VariablesPanel
    private val evaPanel: EvaPanel
    private val requestPanel: RequestPanel
    private val tabbedPane: JBTabbedPane

    init {
        // Create panels
        variablesPanel = VariablesPanel(project)
        evaPanel = EvaPanel(project)
        requestPanel = RequestPanel(project, variablesPanel) { name, method, url, headers, body ->
            saveToCollection(name, method, url, headers, body)
        }
        endpointsPanel = EndpointsPanel(project) { endpoint ->
            onEndpointSelected(endpoint)
        }
        collectionsPanel = CollectionsPanel(project) { request, collectionId ->
            onCollectionRequestSelected(request, collectionId)
        }

        // Toolbar
        val toolbar = createToolbar()
        add(toolbar, BorderLayout.NORTH)

        // Left panel with tabs
        tabbedPane = JBTabbedPane()
        tabbedPane.addTab("Endpoints", endpointsPanel)
        tabbedPane.addTab("Collections", collectionsPanel)
        tabbedPane.addTab("Variables", variablesPanel)
        tabbedPane.addTab("EVA", evaPanel)
        
        // Set minimum size for left panel to allow resizing
        tabbedPane.minimumSize = Dimension(200, 0)

        // Set minimum size for request panel
        requestPanel.minimumSize = Dimension(300, 0)

        // Main content: split between tabs and request - RESIZABLE SPLITTER
        val splitter = JBSplitter(false, 0.35f).apply {
            firstComponent = tabbedPane
            secondComponent = requestPanel
            // Ensure splitter is resizable
            splitterProportionKey = "Pe4King.MainSplitter"
            setHonorComponentsMinimumSize(true)
        }

        add(splitter, BorderLayout.CENTER)

        // Listen for spec changes
        project.messageBus.connect().subscribe(
            SpecLoadedListener.TOPIC,
            object : SpecLoadedListener {
                override fun specLoaded(spec: ParseResult.Success) {
                    endpointsPanel.refresh()
                }
            }
        )

        // Initial refresh
        endpointsPanel.refresh()
    }

    private fun createToolbar(): JPanel {
        val toolbarPanel = JPanel(BorderLayout())
        toolbarPanel.border = JBUI.Borders.empty(4)

        val buttonPanel = JPanel()

        // Open Spec button
        val openButton = JButton("Open Spec")
        openButton.addActionListener { openSpecification() }
        buttonPanel.add(openButton)

        // Refresh button
        val refreshButton = JButton("Refresh")
        refreshButton.addActionListener { endpointsPanel.refresh() }
        buttonPanel.add(refreshButton)

        // Generate button
        val generateButton = JButton("Generate Tests")
        generateButton.addActionListener { generateTests() }
        buttonPanel.add(generateButton)

        toolbarPanel.add(buttonPanel, BorderLayout.WEST)

        return toolbarPanel
    }

    private fun openSpecification() {
        val descriptor = FileChooserDescriptor(true, false, false, false, false, false)
            .withTitle("Open OpenAPI Specification")
            .withDescription("Select an OpenAPI/Swagger specification file")
            .withFileFilter { file ->
                file.extension?.lowercase() in listOf("yaml", "yml", "json")
            }

        FileChooser.chooseFile(descriptor, project, null) { file ->
            val service = project.service<Pe4KingProjectService>()
            when (val result = service.loadSpec(file.path)) {
                is ParseResult.Success -> {
                    endpointsPanel.refresh()
                    Messages.showInfoMessage(
                        project,
                        "Loaded ${result.endpoints.size} endpoints from ${result.title}",
                        "Pe4King"
                    )
                }
                is ParseResult.Error -> {
                    Messages.showErrorDialog(project, result.message, "Parse Error")
                }
            }
        }
    }

    private fun onEndpointSelected(endpoint: EndpointInfo) {
        requestPanel.loadEndpoint(endpoint)
    }

    private fun onCollectionRequestSelected(request: com.pe4king.collections.models.SavedRequest, collectionId: String) {
        requestPanel.loadFromCollection(request, collectionId)
    }

    private fun saveToCollection(name: String, method: String, url: String, headers: Map<String, String>, body: String?) {
        collectionsPanel.saveRequest(name, method, url, headers, body, BodyType.RAW)
    }

    private fun generateTests() {
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

        val endpoints = service.getEndpoints()
        if (endpoints.isEmpty()) {
            Messages.showWarningDialog(
                project,
                "No endpoints found in the specification.",
                "No Endpoints"
            )
            return
        }

        // Show dialog
        val dialog = GenerateTestsDialog(project, endpoints, spec.title)
        if (dialog.showAndGet()) {
            val options = dialog.getOptions()

            if (options.selectedEndpoints.isEmpty()) {
                Messages.showWarningDialog(
                    project,
                    "Please select at least one endpoint",
                    "No Endpoints Selected"
                )
                return
            }

            if (options.format != OutputFormat.COLLECTION && options.outputDir.isBlank()) {
                Messages.showWarningDialog(
                    project,
                    "Please specify an output directory",
                    "No Output Directory"
                )
                return
            }

            // Generate tests
            service.generateTests(options) { result ->
                if (result.success) {
                    val message = if (result.collectionName != null) {
                        """
                        Collection created!

                        Collection: ${result.collectionName}
                        Endpoints: ${result.stats.totalEndpoints}
                        """.trimIndent()
                    } else {
                        """
                        Generation complete!

                        Files: ${result.files.size}
                        Endpoints: ${result.stats.totalEndpoints}
                        Tests: ${result.stats.totalTests}
                        - Positive: ${result.stats.positiveTests}
                        - Negative: ${result.stats.negativeTests}
                        Assertions: ${result.stats.assertions}

                        Output: ${options.outputDir}
                        """.trimIndent()
                    }
                    Messages.showInfoMessage(project, message, "Pe4King - Generation Complete")
                } else {
                    Messages.showErrorDialog(
                        project,
                        "Generation failed:\n${result.errors.joinToString("\n")}",
                        "Pe4King - Generation Failed"
                    )
                }
            }
        }
    }

    /**
     * Refresh the endpoints panel.
     */
    fun refresh() {
        endpointsPanel.refresh()
    }
}

/**
 * Topic for spec loaded events.
 */
interface SpecLoadedListener {
    companion object {
        val TOPIC = Topic.create("Pe4King.SpecLoaded", SpecLoadedListener::class.java)
    }

    fun specLoaded(spec: ParseResult.Success)
}

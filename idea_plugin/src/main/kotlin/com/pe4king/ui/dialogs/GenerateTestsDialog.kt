package com.pe4king.ui.dialogs

import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.ui.CheckBoxList
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.JBUI
import com.pe4king.core.models.EndpointInfo
import com.pe4king.core.models.HttpMethod
import com.pe4king.core.models.OutputFormat
import java.awt.*
import javax.swing.*

/**
 * Dialog for configuring test generation options.
 */
class GenerateTestsDialog(
    private val project: Project,
    private val endpoints: List<EndpointInfo>,
    private val specTitle: String
) : DialogWrapper(project) {

    private val formatCombo = JComboBox(OutputFormat.values())
    private val baseUrlField = JBTextField("http://localhost:8080")
    private val outputDirField = TextFieldWithBrowseButton()
    private val endpointsList = CheckBoxList<EndpointInfo>()
    private val negativeTestsCheckbox = JCheckBox("Generate negative tests", true)
    private val edgeCasesCheckbox = JCheckBox("Generate edge cases", true)
    private val javaPackageField = JBTextField("com.example.tests")
    private val pythonPackageField = JBTextField("tests")

    init {
        title = "Generate API Tests - $specTitle"
        init()
    }

    override fun createCenterPanel(): JComponent {
        val mainPanel = JPanel(BorderLayout(10, 10))
        mainPanel.border = JBUI.Borders.empty(10)

        // Top: Options panel
        val optionsPanel = createOptionsPanel()
        mainPanel.add(optionsPanel, BorderLayout.NORTH)

        // Center: Endpoints selection
        val endpointsPanel = createEndpointsPanel()
        mainPanel.add(endpointsPanel, BorderLayout.CENTER)

        return mainPanel
    }

    private fun createOptionsPanel(): JPanel {
        val panel = JPanel(GridBagLayout())
        panel.border = BorderFactory.createTitledBorder("Generation Options")
        val gbc = GridBagConstraints().apply {
            insets = JBUI.insets(4)
            anchor = GridBagConstraints.WEST
            fill = GridBagConstraints.HORIZONTAL
        }

        var row = 0

        // Format
        gbc.gridx = 0; gbc.gridy = row; gbc.weightx = 0.0
        panel.add(JLabel("Output Format:"), gbc)
        gbc.gridx = 1; gbc.weightx = 1.0
        panel.add(formatCombo, gbc)
        row++

        // Base URL
        gbc.gridx = 0; gbc.gridy = row; gbc.weightx = 0.0
        panel.add(JLabel("Base URL:"), gbc)
        gbc.gridx = 1; gbc.weightx = 1.0
        panel.add(baseUrlField, gbc)
        row++

        // Output directory
        gbc.gridx = 0; gbc.gridy = row; gbc.weightx = 0.0
        panel.add(JLabel("Output Directory:"), gbc)
        gbc.gridx = 1; gbc.weightx = 1.0
        outputDirField.addBrowseFolderListener(
            "Select Output Directory",
            "Choose where to save generated tests",
            project,
            FileChooserDescriptorFactory.createSingleFolderDescriptor()
        )
        panel.add(outputDirField, gbc)
        row++

        // Java package (shown when REST Assured selected)
        gbc.gridx = 0; gbc.gridy = row; gbc.weightx = 0.0
        val javaPackageLabel = JLabel("Java Package:")
        panel.add(javaPackageLabel, gbc)
        gbc.gridx = 1; gbc.weightx = 1.0
        panel.add(javaPackageField, gbc)
        row++

        // Python package (shown when pytest selected)
        gbc.gridx = 0; gbc.gridy = row; gbc.weightx = 0.0
        val pythonPackageLabel = JLabel("Python Package:")
        panel.add(pythonPackageLabel, gbc)
        gbc.gridx = 1; gbc.weightx = 1.0
        panel.add(pythonPackageField, gbc)
        row++

        // Checkboxes
        gbc.gridx = 0; gbc.gridy = row; gbc.gridwidth = 2
        panel.add(negativeTestsCheckbox, gbc)
        row++

        gbc.gridy = row
        panel.add(edgeCasesCheckbox, gbc)

        // Toggle visibility based on format
        formatCombo.addActionListener {
            val format = formatCombo.selectedItem as OutputFormat
            val isCollection = format == OutputFormat.COLLECTION
            val isTestCases = format == OutputFormat.TESTCASES

            // Java package only for REST_ASSURED
            javaPackageLabel.isVisible = format == OutputFormat.REST_ASSURED
            javaPackageField.isVisible = format == OutputFormat.REST_ASSURED

            // Python package only for PYTEST
            pythonPackageLabel.isVisible = format == OutputFormat.PYTEST
            pythonPackageField.isVisible = format == OutputFormat.PYTEST

            // Collection doesn't need output directory or test options
            outputDirField.isEnabled = !isCollection
            baseUrlField.isEnabled = !isCollection && !isTestCases

            // Test options available for code generation and test cases
            negativeTestsCheckbox.isEnabled = !isCollection
            edgeCasesCheckbox.isEnabled = !isCollection
        }

        // Initial visibility
        pythonPackageLabel.isVisible = false
        pythonPackageField.isVisible = false

        return panel
    }

    private fun createEndpointsPanel(): JPanel {
        val panel = JPanel(BorderLayout())
        panel.border = BorderFactory.createTitledBorder("Select Endpoints (${endpoints.size} total)")

        // Populate list
        for (endpoint in endpoints) {
            endpointsList.addItem(endpoint, formatEndpoint(endpoint), true)
        }

        val scrollPane = JBScrollPane(endpointsList)
        scrollPane.preferredSize = Dimension(600, 300)
        panel.add(scrollPane, BorderLayout.CENTER)

        // Select all / none buttons
        val buttonPanel = JPanel(FlowLayout(FlowLayout.LEFT))
        val selectAllButton = JButton("Select All")
        val selectNoneButton = JButton("Select None")

        selectAllButton.addActionListener {
            for (i in 0 until endpointsList.model.size) {
                endpointsList.setItemSelected(endpoints[i], true)
            }
            endpointsList.repaint()
        }

        selectNoneButton.addActionListener {
            for (i in 0 until endpointsList.model.size) {
                endpointsList.setItemSelected(endpoints[i], false)
            }
            endpointsList.repaint()
        }

        buttonPanel.add(selectAllButton)
        buttonPanel.add(selectNoneButton)
        panel.add(buttonPanel, BorderLayout.SOUTH)

        return panel
    }

    private fun formatEndpoint(endpoint: EndpointInfo): String {
        val methodColor = when (endpoint.method) {
            HttpMethod.GET -> "blue"
            HttpMethod.POST -> "green"
            HttpMethod.PUT -> "orange"
            HttpMethod.DELETE -> "red"
            HttpMethod.PATCH -> "purple"
            else -> "gray"
        }
        return "<html><b style='color:$methodColor'>${endpoint.method.name.padEnd(7)}</b> ${endpoint.path}" +
                (endpoint.summary?.let { " <i style='color:gray'>- $it</i>" } ?: "") +
                "</html>"
    }

    /**
     * Gets generation options from dialog.
     */
    fun getOptions(): GenerateOptions {
        val selectedEndpoints = endpoints.filter { endpointsList.isItemSelected(it) }

        return GenerateOptions(
            format = formatCombo.selectedItem as OutputFormat,
            baseUrl = baseUrlField.text,
            outputDir = outputDirField.text,
            selectedEndpoints = selectedEndpoints,
            generateNegativeTests = negativeTestsCheckbox.isSelected,
            generateEdgeCases = edgeCasesCheckbox.isSelected,
            javaPackage = javaPackageField.text.takeIf { it.isNotBlank() },
            pythonPackage = pythonPackageField.text.takeIf { it.isNotBlank() }
        )
    }

    override fun getPreferredFocusedComponent(): JComponent = formatCombo
}

/**
 * Generation options from dialog.
 */
data class GenerateOptions(
    val format: OutputFormat,
    val baseUrl: String,
    val outputDir: String,
    val selectedEndpoints: List<EndpointInfo>,
    val generateNegativeTests: Boolean,
    val generateEdgeCases: Boolean,
    val javaPackage: String?,
    val pythonPackage: String?
)

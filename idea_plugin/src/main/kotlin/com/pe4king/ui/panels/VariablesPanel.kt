package com.pe4king.ui.panels

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextField
import com.intellij.ui.table.JBTable
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.FlowLayout
import javax.swing.*
import javax.swing.table.DefaultTableModel

/**
 * Panel for managing environment variables.
 * Variables can be global or collection-specific.
 * Use {{variableName}} syntax in URL, headers, body.
 */
class VariablesPanel(private val project: Project) : JPanel(BorderLayout()) {

    // Global variables (available in all collections)
    private val globalVariables = mutableMapOf<String, String>()
    
    // Collection-specific variables
    private val collectionVariables = mutableMapOf<String, MutableMap<String, String>>()
    
    // Current scope selection
    private val scopeCombo = ComboBox(arrayOf("Global"))
    private var currentScope = "Global"
    
    // Table model and table
    private val tableModel = DefaultTableModel(arrayOf("Name", "Value", ""), 0)
    private val variablesTable = JBTable(tableModel)

    init {
        border = JBUI.Borders.empty(8)

        // Top: Scope selector
        val topPanel = JPanel(FlowLayout(FlowLayout.LEFT, 8, 4))
        topPanel.add(JBLabel("Scope:"))
        scopeCombo.preferredSize = Dimension(200, 28)
        scopeCombo.addActionListener { 
            currentScope = scopeCombo.selectedItem?.toString() ?: "Global"
            refreshTable()
        }
        topPanel.add(scopeCombo)
        
        add(topPanel, BorderLayout.NORTH)

        // Center: Variables table
        variablesTable.setShowGrid(true)
        variablesTable.rowHeight = 28
        
        // Set column widths
        variablesTable.columnModel.getColumn(0).preferredWidth = 150
        variablesTable.columnModel.getColumn(1).preferredWidth = 250
        variablesTable.columnModel.getColumn(2).preferredWidth = 30
        variablesTable.columnModel.getColumn(2).maxWidth = 40
        
        add(JBScrollPane(variablesTable), BorderLayout.CENTER)

        // Bottom: Add button
        val bottomPanel = JPanel(FlowLayout(FlowLayout.LEFT, 8, 4))
        
        val addButton = JButton("Add Variable", AllIcons.General.Add)
        addButton.addActionListener { addVariable() }
        bottomPanel.add(addButton)
        
        val deleteButton = JButton("Delete", AllIcons.General.Remove)
        deleteButton.addActionListener { deleteSelectedVariable() }
        bottomPanel.add(deleteButton)
        
        add(bottomPanel, BorderLayout.SOUTH)

        // Add some default variables
        globalVariables["baseUrl"] = "https://petstore.swagger.io/v2"
        globalVariables["apiKey"] = "special-key"
        
        refreshTable()
    }

    /**
     * Refresh the table from current scope variables.
     */
    private fun refreshTable() {
        tableModel.rowCount = 0
        
        val vars = if (currentScope == "Global") {
            globalVariables
        } else {
            collectionVariables[currentScope] ?: mutableMapOf()
        }
        
        for ((name, value) in vars) {
            val displayValue = maskSensitiveValue(name, value)
            tableModel.addRow(arrayOf(name, displayValue, "×"))
        }
    }

    /**
     * Mask sensitive values (tokens, keys, passwords).
     */
    private fun maskSensitiveValue(name: String, value: String): String {
        val sensitivePatterns = listOf("token", "key", "secret", "password", "auth", "bearer")
        val isSensitive = sensitivePatterns.any { name.lowercase().contains(it) }
        
        return if (isSensitive && value.length > 10) {
            "${value.take(6)}${"•".repeat(8)}${value.takeLast(4)}"
        } else {
            value
        }
    }

    /**
     * Add a new variable.
     */
    private fun addVariable() {
        val nameField = JBTextField()
        val valueField = JBTextField()
        
        val panel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            add(JBLabel("Variable name:"))
            add(nameField)
            add(Box.createVerticalStrut(8))
            add(JBLabel("Value:"))
            add(valueField)
        }
        
        val result = JOptionPane.showConfirmDialog(
            this, panel, "Add Variable",
            JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE
        )
        
        if (result == JOptionPane.OK_OPTION) {
            val name = nameField.text.trim()
            val value = valueField.text
            
            if (name.isNotEmpty()) {
                if (currentScope == "Global") {
                    globalVariables[name] = value
                } else {
                    collectionVariables.getOrPut(currentScope) { mutableMapOf() }[name] = value
                }
                refreshTable()
            }
        }
    }

    /**
     * Delete selected variable.
     */
    private fun deleteSelectedVariable() {
        val row = variablesTable.selectedRow
        if (row >= 0) {
            val name = tableModel.getValueAt(row, 0).toString()
            
            if (currentScope == "Global") {
                globalVariables.remove(name)
            } else {
                collectionVariables[currentScope]?.remove(name)
            }
            refreshTable()
        }
    }

    /**
     * Add a collection to the scope selector.
     */
    fun addCollectionScope(collectionId: String, collectionName: String) {
        val exists = (0 until scopeCombo.itemCount).any { scopeCombo.getItemAt(it) == collectionName }
        if (!exists) {
            scopeCombo.addItem(collectionName)
        }
    }

    /**
     * Get all variables for resolution.
     * Collection variables override global variables.
     */
    fun getAllVariables(collectionId: String?): Map<String, String> {
        val result = mutableMapOf<String, String>()
        
        // Start with global variables
        result.putAll(globalVariables)
        
        // Override with collection-specific if present
        if (collectionId != null) {
            collectionVariables[collectionId]?.let { result.putAll(it) }
        }
        
        return result
    }

    /**
     * Set a variable value programmatically.
     */
    fun setVariable(name: String, value: String, collectionId: String? = null) {
        if (collectionId == null) {
            globalVariables[name] = value
        } else {
            collectionVariables.getOrPut(collectionId) { mutableMapOf() }[name] = value
        }
        refreshTable()
    }

    /**
     * Get a variable value.
     */
    fun getVariable(name: String, collectionId: String? = null): String? {
        // Check collection-specific first
        if (collectionId != null) {
            collectionVariables[collectionId]?.get(name)?.let { return it }
        }
        // Fall back to global
        return globalVariables[name]
    }
}

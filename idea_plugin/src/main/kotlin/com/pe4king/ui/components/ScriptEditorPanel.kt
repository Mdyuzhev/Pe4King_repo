package com.pe4king.ui.components

import com.intellij.icons.AllIcons
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.EditorTextField
import com.intellij.ui.LanguageTextField
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.FlowLayout
import javax.swing.JButton
import javax.swing.JPanel

/**
 * JavaScript test editor with snippet dropdown.
 *
 * API:
 * - response.status (number)
 * - response.body (parsed JSON)
 * - response.headers (object)
 * - response.time (ms)
 * - test(name, condition)
 * - log(...args)
 */
class ScriptEditorPanel(
    private val project: Project
) : JPanel(BorderLayout()) {

    companion object {
        val SNIPPETS = listOf(
            "Status is 200" to """test("Status is 200", response.status === 200)""",
            "Status is 2xx" to """test("Status is 2xx", response.status >= 200 && response.status < 300)""",
            "Status is 201" to """test("Status is 201 Created", response.status === 201)""",
            "Status is 204" to """test("Status is 204 No Content", response.status === 204)""",
            "---" to "",  // separator
            "Body not null" to """test("Body is not null", response.body !== null)""",
            "Body not empty" to """test("Body is not empty", response.body && Object.keys(response.body).length > 0)""",
            "Has field: id" to """test("Has id field", response.body.id !== undefined)""",
            "Has field: name" to """test("Has name field", response.body.name !== undefined)""",
            "Is array" to """test("Response is array", Array.isArray(response.body))""",
            "Array not empty" to """test("Array not empty", Array.isArray(response.body) && response.body.length > 0)""",
            "---" to "",  // separator
            "Response time < 500ms" to """test("Fast response", response.time < 500)""",
            "Response time < 1s" to """test("Response under 1s", response.time < 1000)""",
            "Response time < 3s" to """test("Response under 3s", response.time < 3000)""",
            "---" to "",  // separator
            "Content-Type JSON" to """test("Content-Type is JSON", (response.headers["Content-Type"] || "").includes("json"))""",
            "Has header" to """test("Has X-Request-Id", response.headers["X-Request-Id"] !== undefined)""",
            "---" to "",  // separator
            "Log response" to """log("Response:", response.status, response.body)""",
            "Log body" to """log("Body:", JSON.stringify(response.body, null, 2))"""
        )

        const val HELP_TEXT = "API: response.status, response.body, response.headers, response.time | test(name, cond), log(...)"
    }

    private val editorTextField: EditorTextField
    private val snippetCombo: ComboBox<String>

    init {
        border = JBUI.Borders.empty(4)

        // Top toolbar with dropdown
        val toolbar = JPanel(FlowLayout(FlowLayout.LEFT, 4, 2))

        // Snippet dropdown
        val snippetNames = SNIPPETS.map { it.first }.toTypedArray()
        snippetCombo = ComboBox(snippetNames)
        snippetCombo.selectedIndex = 0
        toolbar.add(JBLabel("Add test:"))
        toolbar.add(snippetCombo)

        // Add button
        val addBtn = JButton(AllIcons.General.Add)
        addBtn.toolTipText = "Add selected test"
        addBtn.addActionListener { addSelectedSnippet() }
        toolbar.add(addBtn)

        // Help text
        toolbar.add(JBLabel("  |  "))
        val helpLabel = JBLabel(HELP_TEXT)
        helpLabel.foreground = java.awt.Color.GRAY
        toolbar.add(helpLabel)

        add(toolbar, BorderLayout.NORTH)

        // Editor - try JavaScript language, fallback to plain
        editorTextField = try {
            val jsLanguage = Class.forName("com.intellij.lang.javascript.JavascriptLanguage")
                .getField("INSTANCE").get(null) as com.intellij.lang.Language
            LanguageTextField(jsLanguage, project, "", false)
        } catch (e: Exception) {
            // JavaScript plugin not available
            EditorTextField("", project, null).apply {
                setOneLineMode(false)
            }
        }

        editorTextField.setOneLineMode(false)
        editorTextField.addSettingsProvider { editor ->
            configureEditor(editor)
        }

        add(editorTextField, BorderLayout.CENTER)
    }

    private fun configureEditor(editor: EditorEx) {
        editor.settings.apply {
            isLineNumbersShown = true
            isWhitespacesShown = false
            isLineMarkerAreaShown = false
            isFoldingOutlineShown = false
            isUseSoftWraps = true
            additionalLinesCount = 0
        }
        editor.setVerticalScrollbarVisible(true)
    }

    /**
     * Add selected snippet to editor.
     */
    private fun addSelectedSnippet() {
        val index = snippetCombo.selectedIndex
        if (index < 0 || index >= SNIPPETS.size) return

        val (name, code) = SNIPPETS[index]
        if (code.isEmpty()) return  // separator

        val currentText = editorTextField.text
        val newText = if (currentText.isBlank()) {
            code
        } else {
            "$currentText\n$code"
        }
        editorTextField.text = newText
    }

    var text: String
        get() = editorTextField.text
        set(value) {
            editorTextField.text = value
        }

    fun isEmpty(): Boolean {
        return text.lines()
            .filter { it.isNotBlank() && !it.trim().startsWith("//") }
            .isEmpty()
    }

    /**
     * Clear editor.
     */
    fun clear() {
        editorTextField.text = ""
    }
}

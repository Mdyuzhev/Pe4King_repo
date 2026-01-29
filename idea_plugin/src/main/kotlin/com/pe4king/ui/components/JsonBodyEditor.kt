package com.pe4king.ui.components

import com.intellij.json.JsonFileType
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.EditorSettings
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.editor.highlighter.EditorHighlighterFactory
import com.intellij.openapi.project.Project
import com.intellij.ui.EditorTextField
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.JPanel

/**
 * Editor panel with JSON syntax highlighting.
 * Uses IntelliJ's editor infrastructure for proper highlighting.
 */
class JsonBodyEditor(
    private val project: Project
) : JPanel(BorderLayout()) {

    private val editorTextField: EditorTextField

    init {
        // Create EditorTextField with JSON file type for syntax highlighting
        editorTextField = object : EditorTextField("", project, JsonFileType.INSTANCE) {
            override fun createEditor(): EditorEx {
                val editor = super.createEditor()
                setupEditor(editor)
                return editor
            }
        }
        
        // Configure the text field
        editorTextField.setOneLineMode(false)
        editorTextField.preferredSize = Dimension(0, 200)
        
        add(editorTextField, BorderLayout.CENTER)
    }

    /**
     * Configure editor settings for better JSON editing experience.
     */
    private fun setupEditor(editor: EditorEx) {
        editor.settings.apply {
            // Display settings
            isLineNumbersShown = true
            isWhitespacesShown = false
            isLineMarkerAreaShown = false
            isFoldingOutlineShown = true
            isAutoCodeFoldingEnabled = true
            
            // Editing settings
            isVirtualSpace = false
            isAdditionalPageAtBottom = false
            additionalColumnsCount = 0
            additionalLinesCount = 2
            
            // Soft wraps for long lines
            isUseSoftWraps = true
            
            // Caret settings
            isCaretRowShown = true
            isBlinkCaret = true
        }
        
        // Set highlighter for JSON
        val highlighter = EditorHighlighterFactory.getInstance().createEditorHighlighter(
            project,
            JsonFileType.INSTANCE
        )
        editor.highlighter = highlighter
        
        // Use editor color scheme
        editor.colorsScheme = EditorColorsManager.getInstance().globalScheme
        
        // Set background
        editor.backgroundColor = editor.colorsScheme.defaultBackground
    }

    /**
     * Get current text content.
     */
    var text: String
        get() = editorTextField.text
        set(value) {
            editorTextField.text = value
        }

    /**
     * Check if editor has focus.
     */
    override fun hasFocus(): Boolean = editorTextField.editor?.contentComponent?.hasFocus() ?: false

    /**
     * Request focus for the editor.
     */
    override fun requestFocus() {
        editorTextField.requestFocus()
    }

    /**
     * Get the underlying editor (if available).
     */
    fun getEditor(): Editor? = editorTextField.editor

    /**
     * Dispose resources when no longer needed.
     */
    fun dispose() {
        // EditorTextField handles its own disposal
    }
}

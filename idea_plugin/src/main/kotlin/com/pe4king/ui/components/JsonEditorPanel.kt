package com.pe4king.ui.components

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.intellij.json.JsonLanguage
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.project.Project
import com.intellij.ui.EditorTextField
import com.intellij.ui.LanguageTextField
import java.awt.BorderLayout
import javax.swing.JPanel

/**
 * JSON editor panel with syntax highlighting.
 */
class JsonEditorPanel(
    private val project: Project,
    initialText: String = "",
    private val isReadOnly: Boolean = false
) : JPanel(BorderLayout()) {

    private val log = Logger.getInstance(JsonEditorPanel::class.java)

    private val objectMapper = ObjectMapper().apply {
        enable(SerializationFeature.INDENT_OUTPUT)
    }

    private val editorTextField: EditorTextField = LanguageTextField(
        JsonLanguage.INSTANCE,
        project,
        formatJsonSafe(initialText),
        false
    )

    init {
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
            isFoldingOutlineShown = true
            isAutoCodeFoldingEnabled = true
            isUseSoftWraps = true
        }
        editor.isViewer = isReadOnly
        editor.setVerticalScrollbarVisible(true)
        editor.setHorizontalScrollbarVisible(true)
    }

    var text: String
        get() = editorTextField.text
        set(value) {
            editorTextField.text = formatJsonSafe(value)
        }

    /**
     * Set JSON from any object.
     * Handles LinkedHashMap, ArrayList from OpenAPI parser.
     */
    fun setJsonObject(obj: Any?) {
        log.info("setJsonObject called with: ${obj?.javaClass?.name}")

        if (obj == null) {
            editorTextField.text = ""
            return
        }

        val jsonString = try {
            when (obj) {
                is String -> {
                    // If it's already a JSON string, use it
                    if (obj.trim().startsWith("{") || obj.trim().startsWith("[")) {
                        obj
                    } else {
                        objectMapper.writeValueAsString(obj)
                    }
                }
                is Map<*, *>, is List<*> -> {
                    // Directly serialize - Jackson handles these
                    objectMapper.writeValueAsString(obj)
                }
                else -> {
                    // Try to serialize, fallback to manual conversion
                    try {
                        objectMapper.writeValueAsString(obj)
                    } catch (e: Exception) {
                        log.warn("Direct serialization failed, trying manual: ${e.message}")
                        val converted = deepConvert(obj)
                        objectMapper.writeValueAsString(converted)
                    }
                }
            }
        } catch (e: Exception) {
            log.error("Failed to serialize object: ${e.message}", e)
            // Absolute fallback - show error
            """{"error": "Cannot serialize: ${obj.javaClass.simpleName}", "toString": "${obj.toString().take(100).replace("\"", "'")}"}"""
        }

        log.info("Resulting JSON (first 100 chars): ${jsonString.take(100)}")
        editorTextField.text = formatJsonSafe(jsonString)
    }

    /**
     * Deep convert any object to JSON-serializable form.
     */
    private fun deepConvert(obj: Any?): Any? {
        return when (obj) {
            null -> null
            is String, is Number, is Boolean -> obj
            is Map<*, *> -> obj.entries.associate { (k, v) ->
                k.toString() to deepConvert(v)
            }
            is Iterable<*> -> obj.map { deepConvert(it) }
            is Array<*> -> obj.map { deepConvert(it) }
            else -> obj.toString()
        }
    }

    private fun formatJsonSafe(json: String): String {
        if (json.isBlank()) return ""
        return try {
            val tree = objectMapper.readTree(json)
            objectMapper.writeValueAsString(tree)
        } catch (e: Exception) {
            json
        }
    }

    fun isValidJson(): Boolean {
        return try {
            objectMapper.readTree(editorTextField.text)
            true
        } catch (e: Exception) {
            false
        }
    }

    fun formatContent() {
        editorTextField.text = formatJsonSafe(editorTextField.text)
    }
}

package com.pe4king.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.ui.Messages
import com.pe4king.core.parser.ParseResult
import com.pe4king.services.Pe4KingProjectService

/**
 * Action to open an OpenAPI specification file.
 */
class OpenSpecAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return

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

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }
}

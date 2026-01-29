package com.pe4king.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.components.service
import com.intellij.openapi.ui.Messages
import com.pe4king.core.parser.ParseResult
import com.pe4king.services.Pe4KingProjectService

/**
 * Action to generate tests from the currently open file.
 */
class GenerateFromEditorAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return

        if (file.extension?.lowercase() !in listOf("yaml", "yml", "json")) {
            Messages.showWarningDialog(
                project,
                "Please open an OpenAPI/Swagger specification file (.yaml, .yml, or .json)",
                "Invalid File"
            )
            return
        }

        val service = project.service<Pe4KingProjectService>()
        when (val result = service.loadSpec(file.path)) {
            is ParseResult.Success -> {
                Messages.showInfoMessage(
                    project,
                    "Loaded ${result.endpoints.size} endpoints. Ready to generate tests.",
                    "Pe4King"
                )
            }
            is ParseResult.Error -> {
                Messages.showErrorDialog(project, result.message, "Parse Error")
            }
        }
    }

    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE)
        e.presentation.isEnabledAndVisible = e.project != null &&
                file != null &&
                file.extension?.lowercase() in listOf("yaml", "yml", "json")
    }
}

package com.pe4king.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.ui.Messages
import com.pe4king.services.Pe4KingProjectService
import com.pe4king.ui.dialogs.GenerateTestsDialog

/**
 * Action to generate tests from loaded specification.
 */
class GenerateTestsAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val service = project.service<Pe4KingProjectService>()

        if (!service.hasSpec()) {
            Messages.showWarningDialog(
                project,
                "Please open an OpenAPI specification first (Tools → Pe4King → Open Specification)",
                "No Specification Loaded"
            )
            return
        }

        val spec = service.currentSpec ?: return
        val endpoints = service.getEndpoints()

        if (endpoints.isEmpty()) {
            Messages.showWarningDialog(
                project,
                "No endpoints found in the specification",
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

            if (options.outputDir.isBlank()) {
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
                    Messages.showInfoMessage(
                        project,
                        """
                        Generation complete!

                        Files: ${result.files.size}
                        Endpoints: ${result.stats.totalEndpoints}
                        Tests: ${result.stats.totalTests}
                        - Positive: ${result.stats.positiveTests}
                        - Negative: ${result.stats.negativeTests}
                        Assertions: ${result.stats.assertions}

                        Output: ${options.outputDir}
                        """.trimIndent(),
                        "Pe4King - Generation Complete"
                    )
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

    override fun update(e: AnActionEvent) {
        val project = e.project
        e.presentation.isEnabledAndVisible = project != null

        if (project != null) {
            val service = project.service<Pe4KingProjectService>()
            e.presentation.isEnabled = service.hasSpec()
        }
    }
}

package com.pe4king.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages

/**
 * Action to open Pe4King settings.
 */
class SettingsAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        Messages.showInfoMessage(
            e.project,
            "Settings dialog coming soon.",
            "Pe4King Settings"
        )
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }
}

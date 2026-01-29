package com.pe4king.ui.panels

import com.intellij.icons.AllIcons
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.fileChooser.ex.FileSaverDialogImpl
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import com.pe4king.eva.EvaAnalyzer
import com.pe4king.eva.EvaGrade
import com.pe4king.eva.EvaReport
import com.pe4king.eva.EvaReportExporter
import com.pe4king.eva.OracleDepth
import com.pe4king.eva.TestCaseGenerator
import com.pe4king.eva.TestCaseExporter
import java.awt.BorderLayout
import java.awt.Color
import java.awt.FlowLayout
import java.awt.Font
import java.io.File
import javax.swing.*

/**
 * EVA (Evaluation of Verification Assets) panel.
 * Analyzes test quality, exports reports, and generates test cases.
 */
class EvaPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val analyzer = EvaAnalyzer()
    private val exporter = EvaReportExporter()
    private val resultsPanel = JPanel()
    private val summaryLabel = JBLabel("Select a test file or folder to analyze")

    private var currentReports: List<EvaReport> = emptyList()
    private val exportButton: JButton
    private val createCasesButton: JButton

    init {
        border = JBUI.Borders.empty(8)

        // Toolbar
        val toolbar = JPanel(FlowLayout(FlowLayout.LEFT, 8, 4))

        val analyzeFileBtn = JButton("Analyze File", AllIcons.Actions.AddFile)
        analyzeFileBtn.addActionListener { analyzeFile() }
        toolbar.add(analyzeFileBtn)

        val analyzeFolderBtn = JButton("Analyze Folder", AllIcons.Actions.OpenNewTab)
        analyzeFolderBtn.addActionListener { analyzeFolder() }
        toolbar.add(analyzeFolderBtn)

        exportButton = JButton("Export PDF", AllIcons.ToolbarDecorator.Export)
        exportButton.isEnabled = false
        exportButton.addActionListener { exportToPdf() }
        toolbar.add(exportButton)

        createCasesButton = JButton("Create Cases", AllIcons.FileTypes.Any_type)
        createCasesButton.addActionListener { createTestCases() }
        toolbar.add(createCasesButton)

        add(toolbar, BorderLayout.NORTH)

        // Summary
        summaryLabel.font = Font(summaryLabel.font.name, Font.BOLD, 14)
        summaryLabel.border = JBUI.Borders.empty(8)

        // Results
        resultsPanel.layout = BoxLayout(resultsPanel, BoxLayout.Y_AXIS)

        val contentPanel = JPanel(BorderLayout())
        contentPanel.add(summaryLabel, BorderLayout.NORTH)
        contentPanel.add(JBScrollPane(resultsPanel), BorderLayout.CENTER)

        add(contentPanel, BorderLayout.CENTER)
    }

    private fun analyzeFile() {
        val descriptor = FileChooserDescriptor(true, false, false, false, false, false)
            .withTitle("Select Test File")
            .withFileFilter { file ->
                file.extension?.lowercase() in listOf("java", "kt", "py")
            }

        FileChooser.chooseFile(descriptor, project, null) { file ->
            val report = analyzer.analyzeFile(java.io.File(file.path))
            showReports(listOf(report))
        }
    }

    private fun analyzeFolder() {
        val descriptor = FileChooserDescriptor(false, true, false, false, false, false)
            .withTitle("Select Test Folder")

        FileChooser.chooseFile(descriptor, project, null) { folder ->
            val reports = analyzer.analyzeDirectory(java.io.File(folder.path))
            showReports(reports)
        }
    }

    private fun exportToPdf() {
        if (currentReports.isEmpty()) {
            Messages.showWarningDialog(
                project,
                "No analysis results to export. Please analyze tests first.",
                "No Results"
            )
            return
        }

        val descriptor = FileSaverDescriptor(
            "Export EVA Report",
            "Save EVA analysis report as PDF",
            "pdf"
        )

        val dialog = FileSaverDialogImpl(descriptor, project)
        val defaultFileName = "eva-report-${System.currentTimeMillis()}.pdf"

        val wrapper = dialog.save(
            project.basePath?.let { com.intellij.openapi.vfs.LocalFileSystem.getInstance().findFileByPath(it) },
            defaultFileName
        )

        if (wrapper != null) {
            try {
                val outputFile = File(wrapper.file.path)
                exporter.export(currentReports, outputFile)

                Messages.showInfoMessage(
                    project,
                    "Report exported successfully!\n\nFile: ${outputFile.absolutePath}",
                    "Export Complete"
                )

                if (java.awt.Desktop.isDesktopSupported()) {
                    java.awt.Desktop.getDesktop().open(outputFile.parentFile)
                }
            } catch (e: Exception) {
                Messages.showErrorDialog(
                    project,
                    "Failed to export report: ${e.message}",
                    "Export Error"
                )
            }
        }
    }

    private fun createTestCases() {
        val fileDescriptor = FileChooserDescriptor(true, false, false, false, false, false)
            .withTitle("Select Test File")
            .withDescription("Select a test file to generate test cases from")
            .withFileFilter { file ->
                file.extension?.lowercase() in listOf("java", "kt", "py")
            }

        FileChooser.chooseFile(fileDescriptor, project, null) { virtualFile ->
            val sourceFile = java.io.File(virtualFile.path)

            try {
                val generator = TestCaseGenerator()
                val testCases = generator.parseTestFile(sourceFile)

                if (testCases.isEmpty()) {
                    Messages.showWarningDialog(
                        project,
                        "No test methods found in the selected file.",
                        "No Tests Found"
                    )
                    return@chooseFile
                }

                val saveDescriptor = FileSaverDescriptor(
                    "Save Test Cases",
                    "Save test cases as TestIT Excel file",
                    "xlsx"
                )
                val saveDialog = FileSaverDialogImpl(saveDescriptor, project)
                val defaultFileName = "${sourceFile.nameWithoutExtension}_TestCases.xlsx"

                val wrapper = saveDialog.save(virtualFile.parent, defaultFileName)

                if (wrapper != null) {
                    val outputFile = java.io.File(wrapper.file.path)
                    val projectName = sourceFile.nameWithoutExtension
                        .replace("Test", "")
                        .replace("Api", "")
                        .ifEmpty { "API" }

                    val exporter = TestCaseExporter()
                    exporter.export(testCases, outputFile, projectName)

                    Messages.showInfoMessage(
                        project,
                        "Successfully generated ${testCases.size} test cases!\n\nFile: ${outputFile.absolutePath}",
                        "Test Cases Created"
                    )

                    if (java.awt.Desktop.isDesktopSupported()) {
                        java.awt.Desktop.getDesktop().open(outputFile.parentFile)
                    }
                }
            } catch (e: Exception) {
                Messages.showErrorDialog(
                    project,
                    "Failed to generate test cases: ${e.message}",
                    "Generation Error"
                )
            }
        }
    }

    private fun showReports(reports: List<EvaReport>) {
        resultsPanel.removeAll()
        currentReports = reports

        if (reports.isEmpty() || reports.all { it.tests.isEmpty() }) {
            summaryLabel.text = "No tests found"
            exportButton.isEnabled = false
            resultsPanel.revalidate()
            resultsPanel.repaint()
            return
        }

        exportButton.isEnabled = true

        val allTests = reports.flatMap { it.tests }
        val avgScore = allTests.map { it.score }.average().toInt()
        val grade = EvaGrade.values().find { avgScore >= it.minScore } ?: EvaGrade.F
        val gradeColor = getGradeColor(grade)

        summaryLabel.text = "<html>Overall: <font color='${colorToHex(gradeColor)}'><b>Grade ${grade.name}</b></font> " +
                "(${avgScore}/100) | ${allTests.size} tests in ${reports.size} files</html>"

        for (report in reports) {
            if (report.tests.isEmpty()) continue

            val fileHeader = JPanel(BorderLayout())
            fileHeader.border = JBUI.Borders.empty(8, 0, 4, 0)

            val fileLabel = JBLabel("<html><b>${report.fileName}</b> — " +
                    "Score: ${report.summary.averageScore}, " +
                    "Depth: ${report.summary.averageOracleDepth.name}, " +
                    "Grade: ${report.summary.grade.name}</html>")
            fileLabel.foreground = getGradeColor(report.summary.grade)
            fileHeader.add(fileLabel, BorderLayout.WEST)

            resultsPanel.add(fileHeader)

            for (test in report.tests) {
                val testPanel = createTestPanel(test)
                resultsPanel.add(testPanel)
            }

            if (report.summary.recommendations.isNotEmpty()) {
                val recPanel = JPanel(BorderLayout())
                recPanel.border = JBUI.Borders.empty(4, 16)
                val recText = report.summary.recommendations.joinToString("<br>• ", prefix = "• ")
                val recLabel = JBLabel("<html><i>Recommendations:</i><br>$recText</html>")
                recLabel.foreground = JBColor.GRAY
                recPanel.add(recLabel)
                resultsPanel.add(recPanel)
            }

            resultsPanel.add(JSeparator())
        }

        resultsPanel.add(Box.createVerticalGlue())
        resultsPanel.revalidate()
        resultsPanel.repaint()
    }

    private fun createTestPanel(test: com.pe4king.eva.TestAnalysis): JPanel {
        val panel = JPanel(BorderLayout())
        panel.border = JBUI.Borders.empty(2, 16)

        val scoreColor = getScoreColor(test.score)
        val depthBadge = getDepthBadge(test.oracleDepth)

        val nameLabel = JBLabel("<html>$depthBadge <b>${test.name}</b> — " +
                "<font color='${colorToHex(scoreColor)}'>${test.score}/100</font> " +
                "(${test.assertionCount} assertions)</html>")
        panel.add(nameLabel, BorderLayout.WEST)

        if (test.issues.isNotEmpty()) {
            val issuesText = test.issues.joinToString(", ")
            val issuesLabel = JBLabel("<html><font color='#e06c75'>⚠ $issuesText</font></html>")
            panel.add(issuesLabel, BorderLayout.EAST)
        }

        panel.maximumSize = java.awt.Dimension(Int.MAX_VALUE, 28)
        return panel
    }

    private fun getDepthBadge(depth: OracleDepth): String {
        val color = when (depth) {
            OracleDepth.L0 -> "#e06c75"
            OracleDepth.L1 -> "#e5c07b"
            OracleDepth.L2 -> "#e5c07b"
            OracleDepth.L3 -> "#98c379"
            OracleDepth.L4 -> "#98c379"
            OracleDepth.L5 -> "#61afef"
            OracleDepth.L6 -> "#c678dd"
        }
        return "<font color='$color'>[${depth.name}]</font>"
    }

    private fun getScoreColor(score: Int): Color {
        return when {
            score >= 80 -> Color(97, 175, 121)
            score >= 60 -> Color(229, 192, 123)
            else -> Color(224, 108, 117)
        }
    }

    private fun getGradeColor(grade: EvaGrade): Color {
        return when (grade) {
            EvaGrade.S -> Color(198, 120, 221)
            EvaGrade.A -> Color(97, 175, 121)
            EvaGrade.B -> Color(97, 175, 121)
            EvaGrade.C -> Color(229, 192, 123)
            EvaGrade.D -> Color(224, 108, 117)
            EvaGrade.F -> Color(224, 108, 117)
        }
    }

    private fun colorToHex(color: Color): String {
        return String.format("#%02x%02x%02x", color.red, color.green, color.blue)
    }
}

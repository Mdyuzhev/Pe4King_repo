package com.pe4king.eva

import com.lowagie.text.Document
import com.lowagie.text.Element
import com.lowagie.text.Font
import com.lowagie.text.PageSize
import com.lowagie.text.Paragraph
import com.lowagie.text.Phrase
import com.lowagie.text.Rectangle
import com.lowagie.text.pdf.PdfPCell
import com.lowagie.text.pdf.PdfPTable
import com.lowagie.text.pdf.PdfWriter
import java.awt.Color
import java.io.File
import java.io.FileOutputStream
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * Exports EVA analysis reports to PDF format.
 * Creates professional test quality reports with grades, scores, and recommendations.
 */
class EvaReportExporter {

    companion object {
        // Colors matching the UI theme
        private val COLOR_PURPLE = Color(198, 120, 221)
        private val COLOR_GREEN = Color(97, 175, 121)
        private val COLOR_YELLOW = Color(229, 192, 123)
        private val COLOR_RED = Color(224, 108, 117)
        private val COLOR_BLUE = Color(97, 175, 239)
        private val COLOR_GRAY = Color(128, 128, 128)
        
        // Fonts
        private val FONT_TITLE = Font(Font.HELVETICA, 24f, Font.BOLD, Color.DARK_GRAY)
        private val FONT_SUBTITLE = Font(Font.HELVETICA, 14f, Font.NORMAL, COLOR_GRAY)
        private val FONT_HEADING = Font(Font.HELVETICA, 14f, Font.BOLD, Color.DARK_GRAY)
        private val FONT_NORMAL = Font(Font.HELVETICA, 10f, Font.NORMAL, Color.DARK_GRAY)
        private val FONT_BOLD = Font(Font.HELVETICA, 10f, Font.BOLD, Color.DARK_GRAY)
        private val FONT_SMALL = Font(Font.HELVETICA, 9f, Font.NORMAL, COLOR_GRAY)
    }

    /**
     * Export reports to PDF file.
     */
    fun export(reports: List<EvaReport>, outputFile: File) {
        val document = Document(PageSize.A4, 50f, 50f, 50f, 50f)
        
        try {
            PdfWriter.getInstance(document, FileOutputStream(outputFile))
            document.open()
            
            // Title
            addTitle(document)
            
            // Summary section
            addSummary(document, reports)
            
            // Detailed reports
            for (report in reports) {
                if (report.tests.isNotEmpty()) {
                    addFileReport(document, report)
                }
            }
            
            // Footer with generation info
            addFooter(document)
            
        } finally {
            document.close()
        }
    }

    private fun addTitle(document: Document) {
        val title = Paragraph("EVA Test Quality Report", FONT_TITLE)
        title.alignment = Element.ALIGN_CENTER
        title.spacingAfter = 5f
        document.add(title)
        
        val subtitle = Paragraph("Evaluation of Verification Assets", FONT_SUBTITLE)
        subtitle.alignment = Element.ALIGN_CENTER
        subtitle.spacingAfter = 20f
        document.add(subtitle)
    }

    private fun addSummary(document: Document, reports: List<EvaReport>) {
        val allTests = reports.flatMap { it.tests }
        if (allTests.isEmpty()) return
        
        val avgScore = allTests.map { it.score }.average().toInt()
        val grade = EvaGrade.values().find { avgScore >= it.minScore } ?: EvaGrade.F
        
        // Summary box - two columns
        val table = PdfPTable(2)
        table.widthPercentage = 100f
        table.setWidths(floatArrayOf(1f, 1f))
        table.setSpacingAfter(20f)
        
        // Left cell - Grade display
        val gradeCell = PdfPCell()
        gradeCell.border = Rectangle.BOX
        gradeCell.borderColor = getGradeColor(grade)
        gradeCell.borderWidth = 2f
        gradeCell.setPadding(15f)
        gradeCell.horizontalAlignment = Element.ALIGN_CENTER
        
        val gradeFont = Font(Font.HELVETICA, 48f, Font.BOLD, getGradeColor(grade))
        val gradePara = Paragraph("Grade ${grade.name}", gradeFont)
        gradePara.alignment = Element.ALIGN_CENTER
        gradeCell.addElement(gradePara)
        
        val scorePara = Paragraph("${avgScore}/100", FONT_HEADING)
        scorePara.alignment = Element.ALIGN_CENTER
        gradeCell.addElement(scorePara)
        
        val descPara = Paragraph(grade.description, FONT_SMALL)
        descPara.alignment = Element.ALIGN_CENTER
        gradeCell.addElement(descPara)
        
        table.addCell(gradeCell)
        
        // Right cell - Statistics
        val statsCell = PdfPCell()
        statsCell.border = Rectangle.BOX
        statsCell.borderColor = Color.LIGHT_GRAY
        statsCell.setPadding(15f)
        
        statsCell.addElement(Paragraph("Analysis Summary", FONT_HEADING))
        statsCell.addElement(Paragraph(" ", FONT_SMALL))
        statsCell.addElement(Paragraph("Total Tests: ${allTests.size}", FONT_NORMAL))
        statsCell.addElement(Paragraph("Files Analyzed: ${reports.size}", FONT_NORMAL))
        
        // Count by depth level
        val depthCounts = allTests.groupBy { it.oracleDepth }.mapValues { it.value.size }
        val depthSummary = OracleDepth.values().mapNotNull { depth ->
            depthCounts[depth]?.let { "${depth.name}: $it" }
        }.joinToString(", ")
        if (depthSummary.isNotEmpty()) {
            statsCell.addElement(Paragraph("By Depth: $depthSummary", FONT_SMALL))
        }
        
        // Pass/Fail counts
        val passingTests = allTests.count { it.score >= 60 }
        val failingTests = allTests.size - passingTests
        statsCell.addElement(Paragraph("Passing (≥60): $passingTests | Failing: $failingTests", FONT_SMALL))
        
        // Average assertions
        val avgAssertions = allTests.map { it.assertionCount }.average()
        statsCell.addElement(Paragraph("Avg Assertions: %.1f".format(avgAssertions), FONT_SMALL))
        
        table.addCell(statsCell)
        
        document.add(table)
    }

    private fun addFileReport(document: Document, report: EvaReport) {
        // File header with colored grade
        val headerFont = Font(Font.HELVETICA, 12f, Font.BOLD, getGradeColor(report.summary.grade))
        val header = Paragraph(report.fileName, headerFont)
        header.spacingBefore = 15f
        header.spacingAfter = 5f
        document.add(header)
        
        val summaryText = "Score: ${report.summary.averageScore}/100 | " +
                "Depth: ${report.summary.averageOracleDepth.name} | " +
                "Grade: ${report.summary.grade.name} | " +
                "Tests: ${report.tests.size}"
        val summaryPara = Paragraph(summaryText, FONT_SMALL)
        summaryPara.spacingAfter = 10f
        document.add(summaryPara)
        
        // Tests table
        val table = PdfPTable(4)
        table.widthPercentage = 100f
        table.setWidths(floatArrayOf(1f, 4f, 1.5f, 2.5f))
        
        // Header row
        addTableHeader(table, "Depth")
        addTableHeader(table, "Test Name")
        addTableHeader(table, "Score")
        addTableHeader(table, "Issues")
        
        // Test rows
        for (test in report.tests) {
            // Depth badge
            val depthFont = Font(Font.HELVETICA, 9f, Font.BOLD, getDepthColor(test.oracleDepth))
            val depthCell = PdfPCell(Phrase(test.oracleDepth.name, depthFont))
            depthCell.horizontalAlignment = Element.ALIGN_CENTER
            depthCell.verticalAlignment = Element.ALIGN_MIDDLE
            depthCell.setPadding(5f)
            depthCell.border = Rectangle.BOTTOM
            depthCell.borderColor = Color.LIGHT_GRAY
            table.addCell(depthCell)
            
            // Test name
            val nameCell = PdfPCell(Phrase(test.name, FONT_NORMAL))
            nameCell.setPadding(5f)
            nameCell.border = Rectangle.BOTTOM
            nameCell.borderColor = Color.LIGHT_GRAY
            table.addCell(nameCell)
            
            // Score with color
            val scoreFont = Font(Font.HELVETICA, 10f, Font.BOLD, getScoreColor(test.score))
            val scoreText = "${test.score}/100 (${test.assertionCount})"
            val scoreCell = PdfPCell(Phrase(scoreText, scoreFont))
            scoreCell.horizontalAlignment = Element.ALIGN_CENTER
            scoreCell.setPadding(5f)
            scoreCell.border = Rectangle.BOTTOM
            scoreCell.borderColor = Color.LIGHT_GRAY
            table.addCell(scoreCell)
            
            // Issues
            val issuesText = if (test.issues.isNotEmpty()) test.issues.joinToString(", ") else "—"
            val issuesFont = if (test.issues.isNotEmpty())
                Font(Font.HELVETICA, 8f, Font.NORMAL, COLOR_RED) else FONT_SMALL
            val issuesCell = PdfPCell(Phrase(issuesText, issuesFont))
            issuesCell.setPadding(5f)
            issuesCell.border = Rectangle.BOTTOM
            issuesCell.borderColor = Color.LIGHT_GRAY
            table.addCell(issuesCell)
        }
        
        document.add(table)
        
        // Recommendations section
        if (report.summary.recommendations.isNotEmpty()) {
            val recHeader = Paragraph("Recommendations:", FONT_BOLD)
            recHeader.spacingBefore = 10f
            recHeader.spacingAfter = 5f
            document.add(recHeader)
            
            for (rec in report.summary.recommendations) {
                val recPara = Paragraph("• $rec", FONT_SMALL)
                recPara.indentationLeft = 15f
                document.add(recPara)
            }
        }
        
        // Separator line
        val separator = Paragraph(" ")
        separator.spacingAfter = 10f
        document.add(separator)
    }

    private fun addTableHeader(table: PdfPTable, text: String) {
        val cell = PdfPCell(Phrase(text, FONT_BOLD))
        cell.backgroundColor = Color(240, 240, 240)
        cell.setPadding(8f)
        cell.horizontalAlignment = Element.ALIGN_CENTER
        table.addCell(cell)
    }

    private fun addFooter(document: Document) {
        val timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))
        val footer = Paragraph("Generated by Pe4King EVA Analyzer | $timestamp", FONT_SMALL)
        footer.spacingBefore = 30f
        footer.alignment = Element.ALIGN_CENTER
        document.add(footer)
        
        val version = Paragraph("Pe4King IDEA Plugin | https://pe4king.com", FONT_SMALL)
        version.alignment = Element.ALIGN_CENTER
        document.add(version)
    }

    private fun getGradeColor(grade: EvaGrade): Color {
        return when (grade) {
            EvaGrade.S -> COLOR_PURPLE
            EvaGrade.A, EvaGrade.B -> COLOR_GREEN
            EvaGrade.C -> COLOR_YELLOW
            EvaGrade.D, EvaGrade.F -> COLOR_RED
        }
    }

    private fun getScoreColor(score: Int): Color {
        return when {
            score >= 80 -> COLOR_GREEN
            score >= 60 -> COLOR_YELLOW
            else -> COLOR_RED
        }
    }

    private fun getDepthColor(depth: OracleDepth): Color {
        return when (depth) {
            OracleDepth.L0 -> COLOR_RED
            OracleDepth.L1, OracleDepth.L2 -> COLOR_YELLOW
            OracleDepth.L3, OracleDepth.L4 -> COLOR_GREEN
            OracleDepth.L5 -> COLOR_BLUE
            OracleDepth.L6 -> COLOR_PURPLE
        }
    }
}

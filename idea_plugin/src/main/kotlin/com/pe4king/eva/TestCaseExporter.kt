package com.pe4king.eva

import org.apache.poi.ss.usermodel.*
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.File
import java.io.FileOutputStream
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * Exports test cases to TestIT-compatible Excel format.
 */
class TestCaseExporter {

    companion object {
        // Column indices matching TestIT format
        private const val COL_ID = 0
        private const val COL_LOCATION = 1
        private const val COL_NAME = 2
        private const val COL_AUTOMATED = 3
        private const val COL_PRECONDITIONS = 4
        private const val COL_STEPS = 5
        private const val COL_POSTCONDITIONS = 6
        private const val COL_EXPECTED = 7
        private const val COL_TEST_DATA = 8
        private const val COL_COMMENTS = 9
        private const val COL_ITERATIONS = 10
        private const val COL_PRIORITY = 11
        private const val COL_STATUS = 12
        private const val COL_CREATED = 13
        private const val COL_AUTHOR = 14
        private const val COL_DURATION = 15
        private const val COL_TAGS = 16
    }

    /**
     * Export test cases to Excel file.
     */
    fun export(testCases: List<TestCaseGenerator.TestCase>, outputFile: File, projectName: String = "API Tests") {
        val workbook = XSSFWorkbook()
        val sheet = workbook.createSheet("Project_$projectName")

        // Create styles
        val headerStyle = createHeaderStyle(workbook)

        // Header row
        val headerRow = sheet.createRow(0)
        val headers = listOf(
            "ID", "Расположение", "Наименование", "Автоматизирован",
            "Предусловия", "Шаги", "Постусловия", "Ожидаемый результат",
            "Тестовые данные", "Комментарии", "Итерации", "Приоритет",
            "Статус", "Дата создания", "Автор", "Длительность", "Тег"
        )
        headers.forEachIndexed { index, header ->
            val cell = headerRow.createCell(index)
            cell.setCellValue(header)
            cell.setCellStyle(headerStyle)
        }

        // Data rows
        var rowIndex = 1
        val now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("M/d/yyyy H:mm:ss"))

        for (testCase in testCases) {
            // Main row with test case info
            val mainRow = sheet.createRow(rowIndex++)
            mainRow.createCell(COL_ID).setCellValue(testCase.id)
            mainRow.createCell(COL_LOCATION).setCellValue(testCase.location)
            mainRow.createCell(COL_NAME).setCellValue(testCase.name)
            mainRow.createCell(COL_AUTOMATED).setCellValue(testCase.automated)
            mainRow.createCell(COL_PRIORITY).setCellValue(testCase.priority)
            mainRow.createCell(COL_STATUS).setCellValue("Готов")
            mainRow.createCell(COL_CREATED).setCellValue(now)
            mainRow.createCell(COL_AUTHOR).setCellValue("Pe4King")
            mainRow.createCell(COL_DURATION).setCellValue("0h 1m 0s")
            mainRow.createCell(COL_TAGS).setCellValue(testCase.tags.joinToString(", "))

            // Preconditions - each on separate row
            for (precondition in testCase.preconditions) {
                val precRow = sheet.createRow(rowIndex++)
                precRow.createCell(COL_PRECONDITIONS).setCellValue(precondition)
            }

            // Steps - each step with its expected result
            for (step in testCase.steps) {
                val stepRow = sheet.createRow(rowIndex++)
                stepRow.createCell(COL_STEPS).setCellValue(step.action)
                stepRow.createCell(COL_EXPECTED).setCellValue(step.expected)
            }

            // Test data if present
            if (testCase.testData.isNotEmpty()) {
                val dataRow = sheet.getRow(rowIndex - 1) ?: sheet.createRow(rowIndex - 1)
                dataRow.createCell(COL_TEST_DATA).setCellValue(testCase.testData)
            }
        }

        // Auto-size columns
        for (i in 0..16) {
            sheet.autoSizeColumn(i)
        }

        // Write to file
        FileOutputStream(outputFile).use { fos ->
            workbook.write(fos)
        }
        workbook.close()
    }

    private fun createHeaderStyle(workbook: Workbook): CellStyle {
        val style = workbook.createCellStyle()
        val font = workbook.createFont()
        font.bold = true
        style.setFont(font)
        style.fillForegroundColor = IndexedColors.GREY_25_PERCENT.index
        style.fillPattern = FillPatternType.SOLID_FOREGROUND
        style.borderBottom = BorderStyle.THIN
        style.borderTop = BorderStyle.THIN
        style.borderLeft = BorderStyle.THIN
        style.borderRight = BorderStyle.THIN
        return style
    }
}

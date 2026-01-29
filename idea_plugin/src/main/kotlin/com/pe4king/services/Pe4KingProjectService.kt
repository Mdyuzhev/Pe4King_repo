package com.pe4king.services

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.components.Service
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.pe4king.collections.CollectionManager
import com.pe4king.collections.models.BodyType
import com.pe4king.core.models.*
import com.pe4king.core.parser.OpenApiParser
import com.pe4king.core.parser.ParseResult
import com.pe4king.generator.TestGenerator
import com.pe4king.renderers.TestRenderer
import com.pe4king.renderers.postman.PostmanRenderer
import com.pe4king.renderers.pytest.PytestRenderer
import com.pe4king.renderers.restassured.RestAssuredRenderer
import com.pe4king.renderers.testcases.TestCaseRenderer
import com.pe4king.ui.dialogs.GenerateOptions
import com.fasterxml.jackson.databind.ObjectMapper
import java.io.File
import java.nio.charset.StandardCharsets

/**
 * Project-level service for Pe4King operations.
 */
@Service(Service.Level.PROJECT)
class Pe4KingProjectService(private val project: Project) {

    private val parser = OpenApiParser()
    private val generator = TestGenerator()

    /** Currently loaded specification */
    var currentSpec: ParseResult.Success? = null
        private set

    /**
     * Load an OpenAPI specification from file.
     */
    fun loadSpec(path: String): ParseResult {
        val result = parser.parse(path)
        if (result is ParseResult.Success) {
            currentSpec = result
        }
        return result
    }

    /**
     * Load an OpenAPI specification from content.
     */
    fun loadSpecFromContent(content: String, format: String): ParseResult {
        val result = parser.parseContent(content, format)
        if (result is ParseResult.Success) {
            currentSpec = result
        }
        return result
    }

    /**
     * Check if a spec is loaded.
     */
    fun hasSpec(): Boolean = currentSpec != null

    /**
     * Get endpoints from current spec.
     */
    fun getEndpoints(): List<EndpointInfo> = currentSpec?.endpoints ?: emptyList()

    /**
     * Generate tests with given options.
     */
    fun generateTests(options: GenerateOptions, onComplete: (GenerationResult) -> Unit) {
        val spec = currentSpec ?: return

        // Handle COLLECTION format separately
        if (options.format == OutputFormat.COLLECTION) {
            generateCollection(options, onComplete)
            return
        }

        // Handle TESTCASES format separately (binary Excel output)
        if (options.format == OutputFormat.TESTCASES) {
            generateTestCases(options, onComplete)
            return
        }

        ProgressManager.getInstance().run(object : Task.Backgroundable(
            project, "Generating API Tests", true
        ) {
            override fun run(indicator: ProgressIndicator) {
                indicator.isIndeterminate = false

                try {
                    val config = GeneratorConfig(
                        baseUrl = options.baseUrl,
                        framework = options.format,
                        javaPackage = options.javaPackage,
                        pythonPackage = options.pythonPackage,
                        generateNegativeTests = options.generateNegativeTests,
                        generateEdgeCases = options.generateEdgeCases
                    )

                    indicator.text = "Generating test model..."
                    indicator.fraction = 0.2

                    val testModel = generator.generate(
                        endpoints = options.selectedEndpoints,
                        specTitle = spec.title,
                        specVersion = spec.version,
                        config = config
                    )

                    indicator.text = "Rendering tests..."
                    indicator.fraction = 0.5

                    val renderer = getRenderer(options.format)
                    val files = renderer.render(testModel)

                    indicator.text = "Writing files..."
                    indicator.fraction = 0.8

                    // Write files to output directory
                    val outputDir = File(options.outputDir)
                    if (!outputDir.exists()) {
                        outputDir.mkdirs()
                    }

                    for (file in files) {
                        val outputFile = File(outputDir, file.filename)
                        outputFile.parentFile?.mkdirs()
                        outputFile.writeText(file.content, StandardCharsets.UTF_8)
                        outputFile.setWritable(true)
                    }

                    // Refresh VFS - sync to make files editable
                    ApplicationManager.getApplication().invokeLater {
                        WriteAction.run<Exception> {
                            val vfsDir = LocalFileSystem.getInstance().refreshAndFindFileByPath(options.outputDir)
                            vfsDir?.let {
                                VfsUtil.markDirtyAndRefresh(true, true, true, it)
                                it.refresh(false, true)
                            }
                        }
                    }

                    indicator.fraction = 1.0

                    val result = GenerationResult(
                        success = true,
                        files = files,
                        stats = GenerationStats(
                            totalEndpoints = testModel.endpoints.size,
                            totalTests = testModel.endpoints.sumOf { it.scenarios.size },
                            positiveTests = testModel.endpoints.sumOf { et ->
                                et.scenarios.count { it.type == TestType.POSITIVE }
                            },
                            negativeTests = testModel.endpoints.sumOf { et ->
                                et.scenarios.count { it.type == TestType.NEGATIVE }
                            },
                            assertions = testModel.endpoints.sumOf { et ->
                                et.scenarios.sumOf { it.expected.assertions.size }
                            }
                        )
                    )

                    ApplicationManager.getApplication().invokeLater {
                        onComplete(result)
                    }

                } catch (e: Exception) {
                    val result = GenerationResult(
                        success = false,
                        files = emptyList(),
                        stats = GenerationStats(0, 0, 0, 0, 0),
                        errors = listOf(e.message ?: "Unknown error")
                    )
                    ApplicationManager.getApplication().invokeLater {
                        onComplete(result)
                    }
                }
            }
        })
    }

    /**
     * Generate TestIT Excel test cases.
     */
    private fun generateTestCases(options: GenerateOptions, onComplete: (GenerationResult) -> Unit) {
        val spec = currentSpec ?: return

        ProgressManager.getInstance().run(object : Task.Backgroundable(
            project, "Generating Test Cases", true
        ) {
            override fun run(indicator: ProgressIndicator) {
                indicator.isIndeterminate = false

                try {
                    val config = GeneratorConfig(
                        baseUrl = options.baseUrl,
                        framework = options.format,
                        generateNegativeTests = options.generateNegativeTests,
                        generateEdgeCases = options.generateEdgeCases
                    )

                    indicator.text = "Generating test model..."
                    indicator.fraction = 0.2

                    val testModel = generator.generate(
                        endpoints = options.selectedEndpoints,
                        specTitle = spec.title,
                        specVersion = spec.version,
                        config = config
                    )

                    indicator.text = "Rendering test cases..."
                    indicator.fraction = 0.5

                    val renderer = TestCaseRenderer()
                    val (filename, bytes) = renderer.renderToBytes(testModel)

                    indicator.text = "Writing Excel file..."
                    indicator.fraction = 0.8

                    // Write binary file
                    val outputDir = File(options.outputDir)
                    if (!outputDir.exists()) {
                        outputDir.mkdirs()
                    }

                    val outputFile = File(outputDir, filename)
                    outputFile.writeBytes(bytes)

                    // Refresh VFS
                    ApplicationManager.getApplication().invokeLater {
                        WriteAction.run<Exception> {
                            val vfsDir = LocalFileSystem.getInstance().refreshAndFindFileByPath(options.outputDir)
                            vfsDir?.let {
                                VfsUtil.markDirtyAndRefresh(true, true, true, it)
                                it.refresh(false, true)
                            }
                        }
                    }

                    indicator.fraction = 1.0

                    val totalTests = testModel.endpoints.sumOf { it.scenarios.size }

                    val result = GenerationResult(
                        success = true,
                        files = listOf(GeneratedFile(filename, "[Binary Excel]", "xlsx")),
                        stats = GenerationStats(
                            totalEndpoints = testModel.endpoints.size,
                            totalTests = totalTests,
                            positiveTests = testModel.endpoints.sumOf { et ->
                                et.scenarios.count { it.type == TestType.POSITIVE }
                            },
                            negativeTests = testModel.endpoints.sumOf { et ->
                                et.scenarios.count { it.type == TestType.NEGATIVE }
                            },
                            assertions = testModel.endpoints.sumOf { et ->
                                et.scenarios.sumOf { it.expected.assertions.size }
                            }
                        )
                    )

                    ApplicationManager.getApplication().invokeLater {
                        onComplete(result)
                    }

                } catch (e: Exception) {
                    val result = GenerationResult(
                        success = false,
                        files = emptyList(),
                        stats = GenerationStats(0, 0, 0, 0, 0),
                        errors = listOf(e.message ?: "Unknown error")
                    )
                    ApplicationManager.getApplication().invokeLater {
                        onComplete(result)
                    }
                }
            }
        })
    }

    /**
     * Generate collection from endpoints.
     */
    private fun generateCollection(options: GenerateOptions, onComplete: (GenerationResult) -> Unit) {
        val spec = currentSpec ?: return
        val manager = CollectionManager.getInstance(project)

        try {
            val collection = manager.createCollection(
                spec.title,
                "Generated from ${spec.title} v${spec.version}"
            )
            val baseUrl = spec.baseUrl

            // Group endpoints by tag
            val grouped = options.selectedEndpoints.groupBy { it.tags.firstOrNull() ?: "Default" }

            for ((tag, endpoints) in grouped) {
                val folder = manager.createFolderIn(collection.id, tag)

                for (endpoint in endpoints) {
                    val requestName = endpoint.summary ?: endpoint.operationId ?: "${endpoint.method} ${endpoint.path}"
                    val url = "$baseUrl${endpoint.path}"
                    val method = endpoint.method.name

                    val headers = mutableMapOf("Content-Type" to "application/json")

                    // Generate example body for POST/PUT/PATCH
                    val body = if (endpoint.method in listOf(
                            HttpMethod.POST,
                            HttpMethod.PUT,
                            HttpMethod.PATCH
                        )
                    ) {
                        endpoint.requestBodyExample?.toString()
                            ?: generateExampleBody(endpoint.requestBodySchema)
                    } else null

                    manager.saveRequest(
                        collectionId = collection.id,
                        name = requestName,
                        method = method,
                        url = url,
                        headers = headers,
                        body = body,
                        bodyType = if (body != null) BodyType.RAW else BodyType.NONE,
                        folderId = folder?.id
                    )
                }
            }

            val result = GenerationResult(
                success = true,
                files = emptyList(),
                stats = GenerationStats(
                    totalEndpoints = options.selectedEndpoints.size,
                    totalTests = 0,
                    positiveTests = 0,
                    negativeTests = 0,
                    assertions = 0
                ),
                collectionName = spec.title
            )

            ApplicationManager.getApplication().invokeLater {
                onComplete(result)
            }

        } catch (e: Exception) {
            val result = GenerationResult(
                success = false,
                files = emptyList(),
                stats = GenerationStats(0, 0, 0, 0, 0),
                errors = listOf(e.message ?: "Unknown error")
            )
            ApplicationManager.getApplication().invokeLater {
                onComplete(result)
            }
        }
    }

    /**
     * Generate example JSON body from schema fields.
     */
    private fun generateExampleBody(fields: List<SchemaField>): String? {
        if (fields.isEmpty()) return null

        val obj = mutableMapOf<String, Any?>()
        for (field in fields) {
            if (field.path == "$" || field.path.contains("[")) continue
            val key = field.name
            obj[key] = when (field.fieldType) {
                FieldType.STRING -> field.enumValues?.firstOrNull() ?: "string"
                FieldType.INTEGER -> 0
                FieldType.NUMBER -> 0.0
                FieldType.BOOLEAN -> false
                FieldType.ARRAY -> emptyList<Any>()
                FieldType.OBJECT -> emptyMap<String, Any>()
                else -> null
            }
        }

        return try {
            ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(obj)
        } catch (e: Exception) {
            null
        }
    }

    private fun getRenderer(format: OutputFormat): TestRenderer {
        return when (format) {
            OutputFormat.PYTEST -> PytestRenderer()
            OutputFormat.REST_ASSURED -> RestAssuredRenderer()
            OutputFormat.POSTMAN -> PostmanRenderer()
            OutputFormat.COLLECTION -> throw IllegalArgumentException("COLLECTION format is handled separately")
            OutputFormat.TESTCASES -> throw IllegalArgumentException("TESTCASES format is handled separately")
        }
    }
}

package com.pe4king.renderers

import com.pe4king.core.models.GeneratedFile
import com.pe4king.core.models.TestModel

/**
 * Base interface for test renderers.
 */
interface TestRenderer {
    /** Renderer name */
    val name: String

    /** File extension for output */
    val fileExtension: String

    /**
     * Renders test model to generated files.
     */
    fun render(model: TestModel): List<GeneratedFile>
}

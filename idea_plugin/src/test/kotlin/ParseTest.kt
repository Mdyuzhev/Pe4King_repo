package com.pe4king

import org.junit.jupiter.api.Test
import io.swagger.v3.parser.OpenAPIV3Parser
import io.swagger.v3.parser.core.models.ParseOptions
import io.swagger.parser.OpenAPIParser
import java.io.File

class ParseTest {
    @Test
    fun testParsePetstore() {
        val specFile = File("petstore-swagger.json")
        println("File: ${specFile.absolutePath}")
        println("Exists: ${specFile.exists()}")
        
        // Try OpenAPIParser (handles both Swagger 2.0 and OpenAPI 3.x)
        val parseOptions = ParseOptions().apply {
            isResolve = true
            isResolveFully = true
        }
        
        // Method 1: Read from file content
        val content = specFile.readText()
        println("Content starts: ${content.take(100)}")
        
        val result = OpenAPIParser().readContents(content, null, parseOptions)
        println("OpenAPI: ${result.openAPI}")
        println("Messages: ${result.messages}")
        
        if (result.openAPI != null) {
            println("Title: ${result.openAPI.info?.title}")
            println("Version: ${result.openAPI.info?.version}")
            println("Servers: ${result.openAPI.servers}")
            println("Paths: ${result.openAPI.paths?.size}")
        }
    }
}

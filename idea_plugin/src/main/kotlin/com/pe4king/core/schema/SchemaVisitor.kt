package com.pe4king.core.schema

import com.pe4king.core.models.FieldType
import com.pe4king.core.models.SchemaField
import io.swagger.v3.oas.models.media.Schema

/**
 * Visits OpenAPI schema and extracts fields for assertion generation.
 * Implements Visitor pattern for schema traversal.
 */
class SchemaVisitor(private val maxDepth: Int = 5) {

    private val visitedRefs = mutableSetOf<String>()

    /**
     * Visits a schema and returns flat list of fields with JSON paths.
     */
    fun visit(schema: Schema<Any>, parentPath: String = "", depth: Int = 0): List<SchemaField> {
        if (depth > maxDepth) {
            return emptyList()
        }

        // Handle $ref cycles
        schema.`$ref`?.let { ref ->
            if (ref in visitedRefs) return emptyList()
            visitedRefs.add(ref)
        }

        val type = getFieldType(schema)

        return when (type) {
            FieldType.OBJECT -> visitObject(schema, parentPath, depth)
            FieldType.ARRAY -> visitArray(schema, parentPath, depth)
            else -> {
                // Primitive type at root level
                if (parentPath.isNotEmpty()) {
                    listOf(createField(parentPath, schema))
                } else {
                    emptyList()
                }
            }
        }
    }

    /**
     * Visits object schema and extracts property fields.
     */
    private fun visitObject(
        schema: Schema<Any>,
        parentPath: String,
        depth: Int
    ): List<SchemaField> {
        val fields = mutableListOf<SchemaField>()
        val properties = schema.properties ?: return fields
        val required = schema.required?.toSet() ?: emptySet()

        for ((name, propSchema) in properties) {
            @Suppress("UNCHECKED_CAST")
            val propSchemaCast = propSchema as Schema<Any>
            val path = if (parentPath.isEmpty()) name else "$parentPath.$name"
            val propType = getFieldType(propSchemaCast)

            // Create field for this property
            val field = createField(path, propSchemaCast, name, name in required)
            fields.add(field)

            // Recurse into nested objects/arrays
            when (propType) {
                FieldType.OBJECT -> {
                    if (propSchemaCast.properties != null) {
                        val nested = visitObject(propSchemaCast, path, depth + 1)
                        fields.addAll(nested)
                    }
                }
                FieldType.ARRAY -> {
                    val nested = visitArray(propSchemaCast, path, depth + 1)
                    fields.addAll(nested)
                }
                else -> { /* primitive, already added */ }
            }
        }

        return fields
    }

    /**
     * Visits array schema and extracts item fields.
     */
    private fun visitArray(
        schema: Schema<Any>,
        parentPath: String,
        depth: Int
    ): List<SchemaField> {
        val fields = mutableListOf<SchemaField>()
        val items = schema.items ?: return fields

        @Suppress("UNCHECKED_CAST")
        val itemsSchema = items as Schema<Any>
        val itemType = getFieldType(itemsSchema)

        // Use [0] notation for first array element
        val itemPath = "$parentPath[0]"

        when (itemType) {
            FieldType.OBJECT -> {
                if (itemsSchema.properties != null) {
                    fields.addAll(visitObject(itemsSchema, itemPath, depth + 1))
                }
            }
            else -> {
                // Primitive array items
                fields.add(createField(itemPath, itemsSchema))
            }
        }

        return fields
    }

    /**
     * Creates a SchemaField from schema.
     */
    private fun createField(
        path: String,
        schema: Schema<Any>,
        name: String? = null,
        required: Boolean = false
    ): SchemaField {
        return SchemaField(
            name = name ?: path.substringAfterLast(".").removeSuffix("[0]"),
            path = path,
            fieldType = getFieldType(schema),
            format = schema.format,
            required = required,
            nullable = schema.nullable ?: false,
            enumValues = schema.enum?.map { it.toString() },
            description = schema.description,

            // Numeric constraints
            minimum = schema.minimum,
            maximum = schema.maximum,
            // Note: In OpenAPI 3.0, exclusiveMinimum/Maximum are booleans
            // In OpenAPI 3.1, they are numbers. We handle both by checking type.
            exclusiveMinimum = schema.exclusiveMinimumValue,
            exclusiveMaximum = schema.exclusiveMaximumValue,

            // String constraints
            minLength = schema.minLength,
            maxLength = schema.maxLength,
            pattern = schema.pattern,

            // Array constraints
            minItems = schema.minItems,
            maxItems = schema.maxItems,
            uniqueItems = schema.uniqueItems,

            // Example
            example = schema.example
        )
    }

    /**
     * Determines FieldType from schema.
     */
    private fun getFieldType(schema: Schema<Any>): FieldType {
        return when (schema.type?.lowercase()) {
            "string" -> FieldType.STRING
            "integer" -> FieldType.INTEGER
            "number" -> FieldType.NUMBER
            "boolean" -> FieldType.BOOLEAN
            "array" -> FieldType.ARRAY
            "object" -> FieldType.OBJECT
            else -> {
                // If has properties, treat as object
                if (schema.properties != null) {
                    FieldType.OBJECT
                } else {
                    FieldType.ANY
                }
            }
        }
    }

    /**
     * Generates example JSON object from schema.
     * Recursively builds nested objects and arrays.
     */
    fun generateExample(schema: Schema<Any>, depth: Int = 0): Any? {
        if (depth > maxDepth) return null

        // Use explicit example if available
        schema.example?.let { return it }

        val type = getFieldType(schema)

        return when (type) {
            FieldType.OBJECT -> generateObjectExample(schema, depth)
            FieldType.ARRAY -> generateArrayExample(schema, depth)
            FieldType.STRING -> generateStringExample(schema)
            FieldType.INTEGER -> generateIntegerExample(schema)
            FieldType.NUMBER -> generateNumberExample(schema)
            FieldType.BOOLEAN -> false
            else -> null
        }
    }

    private fun generateObjectExample(schema: Schema<Any>, depth: Int): Map<String, Any?> {
        val result = mutableMapOf<String, Any?>()
        val properties = schema.properties ?: return result

        for ((name, propSchema) in properties) {
            @Suppress("UNCHECKED_CAST")
            val example = generateExample(propSchema as Schema<Any>, depth + 1)
            result[name] = example
        }

        return result
    }

    private fun generateArrayExample(schema: Schema<Any>, depth: Int): List<Any?> {
        val items = schema.items ?: return emptyList()
        @Suppress("UNCHECKED_CAST")
        val itemExample = generateExample(items as Schema<Any>, depth + 1)
        return if (itemExample != null) listOf(itemExample) else emptyList()
    }

    private fun generateStringExample(schema: Schema<Any>): String {
        // Use enum value if available
        schema.enum?.firstOrNull()?.toString()?.let { return it }

        // Use format hint
        return when (schema.format?.lowercase()) {
            "date" -> "2024-01-01"
            "date-time" -> "2024-01-01T00:00:00Z"
            "email" -> "user@example.com"
            "uri", "url" -> "https://example.com"
            "uuid" -> "550e8400-e29b-41d4-a716-446655440000"
            else -> "string"
        }
    }

    private fun generateIntegerExample(schema: Schema<Any>): Long {
        schema.minimum?.let { return it.toLong() }
        return 0L
    }

    private fun generateNumberExample(schema: Schema<Any>): Double {
        schema.minimum?.let { return it.toDouble() }
        return 0.0
    }
}

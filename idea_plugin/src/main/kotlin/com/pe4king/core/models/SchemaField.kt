package com.pe4king.core.models

/**
 * Represents a field in a JSON schema with all its constraints.
 * This is the core data structure for assertion generation.
 */
data class SchemaField(
    /** Field name */
    val name: String,

    /** JSON path: "user.email", "items[0].id" */
    val path: String,

    /** Field type */
    val fieldType: FieldType,

    /** Format: uuid, email, date-time, uri, etc. */
    val format: String? = null,

    /** Whether the field is required */
    val required: Boolean = false,

    /** Whether the field can be null */
    val nullable: Boolean = false,

    /** Enum values if this is an enum field */
    val enumValues: List<Any>? = null,

    /** Field description from schema */
    val description: String? = null,

    /** Nested fields for object/array types */
    val nested: List<SchemaField> = emptyList(),

    // Numeric constraints
    val minimum: Number? = null,
    val maximum: Number? = null,
    val exclusiveMinimum: Number? = null,
    val exclusiveMaximum: Number? = null,

    // String constraints
    val minLength: Int? = null,
    val maxLength: Int? = null,
    val pattern: String? = null,

    // Array constraints
    val minItems: Int? = null,
    val maxItems: Int? = null,
    val uniqueItems: Boolean? = null,

    /** Example value from schema */
    val example: Any? = null
) {
    /**
     * Check if this field has any constraints that can generate assertions.
     */
    fun hasConstraints(): Boolean {
        return enumValues != null ||
                format != null ||
                pattern != null ||
                minimum != null ||
                maximum != null ||
                exclusiveMinimum != null ||
                exclusiveMaximum != null ||
                minLength != null ||
                maxLength != null ||
                minItems != null ||
                maxItems != null
    }

    /**
     * Get the leaf name from the path.
     */
    fun leafName(): String = path.substringAfterLast(".")
}

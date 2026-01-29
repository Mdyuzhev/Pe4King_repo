package com.pe4king.core.models

/**
 * Represents a single assertion to be generated in a test.
 */
data class Assertion(
    /** JSON path to the value being asserted */
    val path: String,

    /** Matcher type */
    val matcher: MatcherType,

    /** Value for comparison matchers (equals, contains, oneOf, etc.) */
    val value: Any? = null,

    /** Human-readable description */
    val description: String? = null
) {
    companion object {
        // Factory methods for common assertions

        fun notNull(path: String, description: String? = null) = Assertion(
            path = path,
            matcher = MatcherType.NOT_NULL,
            description = description ?: "$path is not null"
        )

        fun equals(path: String, value: Any, description: String? = null) = Assertion(
            path = path,
            matcher = MatcherType.EQUALS,
            value = value,
            description = description ?: "$path equals $value"
        )

        fun isType(path: String, type: FieldType, description: String? = null) = Assertion(
            path = path,
            matcher = MatcherType.IS_TYPE,
            value = type,
            description = description ?: "$path is ${type.name.lowercase()}"
        )

        fun oneOf(path: String, values: List<Any>, description: String? = null) = Assertion(
            path = path,
            matcher = MatcherType.ONE_OF,
            value = values,
            description = description ?: "$path is one of $values"
        )

        fun matchesPattern(path: String, pattern: String, description: String? = null) = Assertion(
            path = path,
            matcher = MatcherType.MATCHES_PATTERN,
            value = pattern,
            description = description ?: "$path matches pattern"
        )

        fun greaterThanOrEqual(path: String, value: Number, description: String? = null) = Assertion(
            path = path,
            matcher = MatcherType.GREATER_THAN_OR_EQUAL,
            value = value,
            description = description ?: "$path >= $value"
        )

        fun lessThanOrEqual(path: String, value: Number, description: String? = null) = Assertion(
            path = path,
            matcher = MatcherType.LESS_THAN_OR_EQUAL,
            value = value,
            description = description ?: "$path <= $value"
        )

        fun contains(path: String, value: String, description: String? = null) = Assertion(
            path = path,
            matcher = MatcherType.CONTAINS,
            value = value,
            description = description ?: "$path contains '$value'"
        )

        fun hasSize(path: String, size: Int, description: String? = null) = Assertion(
            path = path,
            matcher = MatcherType.HAS_SIZE,
            value = size,
            description = description ?: "$path has size $size"
        )

        fun hasMinLength(path: String, minLength: Int, description: String? = null) = Assertion(
            path = path,
            matcher = MatcherType.HAS_MIN_LENGTH,
            value = minLength,
            description = description ?: "$path has min length $minLength"
        )

        fun hasMaxLength(path: String, maxLength: Int, description: String? = null) = Assertion(
            path = path,
            matcher = MatcherType.HAS_MAX_LENGTH,
            value = maxLength,
            description = description ?: "$path has max length $maxLength"
        )

        fun notEmpty(path: String, description: String? = null) = Assertion(
            path = path,
            matcher = MatcherType.NOT_EMPTY,
            description = description ?: "$path is not empty"
        )

        fun hasKey(path: String, key: String, description: String? = null) = Assertion(
            path = path,
            matcher = MatcherType.HAS_KEY,
            value = key,
            description = description ?: "$path has key '$key'"
        )
    }
}

package com.pe4king.renderers.postman

/**
 * Postman Collection v2.1 data models.
 */

/**
 * Root collection structure.
 */
data class PostmanCollection(
    val info: PostmanInfo,
    val item: List<PostmanFolder>,
    val variable: List<PostmanVariable>,
    val auth: PostmanAuth? = null
)

/**
 * Collection metadata.
 */
data class PostmanInfo(
    val name: String,
    val description: String,
    val schema: String = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
)

/**
 * Folder (group) of requests.
 */
data class PostmanFolder(
    val name: String,
    val item: List<PostmanItem>
)

/**
 * Single request item.
 */
data class PostmanItem(
    val name: String,
    val request: PostmanRequest,
    val response: List<Any> = emptyList(),
    val event: List<PostmanEvent>? = null
)

/**
 * Request definition.
 */
data class PostmanRequest(
    val method: String,
    val header: List<PostmanHeader>,
    val url: PostmanUrl,
    val body: PostmanBody? = null
)

/**
 * URL definition.
 */
data class PostmanUrl(
    val raw: String,
    val host: List<String>,
    val path: List<String>,
    val variable: List<PostmanUrlVariable>? = null,
    val query: List<PostmanQueryParam>? = null
)

/**
 * URL path variable.
 */
data class PostmanUrlVariable(
    val key: String,
    val value: String
)

/**
 * Query parameter.
 */
data class PostmanQueryParam(
    val key: String,
    val value: String,
    val disabled: Boolean = false
)

/**
 * Request header.
 */
data class PostmanHeader(
    val key: String,
    val value: String,
    val type: String = "text"
)

/**
 * Request body.
 */
data class PostmanBody(
    val mode: String,
    val raw: String,
    val options: PostmanBodyOptions? = null
)

/**
 * Body options.
 */
data class PostmanBodyOptions(
    val raw: PostmanRawOptions
)

/**
 * Raw body options.
 */
data class PostmanRawOptions(
    val language: String = "json"
)

/**
 * Collection variable.
 */
data class PostmanVariable(
    val key: String,
    val value: String,
    val type: String = "string"
)

/**
 * Authentication config.
 */
data class PostmanAuth(
    val type: String,
    val bearer: List<PostmanAuthItem>? = null,
    val apikey: List<PostmanAuthItem>? = null
)

/**
 * Auth item.
 */
data class PostmanAuthItem(
    val key: String,
    val value: String,
    val type: String = "string"
)

/**
 * Event (script) definition.
 */
data class PostmanEvent(
    val listen: String,
    val script: PostmanScript
)

/**
 * Script definition.
 */
data class PostmanScript(
    val type: String = "text/javascript",
    val exec: List<String>
)

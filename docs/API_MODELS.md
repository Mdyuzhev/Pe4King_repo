# Pe4King API Models

## Core Models

### EndpointInfo
Represents an API endpoint extracted from OpenAPI spec.

```kotlin
data class EndpointInfo(
    val method: HttpMethod,
    val path: String,
    val summary: String?,
    val parameters: List<ParameterInfo>,
    val requestBody: SchemaField?,
    val responses: Map<String, SchemaField>
)
```

### SchemaField
JSON Schema field representation.

```kotlin
data class SchemaField(
    val name: String,
    val type: String,
    val format: String?,
    val required: Boolean,
    val enum: List<String>?,
    val children: List<SchemaField>
)
```

### ParameterInfo
Request parameter (path, query, header).

```kotlin
data class ParameterInfo(
    val name: String,
    val location: ParameterLocation,
    val type: String,
    val required: Boolean
)
```

## EVA Models

### OracleDepth

```kotlin
enum class OracleDepth(val level: Int, val score: Int) {
    L0(0, 0),    // No assertions
    L1(1, 10),   // Status code only
    L2(2, 25),   // Status + exists
    L3(3, 50),   // Top-level fields
    L4(4, 70),   // Nested fields
    L5(5, 85),   // Types/formats
    L6(6, 100)   // Business logic
}
```

### EvaGrade

```kotlin
enum class EvaGrade(val minScore: Int) {
    S(90), A(80), B(70), C(60), D(50), F(0)
}
```

### TestAnalysis

```kotlin
data class TestAnalysis(
    val name: String,
    val oracleDepth: OracleDepth,
    val assertionCount: Int,
    val assertions: List<AssertionInfo>,
    val issues: List<String>,
    val score: Int
)
```

## Collections Models

### SavedRequest
HTTP request saved in collection.

```kotlin
data class SavedRequest(
    val id: String,
    val name: String,
    val method: HttpMethod,
    val url: String,
    val headers: Map<String, String>,
    val body: String?,
    val testScript: String?
)
```

### Variable
Environment/collection variable.

```kotlin
data class Variable(
    val name: String,
    val value: String,
    val sensitive: Boolean = false
)
```

### TestSnippet
Reusable JS test snippet.

```kotlin
data class TestSnippet(
    val id: String,
    val name: String,
    val code: String,
    val description: String?
)
```

## JS Test API

```javascript
// Response object
response.status    // HTTP status code
response.body      // Parsed JSON
response.headers   // Headers object
response.time      // Response time (ms)

// Functions
test(name, condition)  // Assert condition
log(...args)           // Console output
```

## Author

Mikhail Dyuzhev

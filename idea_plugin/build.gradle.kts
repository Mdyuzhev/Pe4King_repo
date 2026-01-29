import java.util.Properties

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.21"
    id("org.jetbrains.intellij") version "1.16.1"
}

group = "com.pe4king"
version = providers.gradleProperty("pluginVersion").get()

repositories {
    mavenCentral()
}

dependencies {
    // JSON/YAML parsing
    implementation("com.fasterxml.jackson.core:jackson-databind:2.16.0")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.16.0")
    implementation("com.fasterxml.jackson.dataformat:jackson-dataformat-yaml:2.16.0")

    // OpenAPI parser
    implementation("io.swagger.parser.v3:swagger-parser:2.1.19") {
        exclude(group = "io.swagger", module = "swagger-core")
        exclude(group = "io.swagger", module = "swagger-models")
        exclude(group = "io.swagger", module = "swagger-annotations")
        exclude(group = "io.swagger", module = "swagger-compat-spec-parser")
        exclude(group = "io.swagger", module = "swagger-parser")
    }

    // JSONPath
    implementation("com.jayway.jsonpath:json-path:2.9.0")

    // HTTP client
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // GraalJS for JavaScript test scripts
    implementation("org.graalvm.js:js:23.0.2")
    implementation("org.graalvm.js:js-scriptengine:23.0.2")

    // PDF generation for EVA reports
    implementation("com.github.librepdf:openpdf:1.3.30")

    // Excel generation for TestIT export
    implementation("org.apache.poi:poi-ooxml:5.2.5")

    // Testing
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.1")
    testImplementation("org.assertj:assertj-core:3.25.1")
}

intellij {
    version.set("2023.3")
    type.set("IC") // IntelliJ Community
}

// Auto-increment patch version and rebuild
val release by tasks.registering {
    group = "build"
    description = "Increment version and build plugin"

    doLast {
        // 1. Increment version
        val propsFile = file("gradle.properties")
        val props = Properties()
        propsFile.inputStream().use { props.load(it) }

        val currentVersion = props.getProperty("pluginVersion")
        val parts = currentVersion.split(".")
        val major = parts[0]
        val minor = parts[1]
        val patch = parts[2].toInt() + 1
        val newVersion = "$major.$minor.$patch"

        props.setProperty("pluginVersion", newVersion)
        propsFile.outputStream().use { props.store(it, null) }

        println("Version: $currentVersion → $newVersion")

        // 2. Rebuild with new version (separate Gradle invocation)
        exec {
            workingDir = projectDir
            if (System.getProperty("os.name").lowercase().contains("win")) {
                commandLine("cmd", "/c", "${projectDir}/gradlew.bat", "clean", "buildPlugin")
            } else {
                commandLine("${projectDir}/gradlew", "clean", "buildPlugin")
            }
        }

        // 3. Copy to root
        val distDir = file("build/distributions")
        val zipFile = distDir.listFiles()?.find { it.extension == "zip" }
        zipFile?.copyTo(file("pe4king-idea-$newVersion.zip"), overwrite = true)

        println("✅ Built: pe4king-idea-$newVersion.zip")
    }
}

tasks {
    withType<JavaCompile> {
        sourceCompatibility = "17"
        targetCompatibility = "17"
    }

    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        kotlinOptions.jvmTarget = "17"
    }

    patchPluginXml {
        version.set(providers.gradleProperty("pluginVersion"))
        sinceBuild.set(providers.gradleProperty("pluginSinceBuild"))
        untilBuild.set(providers.gradleProperty("pluginUntilBuild"))
    }

    test {
        useJUnitPlatform()
    }

    buildSearchableOptions {
        enabled = false
    }
}

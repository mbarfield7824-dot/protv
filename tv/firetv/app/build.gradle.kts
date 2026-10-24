import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val apiBaseUrl = providers.gradleProperty("protvApiBaseUrl")
    .orElse(providers.environmentVariable("PROTV_TV_API_BASE_URL"))
    .orNull?.trim().orEmpty()

if (apiBaseUrl.isNotEmpty()) {
    val uri = URI(apiBaseUrl)
    require(uri.scheme in listOf("http", "https") && !uri.host.isNullOrBlank()
        && uri.userInfo == null && uri.query == null && uri.fragment == null) {
        "protvApiBaseUrl must be an HTTP(S) base URL without credentials, query or fragment"
    }
}
val normalizedApiBaseUrl = if (apiBaseUrl.isEmpty()) "" else "${apiBaseUrl.trimEnd('/')}/"
fun buildConfigString(value: String) = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

data class FirebaseConfig(val apiKey: String, val applicationId: String, val projectId: String)

val firebaseConfigFile = project.file("google-services.json")
val googleServicesFirebaseConfig = if (firebaseConfigFile.isFile) {
    val config = groovy.json.JsonSlurper().parse(firebaseConfigFile) as? Map<*, *>
        ?: error("google-services.json must contain a JSON object")
    val projectInfo = config["project_info"] as? Map<*, *>
        ?: error("google-services.json is missing project_info")
    val matchingClients = (config["client"] as? List<*>)
        .orEmpty()
        .mapNotNull { it as? Map<*, *> }
        .filter { client ->
            val clientInfo = client["client_info"] as? Map<*, *>
            val androidInfo = clientInfo?.get("android_client_info") as? Map<*, *>
            androidInfo?.get("package_name") == "com.protv.firetv"
        }
    require(matchingClients.size == 1) {
        "google-services.json must contain exactly one Android client for com.protv.firetv"
    }
    val clientInfo = matchingClients.single()["client_info"] as? Map<*, *>
        ?: error("google-services.json Android client is missing client_info")
    val appId = clientInfo["mobilesdk_app_id"] as? String
        ?: error("google-services.json Android client is missing mobilesdk_app_id")
    val apiKey = (matchingClients.single()["api_key"] as? List<*>)
        .orEmpty()
        .mapNotNull { it as? Map<*, *> }
        .firstNotNullOfOrNull { it["current_key"] as? String }
        ?: error("google-services.json Android client is missing its API key")
    val projectId = projectInfo["project_id"] as? String
        ?: error("google-services.json is missing project_info.project_id")
    require(apiKey.isNotBlank() && appId.isNotBlank() && projectId.isNotBlank()) {
        "google-services.json has blank Firebase configuration values"
    }
    FirebaseConfig(apiKey, appId, projectId)
} else {
    null
}

fun frontendFirebaseValue(key: String): String {
    val environmentFile = rootProject.file("../../frontend/.env")
    if (!environmentFile.isFile) return ""
    val prefix = "$key="
    return environmentFile.useLines { lines ->
        lines.firstOrNull { it.trimStart().startsWith(prefix) }
            ?.trim()
            ?.removePrefix(prefix)
            ?.trim()
            ?.removeSurrounding("\"")
            ?.removeSurrounding("'")
            .orEmpty()
    }
}

fun configuredValue(
    property: String,
    environmentVariable: String,
    frontendEnvironmentKey: String? = null,
): String =
    providers.gradleProperty(property)
        .orElse(providers.environmentVariable(environmentVariable))
        .orElse(providers.provider {
            when (property) {
                "protvFirebaseApiKey" -> googleServicesFirebaseConfig?.apiKey
                "protvFirebaseApplicationId" -> googleServicesFirebaseConfig?.applicationId
                "protvFirebaseProjectId" -> googleServicesFirebaseConfig?.projectId
                else -> null
            }.orEmpty()
        })
        .orElse(providers.provider { frontendEnvironmentKey?.let(::frontendFirebaseValue).orEmpty() })
        .orNull?.trim().orEmpty()

val firebaseApiKey = configuredValue(
    "protvFirebaseApiKey",
    "PROTV_FIREBASE_API_KEY",
    "VITE_FIREBASE_API_KEY",
)
val firebaseApplicationId = configuredValue("protvFirebaseApplicationId", "PROTV_FIREBASE_APPLICATION_ID")
val firebaseProjectId = configuredValue(
    "protvFirebaseProjectId",
    "PROTV_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_PROJECT_ID",
)

val releaseSigningProperties = mapOf(
    "PROTV_RELEASE_KEYSTORE_PATH" to providers.environmentVariable("PROTV_RELEASE_KEYSTORE_PATH").orNull,
    "PROTV_RELEASE_KEYSTORE_PASSWORD" to providers.environmentVariable("PROTV_RELEASE_KEYSTORE_PASSWORD").orNull,
    "PROTV_RELEASE_KEY_ALIAS" to providers.environmentVariable("PROTV_RELEASE_KEY_ALIAS").orNull,
    "PROTV_RELEASE_KEY_PASSWORD" to providers.environmentVariable("PROTV_RELEASE_KEY_PASSWORD").orNull,
)
val releaseSigningConfigured = releaseSigningProperties.values.count { !it.isNullOrBlank() }
require(releaseSigningConfigured == 0 || releaseSigningConfigured == releaseSigningProperties.size) {
    "Configure all four PROTV_RELEASE_* signing environment variables or none."
}
val releaseKeyFile = if (releaseSigningConfigured == releaseSigningProperties.size) {
    val keyFile = file(requireNotNull(releaseSigningProperties["PROTV_RELEASE_KEYSTORE_PATH"]))
        .canonicalFile
    val repositoryRoot = rootProject.projectDir.resolve("../..").canonicalFile
    require(!keyFile.path.startsWith("${repositoryRoot.path}${File.separator}", ignoreCase = true)) {
        "The production keystore must be stored outside the repository."
    }
    require(keyFile.isFile) { "The configured production keystore file does not exist." }
    keyFile
} else {
    null
}

android {
    namespace = "com.protv.firetv"
    compileSdk = 37

    signingConfigs {
        if (releaseKeyFile != null) {
            create("production") {
                storeFile = releaseKeyFile
                storePassword = releaseSigningProperties.getValue("PROTV_RELEASE_KEYSTORE_PASSWORD")
                keyAlias = releaseSigningProperties.getValue("PROTV_RELEASE_KEY_ALIAS")
                keyPassword = releaseSigningProperties.getValue("PROTV_RELEASE_KEY_PASSWORD")
            }
        }
    }

    defaultConfig {
        applicationId = "com.protv.firetv"
        minSdk = 23
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0-rc1"
        buildConfigField("String", "FIREBASE_API_KEY", buildConfigString(firebaseApiKey))
        buildConfigField("String", "FIREBASE_APPLICATION_ID", buildConfigString(firebaseApplicationId))
        buildConfigField("String", "FIREBASE_PROJECT_ID", buildConfigString(firebaseProjectId))
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    buildTypes {
        getByName("debug") {
            buildConfigField("String", "API_BASE_URL", buildConfigString(normalizedApiBaseUrl))
        }
        getByName("release") {
            buildConfigField(
                "String", "API_BASE_URL",
                buildConfigString(normalizedApiBaseUrl.takeIf { it.startsWith("https://") }.orEmpty()),
            )
            if (releaseKeyFile != null) {
                signingConfig = signingConfigs.getByName("production")
            }
        }
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    implementation(platform("androidx.compose:compose-bom:2026.09.00"))
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.tv:tv-material:1.1.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-kotlinx-serialization:2.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("androidx.media3:media3-exoplayer:1.11.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.11.1")
    implementation("androidx.media3:media3-ui:1.11.1")
    implementation("com.google.firebase:firebase-auth:24.0.1")
    implementation("com.google.zxing:core:3.5.3")

    testImplementation("junit:junit:4.13.2")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}

tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    doFirst {
        require(normalizedApiBaseUrl.startsWith("https://")) {
            "Release builds require an HTTPS protvApiBaseUrl (or PROTV_TV_API_BASE_URL)"
        }
    }
}

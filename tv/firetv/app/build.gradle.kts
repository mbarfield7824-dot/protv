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

android {
    namespace = "com.protv.firetv"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.protv.firetv"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
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
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
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

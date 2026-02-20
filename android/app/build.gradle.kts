import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.gms.google-services")
}

android {
    namespace = "com.taskmanager.mobile"
    compileSdk = 34

    val dotEnvProps = Properties().apply {
        val envFiles = listOf(
            rootDir.parentFile?.resolve(".env"),
            rootProject.file(".env")
        )

        envFiles.filterNotNull().forEach { envFile ->
            if (envFile.exists()) {
                envFile.inputStream().use { load(it) }
            }
        }
    }

    val localProps = Properties().apply {
        val propsFile = rootProject.file("local.properties")
        if (propsFile.exists()) {
            propsFile.inputStream().use { load(it) }
        }
    }

    defaultConfig {
        applicationId = "com.taskmanager.mobile"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        val apiBaseUrl = (project.findProperty("ANDROID_API_BASE_URL") as String?)
            ?: (localProps.getProperty("ANDROID_API_BASE_URL"))
            ?: (dotEnvProps.getProperty("ANDROID_API_BASE_URL"))
            ?: System.getenv("ANDROID_API_BASE_URL")
            ?: "http://10.0.2.2:8000"
        val oneSignalAppId = (project.findProperty("ONESIGNAL_APP_ID") as String?)
            ?: (localProps.getProperty("ONESIGNAL_APP_ID"))
            ?: (dotEnvProps.getProperty("ONESIGNAL_APP_ID"))
            ?: System.getenv("ONESIGNAL_APP_ID")
            ?: ""
        val apiToken = (project.findProperty("ANDROID_API_TOKEN") as String?)
            ?: (localProps.getProperty("ANDROID_API_TOKEN"))
            ?: (dotEnvProps.getProperty("ANDROID_API_TOKEN"))
            ?: System.getenv("ANDROID_API_TOKEN")
            ?: ""

        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        buildConfigField("String", "ONESIGNAL_APP_ID", "\"$oneSignalAppId\"")
        buildConfigField("String", "API_TOKEN", "\"$apiToken\"")
        manifestPlaceholders["onesignal_app_id"] = oneSignalAppId

        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.09.02"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.navigation:navigation-compose:2.8.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
    implementation(platform("com.google.firebase:firebase-bom:34.9.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("com.onesignal:OneSignal:5.1.21")

    debugImplementation("androidx.compose.ui:ui-tooling")
}

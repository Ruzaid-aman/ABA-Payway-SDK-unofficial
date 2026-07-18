# ProGuard rules for ABAPayWay SDK

# Keep all SDK classes
-keep class com.ababank.payway.** { *; }

# Keep PayWayError subclasses
-keep class com.ababank.payway.error.PayWayError { *; }
-keepclassmembers class com.ababank.payway.error.PayWayError { *; }

# Keep model classes (Parcelable)
-keep class com.ababank.payway.model.** { *; }

# Keep callback interfaces
-keep interface com.ababank.payway.ui.PaymentSheetFragment$PaymentSheetCallback { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# Gson
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# ZXing
-keep class com.google.zxing.** { *; }
-dontwarn com.google.zxing.**

# AndroidX
-keep class androidx.** { *; }
-dontwarn androidx.**

# Kotlin Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}
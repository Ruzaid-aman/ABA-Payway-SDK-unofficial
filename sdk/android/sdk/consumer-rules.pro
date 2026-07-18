# Consumer ProGuard rules for ABAPayWay SDK
# These rules are applied to apps that consume this library.

# Keep the SDK's public API
-keep class com.ababank.payway.** { *; }
-keep interface com.ababank.payway.** { *; }

# Error Prone's compile-time annotations reference the JDK language model,
# which is absent from Android and is never used by instrumentation at runtime.
-dontwarn javax.lang.model.element.Modifier

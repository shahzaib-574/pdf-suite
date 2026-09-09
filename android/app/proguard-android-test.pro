# Error Prone's compile-time annotations reference the JDK language model,
# which is absent from Android and is never used by instrumentation at runtime.
-dontwarn javax.lang.model.element.Modifier

# AndroidX Test includes an optional ViewCapture coroutine adapter. These tests
# capture the framebuffer through UiAutomation and never call ViewCapture.
# Keep the test-only warning scoped to that unused adapter; leave the app's
# production dependency versions and shrinking rules unchanged.
-dontwarn androidx.concurrent.futures.SuspendToFutureAdapter

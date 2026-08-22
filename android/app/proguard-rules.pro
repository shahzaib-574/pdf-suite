# Keep useful crash line numbers while allowing R8 to optimize implementation code.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Locally registered Capacitor plugins expose their bridge methods through runtime annotations.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.PluginMethod public <methods>;
}

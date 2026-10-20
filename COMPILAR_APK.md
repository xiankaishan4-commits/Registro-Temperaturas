# Obtener el APK real

El ZIP es **código fuente**, NO es un APK. Para fabricar el fichero instalable se necesita Android SDK, Android Gradle Plugin y Gradle, descargables durante la compilación.

## Método 1 — GitHub Actions (sin instalar Android Studio)

1. Crear un repositorio **privado** en GitHub y subir **todo el contenido** de esta carpeta (incluida `.github/workflows/build-android-apk.yml`). No subir datos reales de temperaturas ni fotografías.
2. Entrar en `Actions → Generar APK Android → Run workflow` o esperar a que se ejecute tras subir el proyecto a la rama `main`.
3. Tras una ejecución con estado verde, descargar el artefacto **Registro_Temperaturas_APK** en la página de la ejecución.
4. Descomprimir el artefacto para obtener `app-debug.apk` e instalarlo en Android.

Este archivo es una **compilación de depuración** firmada con la clave de depuración de GitHub Actions. Para publicar actualizaciones de la misma aplicación de forma estable, usar una firma privada de lanzamiento (`release`) consistente; de otro modo, las instalaciones con distintas firmas no se actualizan in situ. Antes de sustituir una instalación, **exportar el ZIP completo de los registros**.

## Método 2 — Android Studio en Windows

1. Instalar Android Studio desde el sitio oficial de Android Developers y habilitar Android SDK Platform 35 + SDK Build Tools 35.0.0.
2. Abrir esta carpeta como proyecto Gradle.
3. Sincronizar y elegir `Build → Build APK(s)`.
4. Obtener `app/build/outputs/apk/debug/app-debug.apk`.

## Comprobaciones antes de usar en la tienda

- Abrir en Android 10 o superior sin conexión y añadir un equipo.
- Tomar una foto real, escribir temperatura y guardar registro. Cerrar y abrir la app para verificar que persiste.
- Exportar ZIP, guardarlo fuera del móvil, extraerlo en el PC y confirmar que contiene `registro.json` y fotos.
- Importar una copia de prueba en otro móvil y comprobar fotos e historial.
- Registrar incidencia fuera de rango; probar la recuperación tras reinicio.

**Atención:** la aplicación no tiene permiso de Internet y no transfiere datos automáticamente. Desinstalarla o borrar sus datos locales elimina los registros; las copias externas son obligatorias para evitar pérdida. La copia ZIP no está cifrada.

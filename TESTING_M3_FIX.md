# Registro de Temperaturas — compatibilidad y copias ZIP

## Cambios

- La versión Material 3 usa una base nueva fija `ShanTemperaturasDB` y detecta la base antigua `shanfood_temperaturas_offline` sin borrar ni alterar las tablas originales.
- Importa equipos (incluidos los inactivos), lecturas y fotos `Blob` originales a los nuevos registros con fotos de tipo `data:`.
- Una migración ya realizada no vuelve a crear duplicados. Los errores de almacenamiento detienen la migración sin borrar la base de origen.
- Exportación ZIP Android mediante **`AndroidBridge.begin/append/finish`**, no el inexistente `window.Android.saveBackupZip`.
- Los botones **Exportar ZIP** y **Compartir ZIP / Google Drive** utilizan la misma copia; Android muestra un selector para guardar o compartir. La aplicación no puede confirmar por sí sola que el archivo finalmente se guardó en Google Drive.
- Importación de dos formatos ZIP: `backup_datos.json` (M3) y `registro.json` + `fotos/ID.jpg` (APK antiguo). Comprobación CRC de cada archivo. Importación sin borrar ni sobrescribir registros existentes; se agrega solo información con ID nuevo.
- Se requiere foto al registrar una temperatura nueva y medida correctora si la temperatura está fuera de rango. Se impide eliminar registros históricos desde la interfaz, y se impide eliminar un equipo que tenga historial; se puede desactivar en su lugar.

## Pruebas ejecutadas

Simulación del navegador Chromium con objetos IndexedDB de prueba y un mock de `AndroidBridge`:

1. Migración de `devices`, `records`, `photos` originales.
2. Fotos JPEG recuperadas como datos visualizables.
3. Equipos inactivos excluidos del resumen diario.
4. Base IndexedDB original preservada.
5. ZIP exportado con CRC válido, verificado también mediante Python `zipfile`.
6. Reimportación de una copia existente sin sobrescribir.
7. Importación de copia antigua con fotos separadas.
8. Rechazo de ZIP dañado por CRC sin perder registros.
9. Foto obligatoria para nuevas lecturas.
10. Observación correctora obligatoria al salir del rango.
11. Alta de lectura y conservación de su información.
12. Llamadas AndroidBridge de guardado y de compartir verificadas; datos ZIP válidos.
13. Sin excepciones JS en los casos simulados.

También se ha comprobado sintaxis JavaScript con `node --check`.

### Límites de la validación

- La simulación IndexedDB **no es una prueba sobre un teléfono real** ni un ensayo con datos históricos reales.
- La copia de fotos a la base M3 necesita espacio de almacenamiento adicional; antes de actualizar un dispositivo con registros reales, exporte y conserve una copia ZIP de la versión anterior.
- La instalación, cámara, almacenamiento con miles de imágenes, el selector de Android y la subida efectiva a Google Drive requieren pruebas en el teléfono.
- Una compilación APK exitosa no equivale a pruebas end-to-end en Android.
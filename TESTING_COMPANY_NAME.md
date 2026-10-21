# v1.5.0 — Nombre de la empresa

## Uso y compatibilidad
- **Equipos → Empresa → Nombre de la empresa → Guardar nombre**. Nombre local, editable en cualquier momento, de 1 a 120 caracteres. Sin configurar se muestra «Mi empresa».
- La cabecera, el título de la aplicación, el PDF y el Excel usan el último nombre guardado.
- ZIP y JSON conservan `format: SHANFOODSGROUP_M3`, `version: 2`, equipos, registros y fotos. Se añade únicamente `settings.companyName`, opcional para lectores anteriores.
- Restaurar una copia con nombre lo muestra en la confirmación y sustituye el nombre local. Copias antiguas sin nombre y copias sin configurar conservan el nombre local. Cancelar no cambia nada.
- Se mantienen applicationId, firma permanente, origen WebView y bases IndexedDB. Android 1.5.0 / versionCode 9 permite actualizar la versión anterior con la misma firma.

## Pruebas automatizadas
- `node tests/test_company_settings.cjs`: validación, persistencia, cambio de nombre, texto sin interpretar HTML, error de almacenamiento, ZIP/JSON, fotos, campos de auditoría, copias antiguas, cancelación, metadatos inválidos, duplicados y transacción fallida.
- `node tests/test_records_core.cjs`: reglas de registros existentes.
- `node tests/test_report_core.cjs`: nombre personalizado y predeterminado en el transporte PDF, fotos y fechas.
- `node tests/test_excel_core.cjs`: nombre en autor y resumen del archivo XLSX, además de fechas y formato existentes.
- `python3 -m unittest discover -s tests -v`: estructura, puente Android, datos antiguos, versión y firma.

## Comprobación en Android
1. Actualizar desde el APK anterior firmado con el mismo certificado, sin desinstalar. Revisar equipos, registros y fotos.
2. Guardar el nombre en Equipos, cerrar completamente y abrir de nuevo. Modificar y volver a guardar.
3. Exportar ZIP y JSON, cambiar el nombre, restaurar cada copia y comprobar nombre, registros y fotos. Cancelar una restauración y comprobar que no cambia nada.
4. Restaurar una copia antigua sin `settings` y comprobar que conserva el nombre actual.
5. Exportar PDF con fotos y Excel; comprobar el nombre y las mediciones. Probar nombre largo y acentos.
6. Confirmar en GitHub Actions que la compilación release y la verificación del certificado permanente terminan correctamente.

La prueba de navegador usa los mismos HTML/JS e IndexedDB; cámara, selector de archivos del sistema y renderizado PDF nativo requieren un dispositivo Android.

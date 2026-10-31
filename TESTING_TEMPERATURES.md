# Validación v1.6.1

## Pruebas automatizadas

El workflow de APK ejecuta los tests antes de compilar y verificar la firma:

```sh
node --check app/src/main/assets/app.js
node --check app/src/main/assets/records-core.js
node tests/test_company_settings.cjs
node tests/test_records_core.cjs
node tests/test_updates.cjs
node tests/test_report_core.cjs
node tests/test_excel_core.cjs
python3 -m unittest discover -s tests -v
```

ExcelJS se descarga con la misma versión 4.4.0 del workflow y se integra en el APK para uso offline. Para el test de interfaz:

```sh
npm install --no-save --no-package-lock playwright@1.56.1
npx playwright install chromium
node tests/test_temperature_app.cjs
```

También se puede usar Chrome instalado mediante `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. El test sirve los assets originales en localhost, usa perfiles temporales y una base IndexedDB real. No necesita ni modifica datos del teléfono. Opcionalmente `RT_SCREENSHOT_DIR` guarda capturas de la alerta roja y de Ajustes.

Cobertura:

- Las cinco categorías, cambios reiterados sin modificar límites, equipos independientes, coma/punto, signo Unicode, mínimos/máximos decimales y rechazo de límites invertidos.
- Base existente con versión 7 y migración de la base antigua separada con fotografías Blob, sin borrar registros ni configuración de empresa.
- Responsable obligatorio, foto obligatoria en mediciones actuales y anteriores; Acción correctiva vacía permite guardar una lectura fuera de rango sin cambiar su valor.
- Alerta visible y fondo rojo comprobado; AHT 01 a las 09:00 −19,2 y a las 21:00 −17,5 del mismo día conservan IDs, fotos, responsable, fechas, horas y límites propios.
- Lecturas calientes por encima de 100 °C, escritura abortada sin borrar el formulario y reintento correcto.
- Cambiar después los límites de AHT no altera la alerta guardada ni otro equipo; corrección adicional enlazada, original intacto, fotografía y límites originales conservados.
- Descarga real de copia ZIP y restauración en perfil nuevo, equivalencia de los campos existentes, fotografías y empresa; importar dos veces no duplica ni reemplaza; JSON antiguo sin empresa/foto/responsable compatible; ZIP corrupto no escribe; recarga conserva datos.
- Adición posterior de acción: escritura abortada y reintento, original idéntico, autor y auditoría, conservación completa en copia y restauración. Valores bajo/sobre el rango y ambos límites exactos.
- Actualizaciones: comparación numérica (1.10 > 1.9), igual/anterior, APK ausente, HTTP 403, respuesta inválida, desconexión, fallo nativo, espera agotada, respuesta tardía ignorada y reintento. Ninguna consulta modifica la base.
- Publicación: rechazo de APK distinto para una versión publicada, commit ajeno o versión inferior a un Release existente.
- Tests unitarios existentes de PDF, Excel, CSV, correcciones, empresa, cancelación, transacción fallida de restauración y firma permanente.

## Verificación en Android real pendiente

La prueba Chromium no certifica el comportamiento del selector de cámara, la galería, el almacenamiento y el menú de compartir de cada fabricante. En un teléfono con la versión anterior y copia ZIP verificada:

1. Instalar el APK firmado como actualización, comprobar que conserva empresa, equipos, historial y fotos.
2. Tomar fotos desde la cámara y seleccionarlas desde la galería; guardar dos mediciones por dispositivo en el mismo día, una con alerta y sin acción correctiva; añadir la acción después desde Historial y revisar la auditoría.
3. Cerrar y abrir la app; comprobar historial, fotos y empresa.
4. Guardar y compartir ZIP con el selector de archivos/Google Drive de Android; restaurar la copia y comprobar que conserva los datos anteriores sin duplicados.
5. Ajustes: verificar la versión; buscar con conexión, abrir enlace externo cuando haya nueva versión y repetir sin conexión. No se instala automáticamente.
6. Abrir los informes PDF con foto, CSV y Excel exportados.

No se debe desinstalar la aplicación para actualizar. Los límites históricos que no existían en versiones anteriores no se inventan. Las copias mantienen el formato v2 y los campos nuevos son aditivos.

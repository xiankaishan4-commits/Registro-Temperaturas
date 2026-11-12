# Registro de Limpieza — desarrollo y Beta

Rama: `feature/registro-limpieza-local`. Base: v1.6.1 / 14eec4815be17f0a087cb5eee112aee268b10fb4.
Versión Beta: 1.7.0-beta.3, versionCode 14. El workflow independiente release-cleaning-beta.yml publica solo un prerelease desde esta rama, con la firma permanente, sin modificar main ni el Release estable.

## Funciones

Abrir Limpieza en la barra inferior, entre Informes y Ajustes, o usar el acceso Registro de Limpieza en Inicio.
En Ajustes se puede elegir el canal oficial o Beta antes de buscar actualizaciones. Se recuerda la selección; la descarga se abre en el navegador.
La administración permite crear áreas diarias con Mañana 09:00 y Noche 21:00, cambiar nombres y horas de turnos y crear tareas diarias, semanales, mensuales o cada N días.
Cada tarea se confirma por separado. Persona puede escribirse o elegirse entre los nombres anteriores. Fecha/hora reales se capturan al guardar; una tarea atrasada conserva su fecha prevista y registra la fecha real de cumplimiento.
Las tareas periódicas atrasadas permanecen visibles. Historial filtra por fechas, área, persona, turno y estado.

Los cambios de plan y la eliminación lógica son efectivos al día siguiente. Las revisiones anteriores no se borran. Si un día mensual (p. ej. 31) no existe, vence el último día de ese mes. Cada N días se calcula desde la fecha de referencia, sin desplazarse al completar tarde.

## Datos y compatibilidad

Mismo paquete, origen WebView y base `ShanTemperaturasDB`. La apertura conserva la versión existente y solo incrementa el esquema para añadir `limpiezaPlanes` y `limpiezaEventos` si faltan; no modifica las tablas `equipos` ni `registros`.
Planes y eventos son aditivos. El ID de una ocurrencia contiene revisión, fecha prevista y turno. La confirmación usa un ID determinista para impedir doble guardado del mismo control.
Pendientes se reconstruyen de los planes históricos inmutables, aunque la app haya permanecido cerrada. No dependen de alarmas ni de que un empleado abra el formulario. El siguiente ciclo nunca borra el anterior. No se inventan tareas anteriores a la creación del plan.

ZIP/JSON mantiene formato v2 con un campo opcional `limpieza` (schema 1). Restauración valida antes de escribir y mezcla las cuatro tablas en una transacción. Los IDs existentes se conservan. Una copia antigua sin `limpieza` conserva los datos de limpieza locales. Una app antigua no entiende el nuevo campo: no usar una app antigua para volver a exportar la única copia de limpieza.

## Informes offline

Excel incluye Resumen de Limpieza y Registros Detallados. Realizado se marca verde y Pendiente rojo. PDF incluye empresa, fecha prevista, turno, persona, estado, finalización real y notas, con texto ajustado y paginación. Bibliotecas y fuente se incluyen localmente.
Desde/Hasta acepta intervalos entre meses/años; nunca incorpora fechas futuras. Un límite de 50.000 controles por consulta evita agotar memoria; se informa del límite sin truncar silenciosamente. Las exportaciones incluyen ambos estados del rango, área, persona y turno seleccionados, independientemente del filtro visual de estado.

## Pruebas y compilación

Dependencias: Node, Python, ExcelJS 4.4.0 en `app/src/main/assets/vendor/exceljs.min.js` (como el workflow existente), Playwright y Chromium; para Android, JDK 17, Gradle 8.9 y SDK 35.
`scripts/test-local.ps1` ejecuta pruebas existentes y nuevas. `NODE_PATH` puede apuntar a Playwright instalado y `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` a Chrome local.
`RT_CLEANING_OUTPUT` permite guardar informes y capturas de prueba fuera del repositorio.
Para Debug, configurar `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_USER_HOME` y `GRADLE_USER_HOME` en directorios locales de desarrollo; ejecutar `gradle --no-daemon :app:assembleDebug`.
La firma Debug se genera localmente en ANDROID_USER_HOME. No necesita ni usa secretos de firma de producción. No se debe publicar el APK Debug.

## Límites de la validación

Las pruebas de Chromium usan IndexedDB real y perfiles temporales. Verifican migración desde datos antiguos, persistencia, turnos independientes, transacciones abortadas, planes modificados/eliminados, pendientes sin intervención, informes de varios meses, ZIP nuevo/antiguo y deduplicación.
No equivalen a pruebas físicas de cámara, notificaciones o selector de archivos de Android. No se ha instalado en un teléfono con datos de producción.
El Debug tiene el mismo paquete pero otra firma: no puede sustituir la instalación de producción. Usarlo solo en un emulador o dispositivo de prueba sin esa instalación. No desinstalar la aplicación de producción para probarlo.
La Beta usa la firma permanente existente y permite actualización sobre v1.6.1. La instalación física debe validarse primero en un dispositivo de ensayo. La configuración de firma permanente no ha cambiado.

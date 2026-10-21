# SHANFOODSGROUP – Registro de Temperaturas (Android APK)

## 产品类型
这不是 PWA 安装包：**这是用于生成真正 `.apk` 文件的 Android Studio 项目源码**。应用内置 HTML/CSS/JS，离线运行，**没有网络权限，不需要云端数据库**。

## 构建 APK（Windows Android Studio 或 GitHub Actions）

已添加 `.github/workflows/build-android-apk.yml`，可利用 GitHub 的云端 Android 构建环境编译，无须本机下载 SDK。参见 `COMPILAR_APK.md`。

注意：本对话运行环境未安装 Android SDK，且无法联网下载，因此这里没有生成真实 APK。构建工作流尚未实测。

## 方法二：本机 Android Studio
1. 在 Windows 安装 Android Studio（首次安装会下载 Android SDK 和 Gradle）。
2. 用 Android Studio 打开解压后的 `Registro_Temperaturas_Android_APK_Proyecto` 项目文件夹。
3. 等待 `Gradle Sync` 完成。采用 Android Gradle Plugin 8.7.3、Java 17、Android SDK 35。
4. 选择 **Build → Build Bundle(s) / APK(s) → Build APK(s)**。
5. 输出文件：`app/build/outputs/apk/debug/app-debug.apk`。
6. 将 APK 发给 Android 手机，允许安装来自该文件管理器的应用后安装。

本项目尚未在 Android Studio 环境实际编译签名，请在投入正式使用前在真实设备上确认拍照、保存、备份、恢复功能。

## 操作
- 首次打开：设备 → 添加冷柜/冰柜及允许范围。
- 每天：记录 → 选择设备 → 输入温度、记录人、拍照。
- 数据全部保存在**手机的 Android WebView IndexedDB** 中；无需网络。
- 备份：Copias → Descargar copia ZIP；Android 弹出系统保存位置选择框，可选择本机或 Google Drive 文档提供程序。
- 分享：Copias → Compartir/Guardar en Drive；Android 调出系统分享菜单，可直接选择 Google Drive。
- 恢复：Copias → 选择备份 ZIP → 导入；会**覆盖所有原有记录**。

## 风险和限制
- **卸载 App 或清除 App 数据会删除全部本地记录及照片！** 定期（建议每日）将 ZIP 上传 Google Drive 或复制到电脑。
- CSV 不包含照片，ZIP 包含全部照片。ZIP 未加密，控制备份文件的访问权限。
- 导出/分享需要足够的手机临时存储空间。大 ZIP 可能占用较多内存，建议按日/周导出。
- 当前手机相机在照片选择器中出现；拍照后文件可能在系统相册里留有副本。
- 安卓手机系统时间不是可信审计时间；该版本不防篡改、无服务器校验；正式 HACCP/卫生稽查取证应按适用规则保存验证记录。
- 最低 Android 10 (API 29)。未上传 Google Play；调试 APK 不适合公开分发。
- 未内置自动上传 Google Drive。上传是通过 Android 系统的保存/分享流程由用户手动操作。
- 仅限一个手机作为主存储，没有多手机自动同步；更换手机须手动转移 ZIP。

## 文件
- `app/src/main/assets` – 离线 HTML/CSS/JS 和图标
- `app/src/main/java` – Android 原生 WebView、拍照文件选择器、备份保存/分享桥接器
- `app/src/main/AndroidManifest.xml` – Android 配置（没有 INTERNET 权限）
- `app/build.gradle` – Android 构建配置

## v1.2.0-dev — Informe y control no realizado
- Se conservan los datos antiguos de IndexedDB, las fotografías y la copia `backup_datos.json`.
- Las anotaciones fuera de plazo declaran la hora **real** de medición y guardan por separado `recordedAt`; no es lícito inventar lecturas históricas.
- Las comprobaciones omitidas constan sin temperatura ni hora de medición. Una medición posterior se registra como una lectura nueva.
- Las correcciones nunca sobreescriben ni borran el original; enlazan con `supersedesId`, y la copia ZIP guarda ambas versiones.
- Exportaciones CSV/PDF: equipo, fecha real, hora real, temperatura, responsable. No se imprimen etiquetas internas de corrección/registro tardío en el informe, pero el fichero ZIP guarda la trazabilidad. El PDF no incluye fotos; estas se conservan dentro del ZIP.
- Controles pendientes anteriores: se enumeran hasta los últimos siete días **a partir de la primera ejecución de esta versión**, sin asumir omisiones previas desconocidas.
- El proyecto no modifica la firma de instalación: los APK debug compilados con claves diferentes **NO** se pueden instalar como actualización sobre una versión previa. Antes de cambiar de APK, exporte y verifique el ZIP de respaldo. Para actualizaciones fiables configure una clave de firma privada permanente fuera del repositorio público.
- Este código y APK de prueba deben probarse en móvil real. No hay verificación de horario independiente del reloj del móvil ni auditoría a prueba de manipulaciones.


## APK firmado y actualizaciones

Las compilaciones de producción utilizan una única firma persistente (PKCS12). Configure los cuatro GitHub Actions Secrets siguiendo [SIGNING_SETUP.md](SIGNING_SETUP.md). El APK resultante se crea mediante `assembleRelease` y comprueba su certificado SHA-256. **Nunca incluya archivos de clave o contraseñas en el repositorio.**


## Informes de temperatura v1.3.0 (sin internet)

- **Informes → Exportar informe PDF**: un PDF A4 legible con dispositivo, fecha y hora real de medición, temperatura, responsable y foto integrada. Disponible un acceso directo **PDF de hoy** en Inicio.
- **Informes → Exportar CSV**: tabla con columnas para Excel, sin imágenes.
- **Equipos → Copias de seguridad**: ZIP completo con `backup_datos.json` y fotos base64 conservadas; exportación técnica JSON opcional y restauración aditiva desde ZIP/JSON.
- El ZIP de transporte del generador PDF es **interno**, no es la copia de seguridad ni se muestra en Android.
- Los registros omitidos se muestran sin hora ni temperatura inventadas; no se añade el texto «Registro tardío» al informe. Se mantiene la auditoría interna.
- Límite de 180 registros por PDF para proteger memoria del teléfono. Si hay más, filtra por fechas/equipo y genera varios informes.
- No se modifica el esquema IndexedDB, los IDs, los datos guardados ni el formato de backup v2.
- Se mantiene el paquete `com.shanfoodsgroup.temperaturas`, el certificado de firma permanente y se incrementa `versionCode` a 5 para permitir actualización de v1.2.1.


## Exportación Excel (v1.3.1)

En «Informes», seleccione equipo y fechas o pulse «Hoy», «7 días», «Este mes», «Mes anterior» o «Todo». **Exportar Excel organizado** guarda un archivo `.xlsx` real sin conexión y con filtros por fecha y equipo. Incluye «Resumen diario», «Resumen equipos», «Registros» y, para un periodo de hasta 24 meses diferentes, pestañas por mes. Las columnas de fecha, hora y temperatura son valores numéricos reales de Excel, no texto pegado en una sola columna. Se congelan encabezados. «Exportar CSV» sigue disponible y ahora escribe `sep=;` para que Excel detecte el separador de las columnas en España. El informe PDF con fotografías y las copias ZIP/JSON no cambian.

El informe no inventa horas ni temperaturas para controles omitidos. El Excel no lleva fotografías: para inspecciones sanitarias se utiliza el PDF con fotos.

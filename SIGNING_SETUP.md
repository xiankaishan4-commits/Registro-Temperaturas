# Firma Android permanente — Registro de Temperaturas

**Importante:** los archivos privados `.p12`, contraseñas y códigos base64 NO deben subirse ni guardarse en este repositorio público. Los 4 valores deben registrarse como **Repository Secrets** en GitHub Actions.

## Pasos de configuración para el propietario

1. Descargue el paquete de recuperación de claves proporcionado en el chat, y guárdelo en **dos lugares protegidos separados**. Mantenga la contraseña en un gestor de contraseñas. Es la única clave capaz de actualizar futuras versiones firmadas con ella.
2. Abra `https://github.com/xiankaishan4-commits/Registro-Temperaturas/settings/secrets/actions`.
3. Pulse **New repository secret** cuatro veces y configure exactamente estos nombres, copiando los valores del archivo privado `GITHUB_SECRETS_VALUES.txt` (sin incluir el nombre ni `=` en el campo Value):
    - `ANDROID_KEYSTORE_BASE64`: contenido completo de `ANDROID_KEYSTORE_BASE64.txt` (una línea base64)
    - `ANDROID_KEYSTORE_PASSWORD`: contenido de `ANDROID_KEYSTORE_PASSWORD.txt`
    - `ANDROID_KEY_ALIAS`: contenido de `ANDROID_KEY_ALIAS.txt`
    - `ANDROID_KEY_PASSWORD`: contenido de `ANDROID_KEY_PASSWORD.txt` (coincide con la contraseña del almacén)
4. Abra **Actions** → **Compilar APK Android con firma fija** → **Run workflow**.
5. Descargue el artifact `Registro_Temperaturas_APK_Firmado_v1.2.1` de la ejecución **verde**; extraiga el APK.

Si falta algún secret, el flujo **fallará deliberadamente** para evitar un APK firmado con una clave temporal. La prueba comprueba la firma digital mediante `apksigner` y coteja el SHA-256 de certificado esperado.

**Certificado público SHA-256:** `CA948872880E588B54F63077AC25BDDCC13CE8C5126CBC38AF27DC26B30129CA`

## Actualizaciones

Cada siguiente versión debe mantener `applicationId` y el **mismo keystore/alias**, incrementar `versionCode` y generar `assembleRelease`. No modifique ni sustituya la clave. Después de la primera instalación de esta nueva identidad de firma, las siguientes actualizaciones firmadas por ella podrán instalarse encima de la versión anterior sin borrar datos (siempre que el resto de compatibilidad se mantenga).

**Atención:** los antiguos APKs de GitHub Actions fueron firmados con claves **distintas**. No se pueden actualizar directamente a esta identidad. Haga una copia ZIP, compruebe que el ZIP incluye registros y fotos y guárdelo fuera del teléfono antes de desinstalar la versión antigua. Después instale el APK con firma fija y restaure el ZIP.

La descarga de un nuevo APK sigue siendo manual; una firma fija **no** instala actualizaciones automáticamente.

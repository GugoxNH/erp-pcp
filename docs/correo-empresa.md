# Correo de empresa en Perfil

Implementado el 11/11/2026 para conectar un buzón de envío, sin cambiar el acceso al ERP. Outlook es el cliente usado por el usuario; los registros públicos de pesaje.com.mx apuntan a mail.pesaje.com.mx. Se comprobó saludo SMTP Postfix y certificado TLS válido en puerto 465, sin credenciales ni envío de correos.

Perfil incluye Correo de empresa, formulario de correo y contraseña, Validar y guardar, actualización/revalidación y desconexión. admin@pesaje.com.mx es un ejemplo, no una cuenta precargada ni validada. Actualmente solo se admiten cuentas @pesaje.com.mx; el destino SMTP está fijado por el servidor. Para otros dominios se debe configurar un proveedor confiable antes de enviarle credenciales.

Nodemailer verify comprueba conexión TLS y autenticación; no demuestra entrega ni aceptación posterior de un remitente/destinatario. La contraseña se guarda solo tras verificación exitosa, cifrada con AES-256-GCM usando la clave existente GMAIL_TOKEN_ENCRYPTION_KEY y el contexto company-email:UUID. Nunca se devuelve al cliente. La etiqueta Validado corresponde a la última validación, no a monitoreo continuo. Una actualización fallida conserva la conexión anterior. El envío de compras sigue pendiente.

Migración pendiente de aplicar: supabase/migrations/202611110001_company_email.sql. Tablas y funciones restringidas a service_role. Las acciones comprueban sesión activa y derivan el usuario del servidor. Límite de cinco validaciones por usuario en quince minutos; no se elimina al desconectar. Los intentos se consumen una sola vez; desconexión invalida verificaciones pendientes.

Validaciones locales: TypeScript, tests/company-email.test.cjs y scripts/check-company-email.mjs. Las pruebas simulan aceptación/rechazo SMTP y ejecutan migraciones en PostgreSQL temporal para permisos, aislamiento, replay, desconexión y límite de intentos. No se ha verificado ninguna contraseña real. Requiere activación remota antes de usar el formulario.

Supabase: codex mcp login supabase devolvió Successfully logged in. El MCP de este chat continúa fallando con OAuth token refresh failed: Failed to parse server response. Reiniciar Codex y comprobar una consulta de lectura antes de aplicar la migración; no confundir autenticación CLI con acceso MCP operativo.

## Activación remota (11/11/2026)

Migración aplicada como company_email y permisos/RLS verificados mediante MCP. Esta nota sustituye el estado pendiente anterior. Variables locales de servicio y cifrado presentes. Ya puede usarse Perfil > Correo de empresa > Validar y guardar. Pendiente validación con credenciales reales capturadas por el usuario; no se enviaron correos.


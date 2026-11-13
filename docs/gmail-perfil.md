# Perfil y conexión personal de Gmail

Implementación del 27/10/2026. Migración aplicada en Supabase como `self_profile_gmail` y permisos verificados. La conexión y los envíos reales no se han probado con Google.

## Uso

Presionar el nombre en la esquina superior derecha abre `/perfil`, también en móvil. Cualquier cuenta activa puede entrar sin acceso a Usuarios. Se pueden editar nombre completo y usuario. Cambiar correo de acceso solicita la confirmación de Supabase y no modifica el Gmail conectado. El cambio de nombre se usará en las iniciales de nuevas compras; no modifica folios existentes.

Usuarios conserva sus permisos administrativos actuales. Perfil no permite editar accesos, estado, permisos ni el indicador de desarrollador. `update_my_profile` obtiene al propietario de `auth.uid()`, comprueba versión, valida datos y registra `profile.update` en `user_access_events`.

Gmail usa OAuth independiente de Supabase Auth. Se solicitan `openid`, `email` y `https://www.googleapis.com/auth/gmail.send`. No se solicita lectura del buzón. El Gmail puede ser distinto del correo de acceso al ERP. La conexión no envía mensajes por sí sola: el botón Enviar y el registro de envíos en Compras siguen pendientes.

## Activación de base de datos

Aplicada `supabase/migrations/202610270001_self_profile_gmail.sql`. Crea la función de edición propia y tablas `gmail_connections` y `gmail_oauth_attempts` con RLS y acceso exclusivo de `service_role`. No concede permisos administrativos a ninguna cuenta.

El servidor necesita la configuración Supabase actual y `SUPABASE_SECRET_KEY`. Nunca usar una variable `NEXT_PUBLIC_` para secretos.

En Supabase Auth → URL Configuration, agregar la dirección de retorno del correo de perfil: `http://127.0.0.1:3000/auth/profile-callback`. Conservar Secure Email Change para verificar el cambio de correo. Si se usa localhost en vez de 127.0.0.1, usar ese host en todas las direcciones y en la sesión del navegador.

## Google Cloud para cuentas personales

1. Crear o seleccionar un proyecto en Google Cloud y habilitar Gmail API.
2. En Google Auth Platform, configurar nombre del ERP, correo de soporte y contacto del desarrollador. Seleccionar audiencia externa porque se usarán cuentas personales.
3. Durante pruebas agregar cada cuenta personal a Test users. Agregar los permisos `openid`, `email` y `https://www.googleapis.com/auth/gmail.send`.
4. Crear un cliente OAuth de tipo Web application. Registrar exactamente esta Authorized redirect URI: `http://127.0.0.1:3000/api/gmail/callback`. No es una aplicación de escritorio aunque se ejecute localmente. Si el ERP se abre con `http://localhost:3000`, registrar esa variante y usarla también en la configuración.
5. En `.env.local`, guardar de forma privada:

   ```dotenv
   GOOGLE_CLIENT_ID=valor_del_cliente
   GOOGLE_CLIENT_SECRET=secreto_del_cliente
   GOOGLE_GMAIL_REDIRECT_URI=http://127.0.0.1:3000/api/gmail/callback
   GMAIL_TOKEN_ENCRYPTION_KEY=64_caracteres_hexadecimales_aleatorios
   ```

   Generar los 32 bytes de la clave de cifrado con un generador criptográfico y guardarlos localmente. No compartir valores por chat ni en documentación. Conservar la clave: cambiarla impide descifrar las conexiones guardadas y obliga a reconectar.

6. Reiniciar el servidor Next.js, entrar al ERP con el mismo host configurado, abrir Perfil y pulsar Conectar con Google. Seleccionar la cuenta personal y conceder el envío.
7. Confirmar que Perfil muestra el correo conectado. Probar cancelación y desconexión. No enviar pruebas a proveedores reales.

Para una app externa en modo Testing, Google normalmente expide refresh tokens con caducidad de siete días cuando se solicita Gmail. La puesta en producción y verificación de permisos sensibles deben revisarse antes de uso estable. Localhost es válido para pruebas y no requiere todavía un dominio público.

## Protección y límites

- OAuth con estado aleatorio, cookie HttpOnly/SameSite, PKCE y nonce. El intento caduca en diez minutos y se consume una sola vez; se comprueban la sesión ERP, identidad verificada de Google y el permiso real concedido.
- Refresh token cifrado con AES-256-GCM y vinculado al usuario como datos autenticados. No se transmite al componente del cliente ni se almacena en localStorage.
- Los mensajes de error no incluyen tokens ni respuestas privadas de Google. Una conexión fallida conserva la anterior.
- Desconectar elimina las credenciales del ERP. Para revocar también el consentimiento en Google se ofrece el enlace a las conexiones de la cuenta. No se revoca globalmente una autorización que pudiera ser usada por otra cuenta del ERP.
- No hay comprobación periódica de revocación ni envío implementado. “Conectado” significa credencial guardada; el envío futuro deberá manejar expiración/revocación y pedir reconexión.
- Los adjuntos del preparador de correo siguen siendo temporales y no se almacenan con esta implementación.

## Validación local

- `npm run typecheck` y `npm run build`.
- `node scripts/check-self-profile.mjs`: todas las migraciones en PostgreSQL temporal, edición sin acceso a Usuarios, conflictos, validación, aislamiento, auditoría y bloqueo de lectura de credenciales.
- `node tests/gmail-profile.test.cjs`: cifrado y asociación a usuario; callback OAuth simulado con estado incorrecto, sesión inválida, replay, falta de permiso, identidad no verificada y cancelación. No sustituye una prueba real con Google.
- Verificación remota: RLS activo; tablas de Gmail sin lectura para authenticated/anon; finalización OAuth solo ejecutable por service_role; edición propia ejecutable por authenticated, no anon.
- Clave de cifrado generada y guardada únicamente en `.env.local`; callback local configurado como `http://127.0.0.1:3000/api/gmail/callback`. No regenerar esa clave.
- Pendientes: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y consentimiento real de Google, comprobación visual con sesión real y pruebas del cambio de correo con la configuración remota de Supabase (incluida la URL de retorno).

Fuentes: [OAuth web de Google](https://developers.google.com/identity/protocols/oauth2/web-server), [caducidad de refresh tokens](https://developers.google.com/identity/protocols/oauth2#expiration), [permisos de Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes).

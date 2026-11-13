# Inicio de sesion

La aplicacion usa Supabase Auth con correo y contrasena. No hay registro publico.
Las sesiones se guardan en cookies HttpOnly; las claves secretas/service_role no
son necesarias. Solo se usa la clave publica junto con las politicas RLS.

## Configuracion

1. Configurar las variables de `.env.example` en `.env.local`.
2. En Supabase > Authentication > URL Configuration, agregar a Redirect URLs:
   - `http://127.0.0.1:3000/auth/callback`
   - `http://localhost:3000/auth/callback` si se usa ese host.
   - La URL HTTPS de produccion seguida de `/auth/callback` al desplegar.
3. Configurar Site URL con el origen habitual y NEXT_PUBLIC_SITE_URL con ese mismo
   origen. Usar siempre el mismo host y puerto durante recuperacion de contrasena.
4. Mantener habilitado Email/password. Deshabilitar nuevos registros publicos
   en Supabase Auth para este ERP interno. Crear usuarios desde el dashboard.
5. El usuario inicial debe existir en `auth.users` y `public.app_admins`.

El enlace de recuperacion usa PKCE y debe abrirse en el navegador donde se
solicito. La plantilla de correo predeterminada de Supabase es compatible.
Para usuarios reales, configurar SMTP propio y revisar los limites de envio.

## Alcance actual

- Login, logout local, recuperacion y actualizacion de contrasena.
- Proxy valida el usuario y renueva cookies; layout verifica tambien identidad
  y acceso administrativo con RLS. Server Actions validan sus propios permisos.
- Recordarme conserva cookies entre sesiones. Desmarcado usa cookies de sesion;
  algunos navegadores las restauran al recuperar ventanas. Cerrar sesion es la
  forma explicita de terminar el acceso en equipos compartidos.
- Los catalogos se consultan y editan en Supabase. El workspace sigue limitado
  a administradores hasta incorporar las interfaces de roles operativos.
- No se borran ni importan datos locales al entrar o salir.
- Este cambio no integra R2 ni persiste ordenes de compra.

## Verificacion manual con cuenta real

Entrar con el administrador, recargar una ruta protegida, cerrar sesion y
comprobar que las rutas redirigen a /login. Solicitar recuperacion, abrir el
correo en el mismo navegador y cambiar la contrasena. No compartir credenciales
en el chat ni guardarlas en scripts.

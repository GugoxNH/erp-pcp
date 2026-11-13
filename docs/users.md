# Usuarios y accesos

La ruta `/usuarios` permite altas con usuario, nombre completo, correo, contrasena inicial
y secciones. Permite editar nombre, accesos y estado. No permite modificar al
desarrollador ni la cuenta propia. Los usuarios se desactivan, no se eliminan,
para conservar referencias e historial.

## Autenticacion

- Supabase Auth conserva las credenciales; nunca se almacenan en tablas publicas,
  logs ni localStorage. El formulario limpia la contrasena al cerrar o guardar.
- Crear cuentas requiere `SUPABASE_SECRET_KEY` solo en el servidor, tambien en
  Vercel al desplegar. Nunca usar `NEXT_PUBLIC_` para esta clave.
- El login conserva el correo existente y acepta usuarios sin distinguir mayusculas.
- Las cuentas nuevas requieren correo real y pueden iniciar sesion con usuario
  o correo. El correo se conserva solo en Supabase Auth y se consulta desde el
  servidor para el listado; no se duplica en perfiles. Auth garantiza su unicidad.
- Los alias antiguos `@users.erp.invalid` se muestran como correo pendiente.
  Un administrador puede asignar el correo desde Editar usuario / Actualizar correo.
  Esa operacion es independiente del guardado de nombre/permisos, requiere
  confirmacion y mantiene las protecciones de cuenta propia/desarrollador.
- La recuperacion por correo usa el correo registrado en Auth. Las cuentas con
  alias antiguo necesitan primero un correo real. Las altas/cambios administrativos
  confirman el correo directamente; no prueban que el destinatario sea su propietario.
- La cuenta privilegiada existente recibe el alias `desarrollador`, sin cambiar
  su correo o contrasena. El nombre completo inicial conserva el metadato disponible
  o la parte local del correo; no se inventa un nombre personal.

## Autorizacion

`app_profiles` define accesos a dashboard, businesses, clients, orders, products
y users. Cada acceso autoriza las operaciones completas de esa seccion. Por ahora
no hay separacion lectura/escritura ni restricciones por razon social.

El permiso `users` es administrativo: puede crear usuarios y otorgar cualquier
seccion a otras cuentas. Para el futuro administrador, seleccionar los seis accesos.
No puede degradar al desarrollador ni editar su propia cuenta. El rol desarrollador
solo puede asignarse mediante una operacion administrativa externa confiable.

- Menu filtrado, proxy de rutas, acciones del servidor y RLS aplican permisos.
- Empresas/clientes/OC comparten lectura de catalogos necesaria para selects y
  asociaciones; las mutaciones requieren el permiso de la seccion propietaria.
- Dashboard no concede lectura a catalogos ni ordenes. Productos no concede clientes.
- Cambios y desactivaciones se consultan en base de datos en cada operacion; no se
  confia en permisos dentro de JWT o user_metadata. Una pantalla ya cargada puede
  conservar contenido visual hasta recargar, pero no autoriza operaciones revocadas.
- Altas usan la API oficial Auth y un trigger transaccional sobre app_metadata
  confiable; datos de signup/user_metadata no pueden conceder accesos.
- Edicion usa RPC con control de version y protecciones de cuenta en la base.
- `user_access_events` registra altas/cambios sin contrasenas.

## Pruebas

`node tests/access.test.cjs` valida el modelo.
`node --env-file=.env.local tests/access.integration.cjs` crea tres usuarios QA,
verifica Auth, RLS, rutas, revocacion, concurrencia, proteccion de desarrollador y
cuenta propia, altas por Server Action y login por nombre de usuario; elimina solo
esas cuentas y sus eventos en finally. Requiere servidor
local en 127.0.0.1:3000 y la clave de servidor. No ejecutar automaticamente en CI.

## Avisos de seguridad

Las funciones SECURITY DEFINER `has_section`, `save_purchase_order` y
`update_user_access` son deliberadamente ejecutables por authenticated: consultan
auth.uid(), verifican permisos cuando mutan datos y fijan search_path vacio.
Los triggers de aprovisionamiento no son invocables por authenticated.
Supabase mantiene deshabilitada la proteccion de contrasenas filtradas; revisar
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
antes del uso en produccion.

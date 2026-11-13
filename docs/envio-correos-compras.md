# Envío de correos de compras (12/11/2026)

Implementado localmente. Activación remota pendiente: aplicar `supabase/migrations/202611120001_purchase_email_send.sql`. Supabase CLI autenticado nuevamente, pero el cliente MCP del chat mantiene error de renovación OAuth; reiniciar antes de reintentar una consulta y aplicar.

Preparar correo mantiene Para, CC, asunto, mensaje y adjuntos. Enviar correo se deshabilita sin remitente conectado/validado o sin registro de envíos instalado. Si ambos correos están disponibles, Empresarial aparece primero y seleccionado por defecto; el usuario puede elegir Google. La cuenta seleccionada se vuelve a comprobar en servidor. Confirmación textual y botón Enviar mediante confirmAction dentro del modal nativo. Loader y bloqueo de edición/cierre durante envío; cancelación de confirmación conserva datos.

SMTP empresarial usa mail.pesaje.com.mx:465 con TLS verificado; Google usa Gmail API con MIME generado por Nodemailer. No hay reintentos automáticos del POST Gmail. Límites del servidor: 50 destinatarios en total, 300 caracteres en asunto, 50,000 en mensaje, 10 adjuntos/20 MB, carga multipart total acotada a 22 MB. Puede haber límites adicionales del proveedor. Para futuros despliegues revisar también límites del hosting; el flujo actual está preparado para localhost.

Autorización por sesión y acceso Compras; se verifica compra/razón social y se rechazan canceladas. Se conserva la posibilidad previa de preparar/enviar desde una compra en borrador. From se obtiene de las credenciales del usuario y debe coincidir con la dirección seleccionada. El navegador nunca recibe contraseñas o tokens. Endpoint protegido contra solicitudes entre orígenes.

`purchase_email_sends` reserva un UUID por intento y huella del contenido/archivos antes de contactar al proveedor. El mismo intento no se reenvía; cambios de contenido o propietario se rechazan. Estados: sending, sent, failed, partial, unknown. Solo el servidor confirma resultados. Un error definido permite Preparar nuevo intento y una nueva confirmación; resultados parciales/inciertos no se reintentan automáticamente. Consultar resultado recupera el estado persistido. Si un intento sigue sin confirmación después de tres minutos, al consultarlo se registra unknown. Recargar/salir pierde el borrador temporal: revisar Bitácora antes de crear otro envío tras un fallo de conexión.

Bitácora registra inicio y resultado en transacciones con el registro de intento. Incluye actor, compra, empresa, remitente, Para/CC, asunto, nombres/tamaños de adjuntos y resultado sin secretos, cuerpo ni bytes adjuntos. Éxitos, fallos, parciales e inciertos tienen descripciones legibles en la pantalla actual. Si falla el registro inicial, no se envía; si falla el registro final, se informa expresamente y se conserva el inicio. Un cierre abrupto del servidor puede dejar sending hasta consultar el resultado.

Éxito significa aceptación por el servidor/proveedor, no lectura ni entrega final garantizada. SMTP no guarda automáticamente copia en Enviados de Outlook; esa funcionalidad requeriría integración adicional. No se envió correo real durante implementación/pruebas.

Validación: TypeScript y build correctos. `tests/purchase-email-send.test.cjs` prueba validación/MIME de entrada, adjuntos, TLS, selección SMTP/Gmail, errores, parciales e incertidumbre con proveedores simulados. `scripts/check-purchase-email.mjs` ejecuta todas las migraciones en PostgreSQL temporal y comprueba idempotencia, permisos, aislamiento, conflictos y Bitácora atómica. Pendientes migración remota, comprobación visual con sesión real y envío real confirmado por el usuario desde el formulario.

## Activación remota (12/11/2026)

Migración aplicada correctamente como purchase_email_send. RLS, política de lectura propia y permisos de funciones verificados en remoto. Esta nota sustituye la activación pendiente descrita al inicio. No se enviaron correos de prueba durante la migración.


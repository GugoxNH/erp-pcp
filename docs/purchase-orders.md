# Ordenes de compra: primera entrega

## Alcance

- Listado por razon social, busqueda por numero, filtros de tipo/estado y paginacion de 25 registros.
- Captura manual o lectura del PDF existente seguida de revision editable.
- Cabecera, hasta 200 partidas, descuento monetario por partida, IVA como importe y total.
- Refacciones: compromiso de envio, envio pendiente/parcial/completo y fecha real.
- Servicios: fecha programada, pendiente/en proceso/realizado y fecha real.
- Borrador, registrada y cancelada. Una registrada no vuelve a borrador; canceladas no se editan.
- Expediente con datos del cliente y razon social al registrar, lectura original e historial de las ultimas 50 versiones.

No se implementaron compras a proveedores, inventario, asignaciones de material, facturacion ni cobros. El compromiso NO es fecha de cobro. El estado de envio no genera movimientos de almacen.

## Almacenamiento y seguridad

Migracion: `supabase/migrations/202610070003_purchase_orders.sql`, aplicada mediante MCP.

Tablas: `purchase_orders`, `purchase_order_items`, `purchase_order_events`.
Solo el RPC `save_purchase_order` puede escribir desde el rol authenticated. Es SECURITY DEFINER con search_path vacio y comprobacion explicita de `auth.uid()` en `app_admins` ANTES de consultar o escribir datos. Anon no puede ejecutarlo. Esta exposicion intencional produce un aviso del asesor de Supabase, que debe reevaluarse si se cambia el modelo de permisos.

Las tablas tienen RLS: administradores o miembros de la razon social pueden leer. No hay permisos directos de escritura ni eliminacion para authenticated. La interfaz actual sigue siendo exclusiva de administradores.

Cabecera, reemplazo de partidas e historial se guardan en una transaccion. Un bloqueo por identificador y revision evita sobrescrituras concurrentes. Los identificadores se generan en el navegador, pero nunca se usan como prueba de autorizacion. Los duplicados se restringen por razon social + cliente + numero normalizado (mayusculas/espacios).

El cliente debe estar activo y asociado al crear. Una orden historica conserva sus datos aunque luego se quite la asociacion. El cliente y razon social no pueden cambiarse una vez guardada. Las instantaneas de origen se conservan.

Los importes editables llegan a Postgres como texto decimal. Postgres recalcula el subtotal por partidas redondeadas a dos decimales y suma IVA. Las lecturas de importes usan casts a texto para evitar perdida de precision en JSON. No se aplica una tasa fiscal automaticamente.

## PDF y Cloudflare R2

R2 se configurara despues, por decision del usuario. Actualmente NO se almacena el archivo original. Solo se conserva nombre, tamano y datos extraidos al guardar la orden. El expediente muestra esta limitacion expresamente.

El listado tiene una unica entrada: Nueva orden. La lectura se realiza dentro del formulario tras seleccionar cliente y rellena los campos directamente, manteniendo el visor PDF al lado. Los avisos aparecen encima de los datos. Se conserva temporalmente el archivo en memoria (hasta 10 documentos de esta pantalla), incluso despues de guardar; al recargar se debe cargar de nuevo hasta conectar R2.

Las fechas se normalizan a ISO para Postgres y se muestran como dd/mm/aaaa. Se aceptan separadores numericos, meses en ingles/espanol y anos cortos (2000-2099). MEI, Sherwin y Hexpol usan mes/dia/ano segun las plantillas existentes. Las fechas ambiguas de Taylor farms quedan vacias con aviso hasta confirmar su convencion. Las fechas inexistentes se rechazan. Los renglones marcados por el lector como detalle se excluyen del total inicial para evitar duplicarlos; se conserva la lectura completa y se muestra una advertencia. El usuario puede corregir/agregar partidas antes de guardar.

## Verificacion

- `node tests/catalog-model.test.cjs`
- `node tests/purchase-orders.test.cjs`
- `npm run typecheck`
- `npm run build`
- `tests/purchase-orders.sql`: prueba transaccional con rollback de todos los datos de prueba. Requiere acceso SQL de confianza y al menos un administrador existente. Comprueba totales, duplicados, revision, rollback, asociacion, cancelacion, permisos directos y acceso no autorizado.
- Prueba de navegador: crear OC, editarla, registrar envio y fechas, leerla del listado y comprobar aislamiento por razon social. Los datos QA se retiran al terminar.

Pendiente de seguridad previo a produccion: activar proteccion de contrasenas filtradas en Supabase Auth, segun disponibilidad del plan. No se han cambiado credenciales ni ajustes de Auth durante este trabajo.

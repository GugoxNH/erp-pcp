# Contexto del proyecto ERP

## Perfil y Gmail personal (27/10/2026)

Implementación local: `/perfil` se abre desde el nombre de la esquina superior derecha, también en móvil. Disponible para usuarios activos sin requerir acceso a Usuarios. Edición de nombre/usuario por RPC propia con control de versión y auditoría; cambio de correo mediante confirmación de Supabase Auth. No permite modificar permisos ni estado. Usuarios conserva su control administrativo.

Conexión individual de Gmail mediante OAuth (openid/email/gmail.send), PKCE, state y nonce; credencial cifrada en servidor y tablas sin acceso directo para authenticated/anon. Incluye cambiar/reconectar y desconectar. Requiere cliente Google Web para cuentas personales y callback de localhost; no requiere dominio público para pruebas. No se conectó ninguna cuenta ni se envió ningún correo.

Migración `202610270001_self_profile_gmail.sql` pendiente de aplicación remota. MCP Supabase no está expuesto en este chat; CLI lo muestra habilitado con Auth Unknown, sin demostrar acceso remoto. No se repitió la autenticación ya confirmada en sesiones anteriores. Configuración Google también pendiente; instrucciones en `docs/gmail-perfil.md` y variables sin secretos en `.env.example`.

Validación local: typecheck/build correctos, pruebas PostgreSQL temporales de permisos/aislamiento/conflictos/auditoría y pruebas simuladas OAuth/cifrado aprobadas. Pendiente comprobación visual con sesión real y pruebas reales de Google/correo. El envío con botón desde Compras, seguimiento y persistencia de borradores/adjuntos continúan pendientes.

La instalación de google-auth-library reportó dos avisos de npm audit en dependencias existentes: Next.js y source-map-js. No se actualizó el framework dentro de este cambio; revisar antes de producción.

Actualizado: 25/10/2026. Resumen del código y las migraciones locales, contrastados con la conversación. No se ejecutaron pruebas ni se verificó el estado remoto de Supabase para este documento. Ante diferencias, prevalece el código actual.

## 1. Arquitectura y tecnologías

- Aplicación web con Next.js 16.3.7 (App Router), React 19.3, TypeScript 7 y CSS propio. Hospedaje previsto en Vercel; no se confirma aquí un despliegue.
- Supabase: PostgreSQL para persistencia y Auth para usuarios/sesiones. Server Actions en `app/*-actions.ts`, modelos y validaciones en `lib/`, SQL versionado en `supabase/migrations/`.
- Autorización en `proxy.ts`, layouts, acciones y políticas RLS. Operaciones de OC, compras y almacén mediante funciones SQL transaccionales.
- PDF.js extrae texto y permite visualizar PDF; Tesseract.js ejecuta OCR local en español. Plantillas por cliente interpretan los documentos. HTML de consignación tiene un lector específico.
- Decimal.js y tipos numéricos de PostgreSQL para importes; Lucide para iconos. SweetAlert2 para alertas y confirmaciones; formularios con modal nativo reutilizable.
- Cookies HttpOnly para sesiones. Variables de conexión pública y `SUPABASE_SECRET_KEY` exclusivamente del servidor; no guardar credenciales en documentación. La clave secreta se usa para administración de usuarios y consulta acotada de contactos al preparar correos.

## 2. Módulos y estado actual

| Módulo | Implementado / límite actual |
|---|---|
| Acceso y usuarios | Login por usuario o correo, recuperación de contraseña, altas, edición, desactivación y permisos por sección. Desarrollador con acceso total. |
| Dashboard | Ruta y layout disponibles; contenido vacío, sin indicadores. |
| Mis empresas | PCP, Taasa y José Orozco: datos generales/fiscales y asociación individual de clientes. Selector global de razón social. |
| Clientes | CRUD, personas físicas/morales, domicilio fiscal y contactos múltiples: nombre, área, correo, fijo, celular y observaciones. Importación de catálogos locales con respaldo previo. |
| Productos | Catálogo compartido: código interno, descripción, unidad, categoría, marca, modelo, notas y estado. Códigos por cliente y varios proveedores con código opcional por proveedor. |
| Proveedores | CRUD con razón social, domicilio, RFC, teléfono fijo y contactos múltiples: nombre, puesto, correo y celular. |
| OC de clientes | Listado, captura manual/lectura, formulario con visor, partidas y subpartidas, validación de productos, importes, estados, expediente e historial con actor y diferencias. Eliminación con doble confirmación y palabra `ELIMINAR`, sujeta a restricciones operativas. |
| Compras a proveedores | Selección previa de proveedor, búsqueda de sus productos por código interno/descripción, partidas, destinos, IVA editable automático, numeración diaria, emisión, cancelación con motivo e historial. |
| Correo de compras | Acción «Preparar correo»: contactos, Para/CC, asunto y mensaje editables; adjuntar/quitar archivos y copiar texto. Máximo 10 archivos/20 MB. Borradores y archivos solo en memoria de la pantalla; no hay envío ni persistencia. |
| Almacén | Recepciones parciales de compras emitidas, entradas, existencias y salidas a clientes con procedencia de material y actualización de OC. |
| Bitácora | Acciones importantes de OC, compras y almacén; columnas fecha/hora CDMX, usuario, razón social y acción. No equivale a auditoría universal de todos los CRUD; usuarios tiene además `user_access_events`. |

Las diez secciones de acceso están definidas en `lib/access.ts`. El permiso independiente `edit_warehouse` (Editar almacen) controla los ajustes manuales y requiere además acceso a Almacén. Los demás permisos siguen siendo por sección; no hay restricciones por razón social para cada usuario. La migración 202610250001 habilita este permiso inicialmente solo para desarrolladores.

## 3. Reglas de negocio importantes

- Las tres razones sociales comparten oficina, catálogo de productos y almacén físico; existencias y operaciones conservan propietario por razón social. No se mezclan saldos entre empresas.
- Los clientes pueden asociarse a varias razones sociales; el selector de OC muestra únicamente los asociados a la seleccionada. Las siete plantas Pilgrims son clientes diferenciados que comparten lector.
- OC de cliente y compra a proveedor son documentos distintos. «Enviada» en OC significa refacciones enviadas; compromiso/vencimiento representa entrega de refacciones o fecha del servicio, no cobro.
- En OC, tipo (refacción/servicio), compromiso, estado y fecha real se manejan por partida. La cabecera resume tipo mixto/avance y compromiso pendiente. Una fecha documental general se replica a las partidas cuando corresponde; las específicas prevalecen.
- Guardar OC exige 1–200 partidas, número y fecha de OC; cada partida necesita descripción, cantidad positiva, precio, tipo y fecha de entrega/servicio. Refacciones requieren código y producto reconocido por su código de cliente; el formulario permite relacionarlo o darlo de alta. El precio cero es aceptado por la validación actual.
- Subpartidas: hasta 200 por partida, almacenadas como JSON; aportan detalle y pueden aportar el código cuando falta el principal. No tienen compras/salidas independientes ni deben duplicar totales.
- «Revisar» no aparece en una orden nueva vacía. Agrupa avisos repetidos; conserva fechas de entrega anteriores a emisión con advertencia. La ausencia de compromiso avisa, pero debe corregirse para guardar.
- Al importar una OC sin IVA explícito, se calcula 16% del subtotal disponible y se avisa; IVA explícito cero o inferior al 16% se conserva con aviso. PolloQro corrige posibles inversiones cantidad/unitario solo bajo heurística y deja advertencia.
- Compras: el IVA automático es 16% del subtotal de partidas, editable. Al reabrir una compra existente se preserva el IVA guardado; el modo automático no se persiste.
- Folio de compra: `RFC(3)-OCAAAAMMDD-0001-INICIALES`, día CDMX y contador por razón social. Prefijos alternativos PPC/TAC/OOA si falta RFC. El número propuesto no se reserva; se asigna al primer guardado, no se recicla al cancelar y los existentes se conservan. Iniciales: primera palabra y dos últimas del nombre.
- Destinos: reparto de una partida de compra entre partidas de OC del mismo producto/empresa/unidad equivalente; el resto se planifica para stock. Los borradores reservan demanda, no existencia física. Emitir cierra edición; una compra recibida no se cancela.
- Recepciones/salidas aceptan parciales y rechazan excesos. Salidas consumen primero entradas reservadas para la partida y después stock libre FIFO compatible; servicios no generan salidas. Cantidades enviadas desde almacén se administran mediante movimientos.

## 4. Decisiones técnicas que conservar

- Supabase es la fuente de datos operativos; almacenamiento local solo conserva preferencias y sirve como origen de importación explícita con respaldo. No usarlo como respaldo silencioso ante errores de conexión.
- Conservar RLS, validación del servidor, RPC transaccionales, control de versiones y bloqueos. Reintentos de movimientos usan UUID estable e idempotencia; no confiar en permisos del navegador ni en UUID como autorización.
- La identidad de partida es su UUID, nunca su posición. Referencias operativas impiden borrado/cambios estructurales; no eliminar ni desbloquear para evadir la trazabilidad.
- Conservar snapshots de documentos e historial. Entradas y salidas son inmutables; correcciones futuras requieren reversas auditadas.
- Fechas persistidas ISO, presentación `dd/mm/aaaa` y convenciones por plantilla. Taylor farms v2 usa «Fecha ordenada» día/mes/año; el formato original tiene tratamiento mes/día/año.
- Reutilizar `app/crud-modal.tsx` y `app/crud-modal.css`: encabezado/pie fijos, cuerpo desplazable y errores dentro del formulario. SweetAlert2 solo para alertas, confirmaciones y notificaciones.
- Consultar las guías de la versión instalada en `node_modules/next/dist/docs/` antes de cambiar código Next.js.

## 5. Funcionalidades pendientes

- Validación del cliente del flujo y pantallas de Fase 1; ajustar antes de ampliar operaciones.
- Cloudflare R2 para originales y expediente documental persistente, aplazado por el usuario. Adjuntar un archivo al borrador de correo no lo almacena en R2.
- Envío de correos, conexión de remitentes, persistencia de borradores/adjuntos y seguimiento de envíos. El PDF de compra se selecciona manualmente; no se genera automáticamente.
- Devoluciones y cancelación/reversa de movimientos de almacén, pospuestas. Reasignación de reservas sobrantes y transferencias aún sin implementar. Inventario inicial y ajustes manuales implementados en código, sujetos a aplicar la migración 202610250001_warehouse_adjustments.sql.
- Servicios como módulo independiente, indicadores y reportes operativos pendientes; hoy los servicios se representan principalmente como partidas de OC. Facturación, cobros y finanzas no tienen módulo implementado.
- Preparar y verificar configuración de producción/Vercel, recuperación de cuentas y protección de contraseñas filtradas; su estado remoto actual no se deduce del código.

## 6. Problemas conocidos y discrepancias

- No se conserva el PDF/HTML original en almacenamiento remoto; tras recargar debe cargarse nuevamente. Los adjuntos y cambios del correo también se pierden al recargar o salir del módulo.
- La comprobación visual del correo quedó pendiente por falta de conexión al servidor local. Este análisis es estático y no acredita pruebas de funcionamiento ni migraciones remotas aplicadas.
- Avances manuales antiguos de OC sin salidas físicas requieren conciliación; no inferir cantidades ni descontar stock otra vez. Subpartidas operativas requerirían otro modelo.
- Las iniciales del folio dependen de palabras separadas por espacios: un nombre como `raul.acosta.arroyo` produce una sola inicial; apellidos compuestos requieren revisar la convención.
- `safeNext` aún enumera solo rutas antiguas: tras login no conserva el destino de las secciones nuevas y puede volver al dashboard.
- Documentos anteriores (`purchase-orders.md`, `products.md`, `supplier-purchases.md`, `users.md`, `supabase-auth.md`) conservan afirmaciones obsoletas: almacén/compras ausentes, equivalencias pendientes, acceso exclusivo de administradores, seis permisos o IVA nunca automático. El código ya implementa esos cambios; este documento los refleja.
- Aunque se pidió cantidad ilimitada de subpartidas/contactos, no debe asumirse ausencia de límites: subpartidas tienen máximo explícito de 200. El compromiso ausente puede mostrarse como aviso durante la revisión, pero la validación actual impide guardar sin él.

## 7. Conexión MCP con Supabase: verificación y recuperación

Al retomar el proyecto, comprobar si el servidor MCP `supabase` está disponible y autenticado antes de concluir que no hay acceso a la base remota. Revisar las herramientas expuestas al chat y realizar una consulta de solo lectura al proyecto `jcdfulvapztnfylycytx`. Que el servidor aparezca habilitado en la configuración no demuestra que la conexión funcione.

Si no está disponible, ejecutar este procedimiento de conexión solicitado por el usuario:

1. Consultar el estado con `codex mcp list`. Si falta el servidor o su URL no corresponde al proyecto, registrarlo con el siguiente comando. Mantener la URL entre comillas para que PowerShell no interprete `&` como parte del comando.

   ```powershell
   codex mcp add supabase --url 'https://mcp.supabase.com/mcp?project_ref=jcdfulvapztnfylycytx&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching'
   ```

2. Si falta autenticación o falla la renovación OAuth, ejecutar:

   ```powershell
   codex mcp login supabase
   ```

   Si `codex mcp add` ya inició la autenticación automáticamente, completar ese flujo sin iniciar otro en paralelo. Compartir el enlace de autorización generado y pedir al usuario que complete la autorización en su navegador. Esperar la confirmación del comando; no asumir éxito solo porque se abrió el enlace.

3. Verificar con `codex mcp list` que Supabase esté habilitado y use OAuth, y volver a probar una herramienta MCP de solo lectura. En una sesión interactiva de Codex que admita comandos slash, `/mcp` permite inspeccionar el estado; no es un comando de PowerShell.

4. Si la CLI confirma la autenticación pero el chat sigue sin exponer las herramientas o informa `unknown MCP server`, pedir reiniciar Codex y retomar este chat para volver a comprobarlo. No repetir la autenticación si ya fue confirmada, salvo que una nueva comprobación indique un error OAuth.

La instalación de habilidades es opcional y no resuelve por sí misma la autenticación. Solo si se necesita ese complemento, el comando proporcionado por el usuario es `npx skills add supabase/agent-skills`.

Ante un fallo, informar el error concreto y distinguir entre servidor configurado, autenticación confirmada y acceso real verificado. No guardar tokens ni credenciales en este documento. Una conexión correcta no demuestra que las migraciones estén aplicadas: consultar primero el estado remoto y aplicar únicamente las pendientes dentro del alcance autorizado.

Última comprobación (25/10/2026): el registro y la autenticación por CLI terminaron con `Successfully logged in`; `codex mcp list` mostró Supabase habilitado con OAuth. El chat aún no había cargado el servidor MCP. Las migraciones nuevas de almacén y Factura seguían pendientes de aplicación remota.

## 8. Dependencias entre módulos

```text
Usuarios/permisos → todas las secciones
Razón social ↔ clientes asociados → OC de cliente
Cliente ↔ códigos de producto → identificación de refacciones en OC
Producto ↔ proveedores/códigos → compras a proveedor
Compra.partida → destinos por UUID de OC.partida / stock
Compra emitida → recepción → entrada → existencia por razón social
OC registrada + existencia → salida → avance de OC + historial/bitácora
Compra + contactos del proveedor → borrador de correo (temporal)
```

Aplicar migraciones en orden: varias reemplazan o modifican funciones anteriores. La de numeración renombra la implementación previa a `save_supplier_purchase_numbered_core`; `save_supplier_purchase` queda como envoltorio de asignación del folio. No repetir migraciones no idempotentes ni basarse en definiciones iniciales aisladas.

## Ajustes manuales de almacén (25/10/2026)

- En Existencias se muestran también productos activos sin movimientos. Editar stock permite establecer el total físico por producto, unidad y razón social con motivo obligatorio.
- Requiere acceso a Almacén y permiso Editar almacen, configurable debajo de Accesos en Usuarios; comprobación en interfaz, Server Action y RPC.
- Los ajustes son inmutables, auditados en Bitácora e idempotentes por UUID. Los incrementos generan entradas libres; las reducciones consumen stock libre FIFO sin tocar reservas, recepciones ni salidas anteriores.
- Se rechazan cantidades negativas, reducción por debajo de reservas y saldo distinto del consultado. El bloqueo transaccional se comparte con recepciones y salidas.
- Migración local nueva: `supabase/migrations/202610250001_warehouse_adjustments.sql`. No se ha aplicado ni verificado en Supabase remoto.

Validación local de esta funcionalidad: typecheck y build correctos; todas las migraciones ejecutadas en PostgreSQL temporal (PGlite), con pruebas de ajustes, idempotencia, conflictos, permisos, bitácora, salidas desde ajustes y bloqueo de escrituras directas. Scripts: scripts/check-warehouse-adjustments.mjs y scripts/check-warehouse-database.mjs. Esto no acredita una migración remota aplicada ni una prueba visual con sesión real.

Recepciones: el campo Referencia / remisión se presenta como Remision; se agregó Factura opcional (máximo 100 caracteres), persistida y visible en listado y detalle. Requiere aplicar 202610250002_receipt_invoice.sql; verificada en PostgreSQL temporal con guardado, consulta e idempotencia. No aplicada al remoto.

Salidas: Registrar salida incluye Factura opcional (máximo 100 caracteres) y la etiqueta Remision. Ambos campos se guardan y aparecen en listado y detalle. Requiere 202610250003_shipment_invoice.sql, verificada en PostgreSQL temporal (guardado, consulta, validación e idempotencia); no aplicada al remoto. TypeScript correcto.

## Verificación remota de Factura (25/10/2026)

Conexión MCP operativa con el proyecto jcdfulvapztnfylycytx. Se aplicaron correctamente las migraciones locales 202610250002_receipt_invoice.sql y 202610250003_shipment_invoice.sql mediante MCP, registradas como receipt_invoice y shipment_invoice. Esta actualización reemplaza las notas anteriores que las indicaban pendientes. La migración de ajustes manuales de almacén no se ejecutó en esta operación.

## Revisión de facturas XML (26/10/2026)

Registrar recepción y Registrar salida incluyen Subir factura. Lectura local de CFDI 3.3/4.0, máximo 5 MB y 1000 conceptos, con modal de revisión: cabecera, emisor/receptor, conceptos y sus impuestos, impuestos globales, UUID/timbrado y CFDI relacionados. Se conservan valores del XML y se avisa si falta folio; no se infiere del nombre del archivo. Los conceptos de servicios no generan movimientos. No se valida fiscalmente ante SAT.

Etapa solicitada por el usuario: exclusivamente revisión. No existe persistencia ni envío del XML al servidor, no se rellena el campo Factura y no cambian las cantidades. La persistencia requiere una nueva autorización del usuario tras revisar la pantalla. Los datos se pierden al cerrar el formulario. Componentes: app/invoice-upload.tsx, app/invoice-preview.css; lector: lib/invoice-xml.ts. Probados ambos XML proporcionados, prefijos alternativos y errores de XML; typecheck y build correctos. Vista local de ejemplos: .tmp/invoice-validation/revision-facturas.html (datos privados locales, no publicar). La comprobación visual en navegador integrado no pudo completarse por timeout al conectar con localhost.

## Permisos y edición de usuarios (26/10/2026)

Usuarios muestra una columna Permisos con Editar almacen y Edición de usuarios. El desarrollador tiene todos los accesos y permisos por su rol, incluso si los indicadores individuales están desactivados. Las demás cuentas necesitan acceso a Usuarios y edit_users para crear usuarios, modificar nombre, accesos, permisos, estado o correo. Se mantienen protegidas la propia cuenta y las cuentas desarrolladoras. Las acciones del servidor y todas las firmas RPC de update_user_access verifican autorización; el aprovisionamiento también.

Causa del fallo al editar raul: faltaban en remoto edit_warehouse y la firma RPC con warehouse_edit. Corregido mediante 202610260001_user_edit_permission.sql, aplicada en Supabase como user_edit_permission. Se verificó el guardado desde desarrollador con rol authenticated en una transacción revertida, sin cambiar los datos ni permisos de raul. Solo el desarrollador recibe inicialmente edit_users; otros usuarios deben recibirlo explícitamente. La migración de ajustes físicos de almacén sigue pendiente (esta reparación solo añadió las columnas de permisos y funciones de usuarios). Se ajustó la migración antigua para tolerar que la columna ya exista.

Validaciones: typecheck, build y pruebas PostgreSQL temporales de permiso concedido/denegado, firmas antiguas, desarrollador, cuentas protegidas y conflictos de versión.

## Inventario sin orden de compra activado (26/10/2026)

Se aplicó en Supabase 202610260002_activate_manual_inventory.sql: activa las tablas y RPC de ajustes pendientes sin reemplazar las funciones nuevas de permisos de Usuarios. Sustituye las notas anteriores de inventario manual pendiente. Existencias incluye productos activos sin movimientos; verificado en remoto: 6 productos, 5 sin stock en PCP. Nuevo botón Registrar inventario con búsqueda/selección de producto, existencia física final y motivo; no requiere compra ni OC. Requiere Editar almacen. Productos inexistentes deben darse de alta en Productos y luego actualizar Almacén. No se cargaron cantidades reales durante la implementación. Pruebas PostgreSQL temporales y compilación realizadas.

## Permiso para editar órdenes de compra (26/10/2026)

Nuevo permiso edit_orders, mostrado como "Editar ordenes de compras" en Usuarios. Requiere acceso a Órdenes de compra; el desarrollador conserva acceso por rol. Las demás cuentas lo reciben explícitamente. Oculta Editar orden y valida la autorización en Server Action y save_purchase_order, comprobando la existencia real bajo bloqueo para evitar eludir el permiso con una revisión manipulada. Crear órdenes sigue permitido con acceso a la sección. No modifica las reglas de compras a proveedores ni de eliminación de OC.

Migración local: supabase/migrations/202610260003_order_edit_permission.sql. Incluye alta/edición de permisos de usuarios y compatibilidad con firmas anteriores. Pendiente de aplicación remota: la revisión automática rechazó la ejecución por requerir autorización explícita para modificar la base compartida, sus funciones de seguridad y los permisos de desarrolladores.

Validación: TypeScript correcto y scripts/check-order-edit-permission.mjs aprobado en PostgreSQL temporal con todas las migraciones: alta sin permiso, edición denegada, revisión manipulada, permiso concedido, desarrollador, acceso de sección, provisión y revocación del permiso y compatibilidad anterior.

## Catálogo de Servicios (26/10/2026)

Implementado en /servicios con acceso independiente services, configurable en Usuarios. El desarrollador accede por rol; no se conceden accesos a otras cuentas automáticamente. El catálogo consulta las partidas de tipo service de las OC, incluidas las existentes y las mixtas, por razón social. No duplica registros ni requiere captura manual. Incluye búsqueda por servicio, cliente u OC y paginación. Borradores y canceladas se muestran, pero no permiten completar servicios.

Marcar completado requiere acceso a Servicios (operación específica, no edición general de OC). La RPC complete_order_service actualiza fulfillment=complete (Realizado en OC) y completed_date con la fecha del servidor en America/Mexico_City. Por confirmación expresa del usuario, conserva commitment_date, la fecha programada de la partida. Recalcula el resumen general de la OC, incrementa su versión y registra snapshot con actor e historial y service.completed en Bitácora. Usa bloqueos compatibles con OC, verifica versión y empresa, rechaza OC futuras/borradores/canceladas y devuelve la fecha original ante reintentos, sin duplicar eventos.

Migración: supabase/migrations/202610260004_services.sql. Pendiente de aplicación remota. Consulta MCP de solo lectura confirmó que tampoco está aplicada 202610260003_order_edit_permission.sql. La autorización explícita para modificar Supabase sigue pendiente tras el rechazo automático anterior; no se intentó eludir ese bloqueo.

Validaciones: npm run typecheck y npm run build correctos (ruta /servicios incluida). scripts/check-services.mjs aprobado con todas las migraciones en PostgreSQL temporal: servicios existentes, permisos, empresa, búsqueda literal, conflictos, fechas, reintentos, historial/Bitácora, múltiples servicios, OC mixta, borradores/canceladas y bloqueo de escritura directa. Sin prueba visual con sesión real ni activación remota todavía. Esta sección reemplaza la mención anterior de Servicios como módulo todavía sin implementar.

## Activación remota de permisos de OC y Servicios (26/10/2026)

Con autorización explícita del usuario se aplicaron correctamente en Supabase las migraciones 202610260003_order_edit_permission.sql (order_edit_permission) y 202610260004_services.sql (services). Esta nota sustituye las anteriores que las indicaban pendientes o bloqueadas.

Verificación remota: columna edit_orders, control ORDER_EDIT_FORBIDDEN en save_purchase_order, firma de ocho argumentos de update_user_access y RPC complete_order_service instalados. Catálogo ejecutable por authenticated; finalización sin acceso para anon. Consulta del catálogo bajo rol authenticated con identidad desarrolladora, en transacción revertida: PCP muestra 2 servicios; Taasa y José, 0. No se completó ningún servicio ni se modificaron fechas de OC durante la verificación. Las cuentas no desarrolladoras necesitan que se les conceda el acceso Servicios y/o el permiso Editar ordenes de compras según corresponda.

## Buscador y filtro de Servicios (26/10/2026)

Corregida la alineación del buscador, lupa y actualización usando orders-search y estilos acotados en app/services.css. Agregado filtro de Estatus: Todos, Pendiente, En proceso y Completado; reinicia la página al cambiar y filtra antes de contar/paginar en SQL.

Migración 202610260005_service_status_filter.sql probada en PostgreSQL temporal con búsqueda combinada, estatus, conteos, paginación y rechazo de estatus inválido. Build y TypeScript correctos. Aplicación remota rechazada por revisión automática, que exige autorización explícita para esta nueva RPC security definer. Pendiente de autorización; Todos conserva la RPC anterior y sigue funcionando. Los filtros específicos muestran un aviso de activación pendiente hasta aplicar la migración.

## Filtro de Estatus activado en Supabase (26/10/2026)

Con autorización explícita del usuario se aplicó 202610260005_service_status_filter.sql como service_status_filter. Sustituye la nota anterior de activación pendiente. Verificación remota bajo rol authenticated con identidad desarrolladora, sin modificar datos: Todos, Pendiente, En proceso y Completado devuelven conteos y filas coherentes con el estatus solicitado.

Verificación pendiente completada al retomar el chat: la comprobación anterior se había interrumpido por límite de uso de la revisión automática; la migración sí se había aplicado. Ahora la consulta remota confirmó en PCP: Todos 2, Pendiente 1, En proceso 0 y Completado 1, con todas las filas coincidentes con el filtro. No se modificaron datos operativos.

## Registro y semáforo de OC (26/10/2026)

Las nuevas OC manuales o importadas parten de Registrada; no ofrecen Borrador en el alta. saveOrder fuerza confirmed para revisión cero. No se modifican retroactivamente borradores existentes. En listado y detalle, una OC registrada con avance pendiente/parcial muestra Registrada amarilla; con todas las partidas terminadas muestra Completada verde. Canceladas conservan su indicador.

Próxima entrega: texto negro cuando faltan más de 5 días; fondo amarillo y texto amarillo oscuro desde 5 días antes hasta el propio día; fondo rojo claro y texto rojo intenso si ya pasó. Los avisos aplican a OC registradas no completadas, usando días calendario de America/Mexico_City. Se conserva el resumen de compromisos pendientes. Implementación en lib/order-indicators.ts; pruebas de límites, cambio de día CDMX y estados en scripts/check-order-indicators.mjs. Pruebas y build (incluido TypeScript) correctos. No requiere migración de Supabase.

## Activación remota de Perfil y Gmail (27/10/2026)

Con autorización del usuario se aplicó la migración 202610270001_self_profile_gmail.sql como self_profile_gmail mediante MCP. Sustituye las notas anteriores de migración pendiente. Verificados RLS y permisos: credenciales e intentos OAuth inaccesibles para authenticated/anon, finalización solo service_role, edición propia habilitada para authenticated y denegada a anon. Edición de perfil comprobada bajo rol authenticated en transacción revertida, sin conservar cambios.

Configurada localmente la clave de cifrado (sin exponerla) y el callback http://127.0.0.1:3000/api/gmail/callback. Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET de Google Cloud, autorización personal y pruebas reales. No se enviaron correos. El botón Enviar en Compras continúa pendiente. Falta verificar/configurar la URL de retorno de cambio de correo en Supabase Auth.


## Correo de empresa en Perfil (11/11/2026)

El usuario confirmó que el buzón empresarial se usará solo para enviar compras, sin cambiar el acceso al ERP. Implementada tarjeta Correo de empresa con correo/contraseña, validación SMTP antes de guardar, revalidación y desconexión. Dominio admitido: pesaje.com.mx; servidor fijo mail.pesaje.com.mx, puerto 465 TLS. DNS público y certificado/saludo SMTP comprobados sin autenticarse. Outlook es el cliente de correo, no implica Microsoft 365.

Contraseña cifrada con la clave existente y contexto por usuario; credenciales solo accesibles al servidor. Cinco intentos cada quince minutos, control de intentos concurrentes y desconexión. Validado significa autenticación aceptada en la última comprobación, no entrega garantizada. No se envió correo ni se probó contraseña real. Envío desde Compras todavía pendiente.

Migración local 202611110001_company_email.sql pendiente. Login CLI de Supabase confirmado, pero MCP del chat falla al renovar OAuth (Failed to parse server response). Reiniciar y verificar acceso antes de aplicar. Pruebas SMTP simuladas y PostgreSQL temporal aprobadas. Detalles en docs/correo-empresa.md.


## Correo de empresa activado en Supabase (11/11/2026)

MCP operativo tras reiniciar. Aplicada 202611110001_company_email.sql como company_email. Sustituye las notas anteriores de migración pendiente. Verificados RLS y permisos de tablas y funciones: anon/authenticated sin acceso directo, service_role autorizado. Configuración local de servicio y clave de cifrado presente, sin mostrar secretos. Pendiente que el usuario capture su correo y contraseña en Perfil para una validación SMTP real. No se autenticó ningún buzón ni se enviaron mensajes durante esta activación.


## Envío de correos desde Compras (12/11/2026)

Implementación local del botón Enviar correo en el preparador, selección empresarial/Google con empresarial por defecto, deshabilitado sin correo validado, confirmación y loader. SMTP empresarial y Gmail API, adjuntos y validación servidor. Bitácora con inicio y resultados sent/failed/partial/unknown, UUID persistente por intento y prevención de duplicados. Consultar resultado para interrupciones. No se enviaron correos reales.

Migración 202611120001_purchase_email_send.sql pendiente de activar en Supabase. CLI login confirmado, MCP del chat aún falla renovación OAuth; requiere reinicio y comprobación. El botón se deshabilita mientras falte el registro remoto. Pruebas simuladas SMTP/Gmail, PostgreSQL temporal, TypeScript y build aprobados. Detalles y límites: docs/envio-correos-compras.md.


## Envío de compras activado en Supabase (12/11/2026)

Aplicada mediante MCP la migración 202611120001_purchase_email_send.sql como purchase_email_send con autorización explícita del usuario. Sustituye el estado pendiente anterior. Verificados RLS, lectura limitada al actor con acceso Compras, ausencia de escritura directa de authenticated y confirmación de resultados exclusiva del servidor. No se enviaron mensajes durante la activación; falta prueba real desde el formulario por el usuario.


## Confirmación manual de proveedores (12/11/2026)

Tras envío con estado sent se cierra el modal de correo y se muestra Mensaje enviado con exito. Aplica también al recuperar un resultado enviado mediante Consultar resultado; fallos/parciales/inciertos mantienen el formulario. Acciones de Compras se muestran en fila horizontal. Flecha gris abre modal nativo para capturar número de confirmación (texto, 1–200 caracteres); Validar guarda fecha del servidor/actor y muestra palomita verde. Consultas posteriores muestran número y fecha/hora CDMX sin edición. Es confirmación manual, no seguimiento automático de aperturas. Se registra en Bitácora.

Migración 202611120002_supplier_confirmation.sql aplicada mediante MCP como supplier_confirmation. RPC con permiso Compras, validación por empresa, bloqueo de fila, idempotencia y prohibición de sobrescribir confirmaciones. Canceladas sin confirmar no se validan; confirmaciones existentes permanecen consultables. Pruebas PostgreSQL temporal (scripts/check-supplier-confirmation.mjs), TypeScript y build correctos. No se enviaron mensajes ni se validaron compras reales en las pruebas. Sin comprobación visual con sesión real.


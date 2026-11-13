# Compras y destinos

- Compras a proveedores tiene su propio permiso `purchases` y conserva la razon social.
- Cada partida de compra referencia un producto del catalogo compartido.
- Primero se selecciona proveedor. El buscador de productos filtra por sus asociaciones y permite buscar SKU interno o descripcion, sin distinguir acentos/mayusculas.
- Cambiar proveedor pide confirmacion antes de limpiar partidas incompatibles y sus asignaciones. Supabase rechaza compras con productos no asociados; las compras historicas no se modifican.
- Los destinos enlazan UUID de partidas de OC del cliente, nunca posiciones.
- Solo se asignan refacciones pendientes de OC confirmadas de la misma razon social, producto y unidad equivalente.
- La cantidad no asignada queda planificada para stock; no representa existencia recibida.
- Los borradores ya reservan demanda planificada. Editarlos conserva los identificadores de las partidas.
- Emitir cierra la edicion. Cancelar requiere motivo, libera demanda y conserva asignaciones, eventos y bitacora.
- Las partidas de cliente con operaciones quedan protegidas contra eliminacion y cambios estructurales, incluso tras cancelar la compra.
- Las mutaciones son RPC transaccionales; las tablas no admiten escritura directa desde authenticated.
- Pendiente para la siguiente etapa: recepciones fisicas, entradas de almacen y salidas por destino.

Pruebas: `node tests/supplier-purchases.test.cjs` y `tests/supplier-purchases.sql` (transaccion con rollback).

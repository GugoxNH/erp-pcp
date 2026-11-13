# Trazabilidad de partidas

- `purchase_order_items.id` es la identidad permanente (UUID). `position` es solo el orden de presentacion.
- El formulario conserva el ID al editar; nuevas partidas y nuevas lecturas generan nuevos IDs.
- `save_purchase_order` version 4 actualiza por ID, inserta nuevas partidas y elimina solo las retiradas. Rechaza IDs duplicados, ajenos y clientes antiguos sin identidad.
- Las OC existentes reciben IDs sin modificar sus importes ni datos. Se agrega un evento `identity_migrated` y aumenta la revision para impedir guardados desde formularios anteriores. Los eventos antiguos no se reescriben: no es posible reconstruir con certeza sus identidades.
- El historial nuevo compara por ID; el anterior utiliza posicion como antes.

## Contrato para Compras y Almacen

Las futuras tablas deben referenciar `purchase_order_items(id)` con `ON DELETE RESTRICT`, nunca por numero de renglon. Cada escritura operacional debe bloquear la OC primero y luego la partida (`FOR UPDATE`), comprobar que pertenece a esa OC/razon social y no esta cancelada, y fijar `operations_locked_at` en la misma transaccion. No exponer ese campo como entrada editable ni crear un RPC publico para desbloquearlo.

El trigger impide borrar una partida bloqueada o cambiar su producto, tipo, codigo, unidad, cantidad y subpartidas. Tambien impide quitar el bloqueo. Se permiten cambios de posicion, descripcion, precio y fechas. La cancelacion de una OC bloqueada se rechaza; su eliminacion completa tambien queda detenida por el trigger. Futuras reglas de cantidades reservadas/recibidas/entregadas deben implementarse junto con sus movimientos; hoy no se simulan existencias ni compras.

Las subpartidas siguen siendo detalle JSON de la partida principal, no unidades operativas independientes. Si posteriormente se compran/entregan por separado, requieren un modelo relacional propio antes de recibir asignaciones.

Verificacion: `tests/order-item-identity.test.cjs` y `tests/order-item-identity.sql` (transaccion revertida).

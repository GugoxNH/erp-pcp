# Salidas del almacen

## Flujo

Almacen > Salidas > Registrar salida. Seleccionar una OC registrada de la razon social actual y capturar cantidades por partida de refacciones. El servidor consume primero entradas asignadas a esa partida y despues stock libre de la misma razon social/producto/unidad equivalente, por fecha de recepcion y folio. Nunca utiliza existencias asignadas a otra OC.

Cada movimiento conserva fecha, referencia/remision, destinatario, direccion de la OC, observaciones, usuario y hora. Su detalle identifica las entradas fisicas consumidas. Los servicios no generan salidas.

## Integridad

- La transaccion descuenta existencias, registra procedencia, actualiza cantidades/estado de la partida, recalcula el avance de la OC y agrega historial y bitacora.
- Bloqueo por razon social compartido con compras/recepciones y bloqueo de OC: evita sobreconsumo concurrente y conflictos de revision.
- No se permite exceder el pendiente de enviar ni utilizar material recibido despues de la fecha de salida.
- El UUID de solicitud permite reintentar el mismo guardado sin duplicar movimientos.
- `shipped_quantity` refleja las salidas reales y no acepta modificaciones manuales. El estado y fecha real quedan administrados por almacen despues del primer movimiento.
- Las ediciones de la OC conservan el avance de almacen en sus snapshots. Sesiones con una revision anterior deben recargar.
- Las OC con avances manuales anteriores sin salidas registradas requieren conciliacion: no se infieren cantidades enviadas ni se descuentan nuevamente.
- Las compras pueden cubrir demanda de partidas con envio parcial, descontando lo que ya se surtio desde stock libre.
- Las salidas son inmutables desde la aplicacion; no hay borrado ni cancelacion sin movimiento de reversa.

## Limites actuales

Solo salidas a clientes, no consumo interno, mermas, transferencias ni devoluciones. El almacen fisico es compartido, pero no se mezcla la propiedad entre razones sociales. Las asignaciones sobrantes a una OC no se liberan automaticamente; requieren una futura operacion de reasignacion auditada.

## Pruebas

`node tests/warehouse-shipments.test.cjs` y `tests/warehouse-shipments.sql` (rollback).
Prueba UI con una OC de 6 piezas y 10 recibidas: salida de 3, existencia restante 7 (1 asignada y 6 libres), OC en envio parcial y control manual bloqueado.

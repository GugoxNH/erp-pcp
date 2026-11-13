# Recepciones y entradas al almacen

## Alcance

Almacen fisico compartido, con existencias separadas por razon social y unidad. Las recepciones provienen de compras emitidas. Se aceptan recepciones parciales por destino: partida de OC del cliente o stock libre. No se convierte entre unidades ni se transfiere propiedad entre razones sociales.

Cada fila de `warehouse_entries` es una entrada fisica inmutable vinculada a la recepcion, partida de compra, producto y destino. Las existencias se calculan sobre estas entradas; no se mantiene un contador adicional que pueda desincronizarse. Las cantidades destinadas a OC se muestran asignadas, no disponibles.

## Reglas

- Una recepcion contiene una o mas cantidades positivas, con hasta cuatro decimales.
- La fecha se valida entre la fecha de compra y el dia actual de CDMX.
- El servidor valida pertenencia de compra, razon social, partida y destino, y no permite exceder el pendiente.
- El bloqueo transaccional compartido con compras serializa recepciones y cancelaciones. Una compra recibida no se cancela.
- Un UUID de solicitud estable hace idempotente el reintento con exactamente los mismos datos y usuario.
- Las entradas no se editan ni eliminan desde el sistema. Futuras correcciones requeriran movimientos de reversa auditados.
- Recibir no marca la OC del cliente como enviada ni registra salidas.
- El acceso `warehouse` habilita la seccion Almacen. El desarrollador lo tiene automaticamente; otros usuarios se configuran en Usuarios.
- Se registran usuario, hora, folio y bitacora. Los folios pueden tener saltos por transacciones revertidas.

## Verificacion

- `node tests/warehouse.test.cjs`: validacion de cantidades, fechas y destinos repetidos.
- `tests/warehouse.sql`: transaccion con rollback; parciales, saldos, reintentos, sobre-recepcion, permisos, aislamiento por razon social, bloqueo de cancelaciones y auditoria.
- Prueba de navegador: recepcion de 5 piezas (2 asignadas a OC y 3 libres), consulta de existencias y saldo pendiente.

## Siguiente etapa

Las salidas hacia clientes ya descuentan sus movimientos de las entradas; ver `warehouse-shipments.md`. Pendientes: devoluciones/reversiones e inventario inicial/ajustes autorizados.

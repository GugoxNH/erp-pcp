# Numeros de compra

Formato: RFC(3)-OCYYYYMMDD-consecutivo-iniciales.
Fecha de registro en America/Mexico_City, independiente de la fecha editable de compra.
Contador por razon social y dia, compartido por usuarios. Minimo cuatro digitos.
Iniciales: primer nombre y dos ultimas palabras del nombre completo.
Los nombres con apellidos compuestos requieren revisar esta convencion.

La propuesta no reserva numero. El guardado asigna el definitivo bajo el bloqueo
transaccional de compras y revierte el contador si falla. Cancelar no lo libera.
Las compras existentes conservan su numero, incluso al editarlas.
Los prefijos PPC/TAC/OOA se usan cuando el RFC aun esta vacio.

Requiere aplicar 202610240001_purchase_numbers.sql antes de usar Nueva compra.
Prueba SQL: tests/purchase-numbers.sql (rollback).

# Revisión de fechas de compromiso

Revisión: 10 de octubre de 2026. Se revisaron las 56 muestras de texto/OCR previamente extraídas en `tmp/extraction`, las imágenes de los campos y 45 PDF originales adicionales de las carpetas de pruebas para contrastar los casos dudosos y los formatos compartidos. Algunos originales corresponden a las mismas OC de las muestras; no son 101 OC distintas. No se modificaron las órdenes guardadas.

## Comportamiento implementado

- Actualización 11/10/2026: la lectura rellena la fecha de entrega de cada partida. Si el documento tiene una única fecha válida, se aplica a todas; las fechas distintas se asocian mediante la ubicación de cada partida en el PDF.
- Se conserva evidencia del texto original, etiqueta, página y fecha normalizada en el resultado de lectura. El formulario muestra dd/mm/aaaa y guarda ISO, igual que los otros campos de fecha.
- Las fechas anteriores a la emisión se conservan y generan una advertencia por partida en **Revisar**. Las partidas sin fecha o sin asociación verificable también generan advertencias; no se inventan fechas.
- No se calculan fechas desde plazos relativos ni se usan fechas de pago, impresión, aprobación o solicitud.
- Taylor farms usa mes/día/año en el formato conocido: corroborado con los originales que contienen 4/24/2026, 8/21/2026 y 8/28/2026. Su 8/7/2026 corresponde a 07/08/2026.

## Campos identificados

| Cliente / plantilla | Campo o ubicación | Resultado de muestra (dd/mm/aaaa) |
| --- | --- | --- |
| Bachoco | Fecha de entrega | 20/06/2026 |
| Campi | Fecha de entrega | 10/06/2026 |
| Agrogen | Fecha de entrega | 06/02/2026 |
| Calquimica | Fecha de entrega, antes de dirección | 05/06/2026 |
| Ceypabasa | Columna Entrega | 30/01/2026 |
| Daltile | Columna ENVIAR | 29/05/2026 |
| Ingredion | Cabecera FECHA DE ENTREGA | 21/05/2026 |
| Empacadora | Fecha al final de la partida | 02/07/2026 |
| Grupo Abrego | FECHA DE ENTREGA al pie | 17/07/2026; otras 5 muestras verificadas |
| MartinSproket | Columna Entrega | 01/04/2026 |
| Ferroservicios | Fecha de Entrega a la derecha | 24/03/2026 |
| Agro Alimentos Puebla | Fecha de Entrega a la derecha | 24/03/2026; otras 4 muestras verificadas |
| Euro Nutec | Necesario Para | 07/05/2026 |
| NutecGaleras | Necesario Para | 17/06/2026 |
| NutecJCF | Mismo formato; original OC 156540 | 08/06/2026 |
| Dgari | Columna Fecha entrega | 10/07/2026, 10/10/2025, 19/01/2026 según OC |
| MInsa | Columna FECHA ENT | 12/02/2026 |
| Kerry | Columna Delivery Date | 23/05/2026 |
| Hexpol | Delivery Date | 14/01/2026 |
| Capistrano | Columna Entrega | 23/01/2026 y 09/01/2026 según OC |
| Audace | Fech. Entrega. | 30/09/2026 |
| Nutribaq | FECHA DE ENTREGA al pie | 18/03/2026 |
| Pilgrims v1 | Fe. Entrega, página 2 | 27/02/2026 |
| Pilgrims v2 | Fc. Entrega | 28/03/2026 |
| Pilgrims v3 | Fc. Entrega, página 2 | 30/04/2026 |
| Pilgrims v4 | Fc. Entrega | 31/05/2026 |
| PPG | Fecha de Entrega por partida | 30/01/2026, 04/03/2026; tercer ejemplo requiere confirmar |
| Cargill / Cargil Irapuato | Fecha de Entrega por partida | Campo encontrado; hay OC con entrega anterior a emisión |
| MEI | Delivery Date, cabecera | Campo encontrado; 3 de 6 originales tienen entrega anterior a emisión |
| JhonsonMatthey | Delivery Date por partida | Varias fechas; ver pendientes |
| Taylor farms | Delivery por partida | 24/04/2026 y 07/08/2026; otro original requiere confirmar |

Las cuatro variantes Pilgrims aplican a las siete plantas del catálogo. La revisión no garantiza todas las variantes futuras; si el documento no permite determinar la fecha, se advierte en lugar de inventarla.

## Pendientes de ayuda del cliente

### Fecha no encontrada o campo vacío

| Cliente | Hallazgo / pregunta |
| --- | --- |
| Ceat | No aparece un compromiso de entrega en el ejemplo ni en las OC originales revisadas. ¿Se obtiene de cotización o confirmación externa? |
| OMG | No aparece una fecha explícita de entrega. |
| Sherwin | Existe la columna Need By Date, pero está vacía en las 4 OC originales revisadas. |
| PolloQro | Existe FECHA DE ENTREGA, pero está vacía en las muestras y los 13 originales revisados. |
| Comex | Fecha de entrega / Delivery Date vacía en el ejemplo. |
| PPG AP Resinas | Fecha de entrega / Delivery Date vacía en el ejemplo. |
| PPG Comex | Campo de fecha vacío; texto indica 4 a 5 semanas después de recibir la OC. Falta fecha de recepción y regla para el rango. |
| inovatelia | Tiempo de entrega (días): 15. Falta confirmar fecha inicial y si son naturales o hábiles. |
| DSA | Aparece Fecha de solicitud, no una fecha comprometida. Un ejemplo indica 8-10 días hábiles. No se tomó la solicitud como entrega. |

### Fechas encontradas que no permiten elegir automáticamente

- **JhonsonMatthey, OC 2500221210:** resuelto por partida: 30/09/2026, 26/09/2026 y 25/11/2026 para las tres restantes.
- **Cargill Salamanca:** OC 7002769475 entrega 28/01/2026 frente a emisión 30/01/2026; 7002847578 entrega 03/03/2026 frente a 05/03/2026; 7003479203 entrega 11/09/2026 frente a 12/09/2026.
- **Cargil Irapuato:** 7002843749 entrega 03/03/2026 frente a emisión 04/03/2026; 7002843758 entrega 02/03/2026 frente a 04/03/2026. Los otros 5 originales sí permiten autorrelleno.
- **MEI:** 4500959404 entrega 27/01/2026 frente a emisión 03/02/2026; 4500969794 entrega 12/05/2026 frente a 15/05/2026; 4500970255 entrega 13/05/2026 frente a 20/05/2026. Los otros 3 originales sí permiten autorrelleno.
- **PPG, OC 335469 (PPG_3.pdf):** entrega 29/07/2026 frente a emisión 20/08/2026.
- **Taylor farms, PO-00015575-1:** entrega 21/08/2026 frente a emisión 28/08/2026.

Actualización 11/10/2026: estas fechas anteriores a la emisión ahora se admiten, se conservan y se señalan en **Revisar**, según indicación del usuario.

### Variante fuera de la plantilla conocida

- Archivo `PO-26-062804 CARGA MODELO RC3 A3462.pdf`, carpeta Taylor: usa otra distribución con `Promised Date` y fecha `05/06/2026`. El lector actual no reconoce su firma como el formato Taylor configurado. Confirmar empresa/formato y convención de fecha antes de incorporarlo; no se forzó su lectura.

## Verificación

- `node tests/order-commitment.test.cjs`: etiquetas, columnas, límites de página/tabla, fechas inválidas, múltiples fechas y firma de empresa.
- `node tests/order-commitment-corpus.cjs`: 56 muestras privadas locales y alias de plantas/clientes.
- `node tests/purchase-orders.test.cjs`: traspaso a formulario, normalización y reglas de OC.
- Auditoría de originales: `tmp/delivery-originals-audit.json` (generada por `tmp/audit-delivery-originals.mjs`).

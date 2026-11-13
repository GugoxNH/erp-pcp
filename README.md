# PCP · Revisión local de órdenes

Next.js y TypeScript. Selecciona empresa y PDF para ver siete grupos de datos junto al documento original: OC, fecha, moneda, productos/materiales, subtotal, IVA y total.

## Ejecutar

```sh
npm install
npm run dev
```

Abrir http://127.0.0.1:3000. Se procesa en el navegador, sin cuentas, almacenamiento ni servicios de pago. El selector ofrece dieciocho plantillas. Cambiar de empresa limpia la selección anterior.

## Verificar

```sh
node --experimental-strip-types scripts/check-subtotal.mjs
npm run typecheck
npm run build
node --experimental-strip-types scripts/check-templates.mjs "RUTA_A_LA_CARPETA_DE_MUESTRAS" "OTRA_CARPETA_OPCIONAL"
```

La prueba de integración requiere Node 22 y los dieciocho PDF resaltados originales (privados, no incluidos en el proyecto). Verifica cabecera, totales, cantidad de partidas, descripciones, subpartidas, selección incorrecta y documento vacío.

## Funcionamiento

- PDF.js extrae texto con coordenadas; las reglas por empresa identifican campos sin depender de resaltados o nombres del archivo.
- El visor lateral tiene navegación, zoom y enlace a la página de cada partida.
- Productos incluyen posición, código cuando existe, descripción, cantidad, unidad, precio e importe.
- Se conserva el formato de fechas y moneda: MEI usa mes/día/año y MXP no se convierte automáticamente a MXN.
- Cargill no desglosa IVA ni total; no se calculan.
- MEI no desglosa IVA: queda ausente. Un IVA ausente no se toma como cero.
- Johnson Matthey conserva subpartidas como detalle, excluidas de la suma de principales.
- Se avisa cuando no coinciden importes o empresa. Los borradores requieren revisión y no se guardan como registros contables.
- Límite de 25 MB. Las páginas sin texto se leen con Tesseract.js en español, con recursos locales y sin costo por página. El OCR muestra una advertencia para revisar caracteres ambiguos.
- Las reglas están verificadas con las treinta y una muestras; cambios de estructura pueden requerir ajustes. Sin Supabase ni despliegue por ahora.

Plantillas: JhonsonMatthey, inovatelia, Bachoco, Campi, Ceat, OMG, MEI, MartinSproket, Cargill, Calquimica, Agrogen, Daltile, Ceypabasa, Grupo Abrego, PolloQro, Ingredion, Empacadora, Taylor farms, Sherwin, Ferroservicios, Euro Nutec, Comex, Dgari, Agro Alimentos Puebla, NutecGaleras, MInsa, Kerry, Hexpol, Capistrano, DSA y Audace.

El resultado OCR puede variar entre el canvas nativo de las pruebas y Chrome. La prueba admite un identificador no reconocido de Ceypabasa en Node y exige la advertencia correspondiente; en Chrome se verificó OC-076457-1. Los PDF permanecen en el navegador y no se envían a servicios externos.


## Subtotal calculado

En páginas procesadas con OCR, en Agrogen y cuando falta el subtotal o discrepa de Total − IVA, se calcula esa diferencia con precisión de centavos. También se aplica a Grupo Abrego y PolloQro, cuyas etiquetas SUB-TOTAL incluyen IVA. Se conserva la lectura original y se muestra «Subtotal · calculado» con la operación. Sin Total e IVA válidos no se calcula. Los cargos, retenciones y descuentos requieren revisión del usuario.

Grupo Abrego y Empacadora incluyen una segunda lectura OCR de campos pequeños. El visor y el OCR cargan los decodificadores locales PDF.js para imágenes JBIG2. Los caracteres tachados o borrosos pueden seguir necesitando revisión. PolloQro conserva las columnas CANT. y UNITARIO tal como aparecen, y Taylor farms conserva la fecha sin asumir mes/día o día/mes.

## Regresión de PolloQro

La OC conserva el espacio entre serie y folio (por ejemplo, `A 62117`). Las partidas se leen por columnas, con o sin centro de costo, incluyendo descripciones en varias líneas. Se mantienen los precios y cantidades impresos.

```sh
node --experimental-strip-types scripts/check-polloqro.mjs "RUTA_A_LA_CARPETA_PQ"
```

## Regresión de Grupo Abrego

Conserva el espacio entre serie y folio (`B 8418`). Combina OCR de página con lecturas de campos sobre la imagen original: OC, cantidades, códigos, precios, IVA y total. Las partidas se separan por columnas y conservan descripciones de varias líneas. Para los códigos de cuatro letras y sufijo numérico se corrige la confusión O/0 en el sufijo. El subtotal se obtiene de Total − IVA. Los textos tachados o borrosos necesitan validación visual.

```sh
node --experimental-strip-types scripts/check-abrego.mjs "RUTA_A_LA_CARPETA_PQ"
```

## Plantillas PCP

Sherwin conserva la fecha mes/día/año; no desglosa IVA, por lo que el subtotal queda pendiente. Dgari solo presenta el subtotal sin IVA: IVA y total quedan pendientes. Ferroservicios no especifica la moneda y no se deduce del símbolo de pesos. Comex conserva los cuatro decimales impresos; los cálculos de subtotal se realizan en centavos. Euro Nutec conserva la descripción multilínea sin incorporar las condiciones de entrega.

Para validar las 31 muestras, pasa a scripts/check-templates.mjs las carpetas TAASA/resaltados, Jose orozco/resaltados y PCP/resaltados como tres argumentos.


Las seis plantillas adicionales PCP conservan las descripciones multilínea. Capistrano reconstruye los decimales partidos entre renglones. MInsa usa la fecha de la orden (día/mes/año) y Kerry conserva año/mes/día. Hexpol conserva mes/día/año y presenta solo subtotal sin impuestos: IVA y total quedan pendientes. Agro Alimentos Puebla no especifica moneda. Se mantiene la regla de Total menos IVA para subtotal dudoso o documentos con OCR, sin asumir IVA cero.


DSA conserva la fecha del pedido, las características de la celda y convierte la indicación explícita de moneda nacional a MXN. Audace asocia los importes del servicio a la partida principal, sin duplicar cantidades ni importes. Ambos mantienen el cálculo de subtotal mediante Total menos IVA cuando corresponde.


## PPG

PPG está disponible como una sola empresa (32 empresas en total), verificada con PPG_1, PPG_2 y PPG_3. Lee artículos con o sin código, varias partidas y totales en páginas posteriores; excluye cláusulas y notas fiscales de las descripciones. Los tres ejemplos no desglosan IVA ni subtotal: se conserva el Total impreso y no se supone IVA cero por la marca N. Sin IVA explícito no se puede calcular Total menos IVA.

Prueba: node --experimental-strip-types scripts/check-ppg.mjs RUTA_A_MAS_DE_UNO


Dgari admite partidas con código de artículo (por ejemplo 8-89-009232) y sin código, conservando cantidades, precios y descripciones de varias líneas. Regresión de los tres ejemplos: node --experimental-strip-types scripts/check-dgari.mjs RUTA_A_PCP_RESALTADOS. Los ejemplos solo desglosan el subtotal sin IVA; no se inventan IVA ni total.


Agro Alimentos Puebla: admite encabezados con caracteres de fuente alterados (Arơculo/CanƟdad), conserva descripciones multilínea y comentarios del artículo, y excluye cuentas contables y centros de costo. Regresión: node --experimental-strip-types scripts/check-agro.mjs RUTA_A_PCP_RESALTADOS.


Capistrano lee el folio junto a Numero de Orden por su posición, independientemente del tipo DB/O2. No utiliza 000 ni Suc/Planta como folio alternativo. Prueba: node --experimental-strip-types scripts/check-capistrano.mjs RUTA_A_PCP_RESALTADOS.


PPG AP Resinas es una opción propia (33 empresas disponibles). Comparte la estructura de Comex, con identificación por razón social/RFC y descripciones sin notas de cotización o autorizaciones. Conserva cuatro decimales y aplica Total menos IVA para OCR o subtotal dudoso. Su muestra se incluye en check-templates.mjs.


PPG Comex (34 empresas disponibles): admite descripciones que continúan en otra página, evita duplicar totales repetidos y excluye notas comerciales. Prioriza la moneda del campo dedicado y advierte si una nota la contradice. Verificado con cuatro partidas y con el cálculo de subtotal para OCR. PPG AP Resinas también quedó verificado en las pruebas y navegador.


Nutribaq usa OCR local con lecturas adicionales de precio y total; compara las alternativas reconocidas con SUMA e IVA. Conserva la OC con espacio y ceros iniciales y calcula el subtotal como Total menos IVA. La muestra contiene A 03708, IVA 4,232.00 y total 30,682.00. Los códigos SERV con sufijo numérico normalizan las confusiones O/C por cero.

## Pilgrims

Hay 44 opciones en el selector. Pilgrims se presenta como siete empresas: Pilgrims - Tepeji, Pilgrims - San Luis Potosí, Pilgrims - Cuez, Pilgrims - Laguna 2, Pilgrims - Popular, Pilgrims - Porvenir y Pilgrims - 5 de Febrero. Todas comparten la plantilla y el tratamiento OCR; la opcion generica Pilgrims no aparece en la lista. La plantilla admite las cuatro variantes de cabecera, PDF con texto y escaneos en vertical u horizontal. Identifica la empresa por razon social/RFC, conserva los ceros del codigo de articulo y los seis decimales impresos. Lee las partidas de la tabla de detalle sin duplicar el resumen, y une descripciones entre paginas, excluyendo solicitudes, solicitantes y condiciones generales. Usa el precio unitario con descuento sin impuestos y el subtotal con descuento. En OCR se retiran las lineas de la tabla antes de reconocer el texto; se mantiene la advertencia de revision y el calculo del subtotal Total menos IVA en centavos.

```sh
node --experimental-strip-types scripts/check-pilgrims.mjs "RUTA_A_LA_CARPETA_PILGRIMS"
```


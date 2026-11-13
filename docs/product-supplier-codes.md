# Codigos por proveedor

Cada producto admite varios proveedores diferentes. La relacion product_suppliers
guarda un code opcional de hasta 80 caracteres por proveedor, independiente del SKU
interno y de los codigos de cliente. No se repite un proveedor en el mismo producto.

La migracion 202610230001_product_supplier_codes conserva asociaciones existentes
con codigo vacio. Las llamadas antiguas sin supplier_codes conservan los codigos
guardados. Las nuevas llamadas permiten editar o vaciar el codigo explicitamente.
El guardado mantiene permisos, control de version y transaccion del catalogo.

Pruebas: node tests/suppliers.test.cjs y tests/product-supplier-codes.sql
(transaccion revertida, sin datos de prueba persistentes).

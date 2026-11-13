# Productos

Catalogo compartido entre PCP, Taasa y Jose Orozco. No contiene existencias,
costos ni movimientos de almacen. Tampoco modifica partidas de OC existentes.

- Ruta: `/productos`.
- Persistencia: `public.products`, migracion `202610080001_products.sql`.
- Codigo interno unico sin distinguir mayusculas, descripcion y unidad obligatorios.
- Categoria, marca, modelo y notas opcionales; estado activo/inactivo.
- Las acciones del servidor verifican usuario y `app_admins`; RLS exige administrador.
- Edicion y eliminacion comparan `updated_at` para evitar sobrescribir otra sesion.
- Eliminacion permanente con confirmacion. Al incorporar movimientos, las referencias
  a productos deben usar claves foraneas con `ON DELETE RESTRICT`.
- Las futuras existencias compartidas y equivalencias de codigos por cliente son
  modulos separados, aun no implementados.

Verificacion: `node tests/products.test.cjs`, `npm run build`. Alta, edicion y
desactivacion comprobadas en navegador y Supabase con un registro temporal eliminado
al finalizar; unicidad y lectura sin sesion verificadas en transaccion revertida.

# Catalogos en Supabase

## Instalacion

Ejecutar una vez `supabase/migrations/202610070002_import_catalogs.sql` despues
de la migracion inicial. Se agrega una funcion transaccional con permisos de
invocador y una restriccion de nombres de cliente sin duplicados por mayusculas.
No se necesita service_role ni desactivar RLS.

## Importar datos capturados

1. Entrar como administrador desde el mismo navegador, host y puerto usados
   antes de la migracion. `localhost` y `127.0.0.1` tienen almacenamiento separado.
2. Abrir Clientes > Importar datos locales.
3. Revisar cantidades. Descargar el respaldo JSON y confirmar que se guardo.
4. Importar a Supabase. Solo se marca exito despues de la respuesta de la base.
5. Revisar Mis empresas y Orden de compra. No borrar el almacenamiento local
   hasta confirmar que los datos y asociaciones son correctos.

El respaldo contiene los valores originales de las claves del catalogo y las
razones sociales. No contiene cookies, contrasenas ni tokens. Guardarlo de forma
privada: puede contener datos fiscales y de contacto.

Si no existe catalogo local se ofrece el catalogo inicial, sin asociaciones
inventadas. Un catalogo local vacio se conserva vacio. Los respaldos se pueden
abrir desde otro navegador con el boton Abrir respaldo. Nunca se sobrescribe el
almacenamiento local al abrirlos.

## Conflictos y reintentos

La importacion es una unica transaccion: cualquier error revierte todos los
cambios. Los IDs originales se conservan; asociaciones antiguas por nombre se
resuelven al ID antes de enviar. Clientes identicos y asociaciones existentes
no se duplican. Clientes distintos con el mismo ID o nombre cancelan la
importacion. Una razon social solo se completa si esta vacia o coincide con el
respaldo. Las asociaciones se agregan, nunca se eliminan durante la importacion.

Si la red falla despues de guardar, la respuesta puede no llegar: reintentar con
el mismo respaldo es seguro. Si hubo ediciones posteriores, el conflicto debe
resolverse revisando ambas versiones; no se sobrescriben datos automaticamente.

## Operacion

Clientes usa guardado explicito. Mis empresas usa Guardar cambios para sus datos
generales; las asociaciones se guardan individualmente. Cambios concurrentes
en datos generales o clientes se detectan mediante updated_at. No se puede
eliminar un cliente asociado (clave foranea restrict).

Las pestañas comparten avisos de actualizacion, y se consulta de nuevo al cambiar
de ruta, recuperar el foco y cada 30 segundos en una ventana visible. No se usa
el catalogo local como respaldo automatico si falla la conexion.

El acceso sigue limitado a administradores. Los roles operativos de solo lectura
o edicion por empresa requieren una etapa posterior de interfaz y autorizacion.

Pruebas de modelo: `node tests/catalog-model.test.cjs`.

## Verificacion realizada (2026-10-07)

- Compilacion de produccion y pruebas de modelo correctas.
- Acceso con la cuenta administradora en el navegador de Codex.
- Descarga del respaldo antes de habilitar la importacion.
- Importacion real del cliente temporal `qa-catalog-20261007`.
- Segunda importacion identica: cero registros nuevos, sin duplicados.
- Edicion de nombre/contacto confirmada por consulta de la base.
- Asociacion con PCP confirmada en la base y en el selector de ordenes.
- Cambio a Taasa: el cliente de PCP no aparece en el selector.
- Respaldo con un registro nuevo seguido de un conflicto: se cancela y
  `qa-rollback-20261007` no existe en la base, verificando rollback completo.
- Eliminar un cliente asociado queda bloqueado en la interfaz y por la FK.

Los datos reales del navegador original NO se importaron en estas pruebas.

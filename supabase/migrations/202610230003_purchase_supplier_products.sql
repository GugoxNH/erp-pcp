begin;
do $migration$
declare definition text; marker text:='if not found then raise exception ''PURCHASE_PRODUCT'';end if;';
begin
select pg_get_functiondef('public.save_supplier_purchase(jsonb)'::regprocedure) into definition;
if position(marker in definition)=0 then raise exception 'Unexpected purchase function';end if;
definition:=replace(definition,marker,marker||'
  perform 1 from public.product_suppliers ps where ps.product_id=product.id and ps.supplier_id=supplier.id for share;
  if not found then raise exception ''PURCHASE_VENDOR_PRODUCT'';end if;');
execute definition;
end $migration$;
commit;

"use server";
import { requireAccess } from "../lib/access-server";
import { createAdminClient } from "../lib/supabase/admin";
import { hasPermission, validateAccount, validateEmail, type AccessProfile, type UserAccount } from "../lib/access";
import type { ActionResult } from "../lib/catalog-model";
async function requireUserEditing(){const context=await requireAccess("users");if(!hasPermission(context.profile,"edit_users"))throw new Error("No tienes el permiso Edición de usuarios.");return context;}
async function result<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try { return {ok:true,value:await fn()}; }
  catch(e) { return {ok:false,error:e instanceof Error ? e.message : "No se pudo completar la operación."}; }
}
export async function getUsers(): Promise<ActionResult<{users:UserAccount[];self:string;configured:boolean}>> {
  return result(async () => {
    const {db,user}=await requireAccess("users"); const users:AccessProfile[]=[];
    for(let offset=0;;offset+=1000) {
      const {data,error}=await db.from("app_profiles").select("*").order("username").range(offset,offset+999);
      if(error) throw new Error("No se pudieron consultar los usuarios.");
      users.push(...data as AccessProfile[]); if(data.length<1000) break;
    }
    const configured=!!process.env.SUPABASE_SECRET_KEY;
    if(!configured) return {users:users.map(p=>({...p,email:""})),self:user.id,configured};
    const admin=createAdminClient();
    const accounts:UserAccount[]=[];
    for(const profile of users) {
      const {data,error}=await admin.auth.admin.getUserById(profile.user_id);
      if(error) throw new Error("No se pudieron consultar los correos. Actualiza el listado.");
      const email=data.user.email ?? "";
      accounts.push({...profile,email:email.endsWith("@users.erp.invalid")?"":email});
    }
    return {users:accounts,self:user.id,configured};
  });
}
export async function createUser(input:unknown,password:string):Promise<ActionResult<null>> {
  return result(async () => {
    const {user}=await requireUserEditing();
    const values=validateAccount(input);
    const email=validateEmail((input as Record<string,unknown>).email);
    if(typeof password!=="string" || password.length<12 || password.length>128) throw new Error("La contraseña debe tener entre 12 y 128 caracteres.");
    const admin=createAdminClient();
    const {data:existing,error:lookupError}=await admin.from("app_profiles").select("user_id").eq("username",values.username).maybeSingle();
    if(lookupError) throw new Error("No se pudo comprobar el nombre de usuario.");
    if(existing) throw new Error("Ese nombre de usuario ya está registrado.");
    const {error}=await admin.auth.admin.createUser({email,password,email_confirm:true,
      app_metadata:{erp_profile:{username:values.username,full_name:values.full_name,sections:values.sections,edit_warehouse:values.edit_warehouse,edit_users:values.edit_users,edit_orders:values.edit_orders,created_by:user.id}}});
    if(error) throw new Error(["email_exists","email_exists_error","user_already_exists"].includes(error.code ?? "") ? "Ese correo electrónico ya está registrado." : "No se pudo crear el usuario. Revisa el correo y la contraseña e intenta nuevamente.");
    return null;
  });
}
export async function editUser(id:string,version:string,input:unknown):Promise<ActionResult<null>> {
  return result(async () => {
    const {db}=await requireUserEditing(); const values=validateAccount(input);
    if(!id || !version) throw new Error("Actualiza el listado antes de editar.");
    const {error}=await db.rpc("update_user_access",{target:id,expected:version,display_name:values.full_name,grants:values.sections,enabled:values.active,warehouse_edit:values.edit_warehouse,users_edit:values.edit_users,orders_edit:values.edit_orders});
    if(error) throw new Error(error.message.includes("USER_FORBIDDEN") ? "No tienes el permiso Edición de usuarios." : error.code==="PGRST202" ? "Falta actualizar la función de usuarios en Supabase." : error.message.includes("USER_PROTECTED") ? "No puedes modificar tu propia cuenta ni la del desarrollador." : error.message.includes("USER_CONFLICT") ? "El usuario cambió en otra sesión. Actualiza el listado." : "No se pudieron actualizar los accesos.");
    return null;
  });
}
export async function updateUserEmail(id:string,version:string,previousEmail:string,value:string):Promise<ActionResult<string>> {
  return result(async()=>{
    const {db,user}=await requireUserEditing();
    const email=validateEmail(value);
    const {data:profile,error}=await db.from("app_profiles").select("*").eq("user_id",id).single();
    if(error || !profile || profile.updated_at!==version) throw new Error("El usuario cambió. Cierra el formulario y actualiza el listado.");
    if(profile.is_developer || id===user.id) throw new Error("No puedes modificar tu propia cuenta ni la del desarrollador.");
    const admin=createAdminClient();
    const {data:current,error:readError}=await admin.auth.admin.getUserById(id);
    if(readError) throw new Error("No se pudo consultar el correo actual.");
    const currentEmail=current.user.email ?? "";
    if((currentEmail.endsWith("@users.erp.invalid")?"":currentEmail)!==previousEmail) throw new Error("El correo cambió. Actualiza el listado.");
    const {error:saveError}=await admin.auth.admin.updateUserById(id,{email,email_confirm:true});
    if(saveError) throw new Error(["email_exists","user_already_exists"].includes(saveError.code ?? "")?"Ese correo electrónico ya está registrado.":"No se pudo actualizar el correo.");
    return email;
  });
}

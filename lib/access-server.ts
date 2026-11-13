import "server-only";
import { createClient } from "./supabase/server";
import { canAccess, type AccessProfile, type Section } from "./access";
import { CatalogError } from "./catalog-model";
export async function requireAccess(section?: Section) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new CatalogError("Tu sesión venció. Vuelve a iniciar sesión.");
  const { data, error: accessError } = await db.from("app_profiles").select("*").eq("user_id", user.id).maybeSingle();
  const profile = data as AccessProfile | null;
  if (accessError || !profile?.active || (section && !canAccess(profile, section))) throw new CatalogError("No tienes acceso a esta sección.");
  return { db, user, profile };
}

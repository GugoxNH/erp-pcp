import { redirect } from "next/navigation";
import AuthFrame from "../auth/auth-frame";
import AuthForm from "../auth/auth-form";
import { createClient } from "../../lib/supabase/server";
import { safeNext } from "../../lib/supabase/config";
import { firstPath, type AccessProfile } from "../../lib/access";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && !params.error && !params.updated) {
    const { data: profile } = await supabase.from("app_profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (profile?.active) redirect(firstPath(profile as AccessProfile));
  }
  return <AuthFrame><AuthForm next={safeNext(params.next)} initialError={params.error === "access" ? "Tu usuario no tiene acceso habilitado. Contacta al administrador." : ""} message={params.updated === "1" ? "Contraseña actualizada. Inicia sesión con tu nueva contraseña." : ""} /></AuthFrame>;
}

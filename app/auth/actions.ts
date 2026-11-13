"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { REMEMBER_COOKIE, safeNext } from "../../lib/supabase/config";
import { createAdminClient } from "../../lib/supabase/admin";
import { canAccess, firstPath, sections, type AccessProfile } from "../../lib/access";

export type AuthState = { error?: string; success?: string };
const unavailable = "No pudimos conectar con el servicio. Intenta de nuevo.";
const emailIsValid = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export async function login(_state: AuthState, form: FormData): Promise<AuthState> {
  const identifier = String(form.get("email") ?? "").trim().toLowerCase();
  let email = identifier;
  const password = String(form.get("password") ?? "");
  if ((!emailIsValid(identifier) && !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(identifier)) || !password || password.length > 1024) return { error: "Introduce tu usuario o correo y contraseña." };
  let destination = safeNext(form.get("next"));
  try {
    if (!identifier.includes("@")) {
      const admin = createAdminClient();
      const { data: profile } = await admin.from("app_profiles").select("user_id").eq("username",identifier).maybeSingle();
      email = `${identifier}@users.erp.invalid`;
      if (profile) {
        const { data } = await admin.auth.admin.getUserById(profile.user_id);
        email = data.user?.email ?? email;
      }
    }
    const remember = form.get("remember") === "on";
    (await cookies()).set(REMEMBER_COOKIE, remember ? "1" : "0", {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
      ...(remember ? { maxAge: 60 * 60 * 24 * 365 } : {}),
    });
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { error: error?.status === 429 ? "Demasiados intentos. Espera unos minutos antes de volver a intentar." : "No pudimos iniciar sesión. Revisa tu correo y contraseña." };
    const { data: profile, error: accessError } = await supabase.from("app_profiles").select("*").eq("user_id", data.user.id).maybeSingle();
    if (!profile?.active || accessError) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: "Tu usuario no tiene acceso habilitado. Contacta al administrador." };
    }
    const section = sections.find(s => s.path === destination);
    if (destination!=="/perfil"&&(!section || !canAccess(profile as AccessProfile,section.id))) destination=firstPath(profile as AccessProfile);
  } catch { return { error: unavailable }; }
  redirect(destination);
}

export async function logout(_state: AuthState, _form: FormData): Promise<AuthState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return { error: "No se pudo cerrar la sesión. Intenta de nuevo." };
    (await cookies()).delete(REMEMBER_COOKIE);
  } catch { return { error: unavailable }; }
  redirect("/login");
}

export async function requestPasswordReset(_state: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  if (!emailIsValid(email)) return { error: "Introduce un correo electrónico válido." };
  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get("origin");
    if (!origin) return { error: unavailable };
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("/auth/callback", origin).toString(),
    });
    if (error) return { error: error.status === 429 ? "Espera unos minutos antes de solicitar otro enlace." : "No pudimos enviar el enlace. Intenta de nuevo más tarde." };
    return { success: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Ábrelo en este mismo navegador." };
  } catch { return { error: unavailable }; }
}

export async function updatePassword(_state: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 10 || password.length > 128) return { error: "Usa entre 10 y 128 caracteres." };
  if (password !== form.get("confirmPassword")) return { error: "Las contraseñas no coinciden." };
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (!user || userError) return { error: "El enlace venció. Solicita uno nuevo." };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.code === "same_password" ? "Elige una contraseña diferente a la anterior." : "No se pudo actualizar. Usa una contraseña más segura o solicita un nuevo enlace." };
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) return { success: "Contraseña actualizada. Vuelve al inicio de sesión para continuar." };
    (await cookies()).delete(REMEMBER_COOKIE);
  } catch { return { error: unavailable }; }
  redirect("/login?updated=1");
}

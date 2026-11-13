import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { REMEMBER_COOKIE, requestOrigin, supabaseConfig } from "./lib/supabase/config";
import { canAccess, firstPath, sections, type AccessProfile } from "./lib/access";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseConfig();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) {
          const sessionOnly = request.cookies.get(REMEMBER_COOKIE)?.value !== "1" && options.maxAge !== 0;
          response.cookies.set(name, value, {
            ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
            ...(sessionOnly ? { maxAge: undefined, expires: undefined } : {}),
          });
        }
        for (const [name, value] of Object.entries(headers ?? {})) response.headers.set(name, value);
      },
    },
  });
  const { data, error } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const publicRoute = path === "/login" || path === "/recuperar-contrasena" || path.startsWith("/auth/");
  if ((!data.user || error) && !publicRoute) {
    const login = new URL("/login", requestOrigin(request));
    login.searchParams.set("next", path);
    const redirect = NextResponse.redirect(login);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  const section = sections.find(s => s.path === path);
  if (data.user && section) {
    const { data: profile } = await supabase.from("app_profiles").select("*").eq("user_id", data.user.id).maybeSingle();
    if (!canAccess(profile as AccessProfile | null, section.id)) {
      const denied = NextResponse.redirect(new URL(profile?.active ? firstPath(profile as AccessProfile) : "/login?error=access", requestOrigin(request)));
      for (const cookie of response.cookies.getAll()) denied.cookies.set(cookie);
      denied.headers.set("Cache-Control", "private, no-store");
      return denied;
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brands/|ocr/|pdf-fonts/|pdf-wasm/|pdf.worker.min.mjs).*)"],
};

export const REMEMBER_COOKIE = "warehouse.auth.remember";

export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration missing");
  return { url, key };
}

export function safeNext(value: unknown) {
  return typeof value === "string" && ["/", "/perfil", "/clientes", "/mis-empresas", "/orden-de-compra", "/servicios", "/productos", "/usuarios"].includes(value) ? value : "/";
}

export function requestOrigin(request: { url: string; headers: Headers }) {
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url);
  // Next's development server may normalize request.url to localhost.
  // Preserve the browser's host so redirects retain its PKCE/session cookies.
  if (!process.env.NEXT_PUBLIC_SITE_URL) origin.host = request.headers.get("host") || origin.host;
  return origin.origin;
}

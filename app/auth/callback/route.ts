import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";

function redirectTo(path: string) {
  // Relative Location preserves the browser origin behind Next/Vercel proxies.
  return new NextResponse(null, { status: 303, headers: {
    Location: path, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  } });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return redirectTo("/actualizar-contrasena");
    } catch { /* Invalid or expired links return to recovery without exposing tokens. */ }
  }
  return redirectTo("/recuperar-contrasena?error=expired");
}

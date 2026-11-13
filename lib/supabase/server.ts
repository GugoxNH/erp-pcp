import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { REMEMBER_COOKIE, supabaseConfig } from "./config";

export async function createClient() {
  const store = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values) {
            const sessionOnly = store.get(REMEMBER_COOKIE)?.value !== "1" && options.maxAge !== 0;
            store.set(name, value, {
              ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
              ...(sessionOnly ? { maxAge: undefined, expires: undefined } : {}),
            });
          }
        } catch {
          // Rendering cannot write cookies; proxy refreshes them before rendering.
        }
      },
    },
  });
}

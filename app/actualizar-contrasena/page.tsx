import { redirect } from "next/navigation";
import AuthFrame from "../auth/auth-frame";
import AuthForm from "../auth/auth-form";
import { createClient } from "../../lib/supabase/server";

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user || error) redirect("/recuperar-contrasena?error=expired");
  return <AuthFrame><AuthForm mode="update" /></AuthFrame>;
}

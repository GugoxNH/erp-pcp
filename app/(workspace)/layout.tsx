import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import WorkspaceShell from "../workspace-shell";
import { CatalogProvider } from "../catalog-provider";
import type { AccessProfile } from "../../lib/access";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: profile } = await supabase.from("app_profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile?.active) redirect("/login?error=access");
  return <CatalogProvider><WorkspaceShell access={profile as AccessProfile} userEmail={profile.full_name}>{children}</WorkspaceShell></CatalogProvider>;
}

import AuthFrame from "../auth/auth-frame";
import AuthForm from "../auth/auth-form";

export default async function RecoverPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthFrame><AuthForm mode="recover" initialError={error === "expired" ? "El enlace venció o no es válido. Solicita uno nuevo y ábrelo en este navegador." : ""} /></AuthFrame>;
}

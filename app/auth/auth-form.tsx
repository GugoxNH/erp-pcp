"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { login, requestPasswordReset, updatePassword, type AuthState } from "./actions";

export default function AuthForm({ mode = "login", next = "/", message = "", initialError = "" }: { mode?: "login" | "recover" | "update"; next?: string; message?: string; initialError?: string }) {
  const [visible, setVisible] = useState(false);
  const action = mode === "recover" ? requestPasswordReset : mode === "update" ? updatePassword : login;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, { error: initialError });
  const title = mode === "recover" ? "Recuperar contraseña" : mode === "update" ? "Nueva contraseña" : "Iniciar sesión";
  return <>
    <h1>{title}</h1>
    <p className="auth-subtitle">{mode === "recover" ? "Te enviaremos un enlace a tu correo" : mode === "update" ? "Elige una contraseña segura para tu cuenta" : "Ingresa tus credenciales para continuar"}</p>
    <form action={formAction} className="auth-form" aria-busy={pending}>
      <input type="hidden" name="next" value={next} />
      {mode !== "update" && <div className="auth-field"><label htmlFor="email">{mode === "login" ? "Usuario o correo electrónico" : "Correo electrónico"}</label><div className="auth-input"><Mail size={17} /><input id="email" name="email" type={mode === "login" ? "text" : "email"} autoComplete="username" placeholder={mode === "login" ? "Nombre de usuario" : "usuario@empresa.com"} required maxLength={254} disabled={pending} autoCapitalize="none" spellCheck={false} /></div></div>}
      {mode !== "recover" && <div className="auth-field"><label htmlFor="password">{mode === "update" ? "Nueva contraseña" : "Contraseña"}</label><div className="auth-input"><LockKeyhole size={17} /><input id="password" name="password" type={visible ? "text" : "password"} autoComplete={mode === "update" ? "new-password" : "current-password"} placeholder={mode === "update" ? "Al menos 10 caracteres" : "Ingresa tu contraseña"} required minLength={mode === "update" ? 10 : 1} maxLength={mode === "update" ? 128 : 1024} disabled={pending} /><button className="auth-eye" type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} title={visible ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={visible}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>}
      {mode === "update" && <div className="auth-field"><label htmlFor="confirmPassword">Confirmar contraseña</label><div className="auth-input"><LockKeyhole size={17} /><input id="confirmPassword" name="confirmPassword" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} disabled={pending} placeholder="Repite tu nueva contraseña" /></div></div>}
      {mode === "login" && <div className="auth-options"><label><input name="remember" type="checkbox" defaultChecked disabled={pending} />Recordarme</label><Link href="/recuperar-contrasena">¿Olvidaste tu contraseña?</Link></div>}
      {state.error && <p className="auth-feedback auth-error" role="alert">{state.error}</p>}
      {!state.error && (state.success || message) && <p className="auth-feedback auth-success" role="status">{state.success || message}</p>}
      <button className="auth-submit" disabled={pending || (mode === "recover" && !!state.success)} type="submit">{pending ? <><LoaderCircle size={18} className="auth-spinner" />Procesando...</> : <>{mode === "recover" ? "Enviar enlace" : mode === "update" ? "Guardar contraseña" : "Ingresar"}<ArrowRight size={18} /></>}</button>
      {mode !== "login" && <Link className="auth-back" href="/login"><ArrowLeft size={16} />Volver a iniciar sesión</Link>}
    </form>
  </>;
}

"use client";
import Swal from "sweetalert2";

export const alerts = Swal.mixin({
  confirmButtonText: "Continuar", cancelButtonText: "Cancelar",
  confirmButtonColor: "#1663c7", cancelButtonColor: "#526477",
  heightAuto: false,
  customClass: { container: "erp-alert-container", popup: "erp-alert" },
});

export async function confirmAction(text: string, confirmButtonText = "Continuar") {
  // Native dialogs are in the top layer; render nested confirmations inside them.
  const target=document.querySelector<HTMLDialogElement>("dialog.crud-modal[open]")??document.body;
  const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const result = await alerts.fire({target,titleText: "Confirmar acción", text,
    icon: "warning", showCancelButton: true, focusCancel: true, confirmButtonText});
  if(previousFocus?.isConnected)previousFocus.focus();
  return result.isConfirmed;
}

export function showActionError(error: unknown) {
  alerts.showValidationMessage("No se pudo completar la acción.");
  const element = alerts.getValidationMessage();
  if (element) element.textContent = error instanceof Error ? error.message : "No se pudo completar la acción.";
}

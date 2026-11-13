"use client";
import {useRef,useState} from "react";
import {Trash2} from "lucide-react";
import {deleteOrder} from "./order-actions";
import {alerts,confirmAction} from "../lib/alerts";
import type {SavedOrder} from "../lib/purchase-orders";

export default function DeleteOrderButton({order,disabled,onBusy,onDeleted}:{order:SavedOrder;disabled:boolean;onBusy:(value:boolean)=>void;onDeleted:()=>void}) {
 const [pending,setPending]=useState(false);
 const active=useRef(false);
 async function open(){
  if(active.current||disabled)return;
  active.current=true;setPending(true);onBusy(true);
  try {
   if(!await confirmAction(`¿Quieres eliminar la OC ${order.number}?`))return;
   const result=await alerts.fire({
    titleText:"¿Estás seguro? Esta acción no se puede deshacer.",
    text:"Se eliminarán la orden, sus partidas y su historial. La acción quedará registrada en la bitácora.",
    icon:"warning",input:"text",inputLabel:"Para confirmar escribe ELIMINAR",
    inputAutoTrim:false,inputAttributes:{autocomplete:"off"},
    showCancelButton:true,showLoaderOnConfirm:true,
    allowOutsideClick:()=>!alerts.isLoading(),allowEscapeKey:()=>!alerts.isLoading(),
    inputValidator:value=>value==="ELIMINAR"?undefined:"Escribe exactamente ELIMINAR para continuar.",
    preConfirm:async (value:string)=>{
     try {
      const response=await deleteOrder(order.business_id,order.id,order.revision,value);
      if(!response.ok)throw new Error(response.error);
      return true;
     }catch(error){
      alerts.showValidationMessage("No se pudo eliminar la orden.");
      const message=alerts.getValidationMessage();
      if(message)message.textContent=error instanceof Error?error.message:"No se pudo eliminar la orden.";
      return false;
     }
    },
   });
   if(result.isConfirmed)onDeleted();
  }finally{active.current=false;setPending(false);onBusy(false);}
 }
 return <button type="button" className="client-secondary" disabled={disabled||pending} onClick={open}><Trash2 size={16}/>Eliminar OC</button>;
}

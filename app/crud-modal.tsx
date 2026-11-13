"use client";
import {useEffect,useRef,type ReactNode} from "react";

/** Native modal: keep form state, focus trapping and layout independent of alerts. */
export default function CrudModal({open=true,className="",labelledBy,onRequestClose,children}:{
  open?:boolean;className?:string;labelledBy:string;onRequestClose:()=>void;children:ReactNode;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const element=dialog.current;
    if(!open||!element)return;
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;
    element.showModal();document.body.style.overflow="hidden";
    return ()=>{element.close();document.body.style.overflow=overflow;previousFocus?.focus();};
  },[open]);
  return <dialog ref={dialog} className={`crud-modal ${className}`} aria-labelledby={labelledBy}
    onCancel={event=>{event.preventDefault();if(!dialog.current?.querySelector(".swal2-container"))onRequestClose();}}>
    {open&&children}
  </dialog>;
}

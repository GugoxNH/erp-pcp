"use client";
import { CalendarDays } from "lucide-react";
import { formatOrderDate, normalizeOrderDate } from "../lib/order-dates";

export default function OrderDateInput({ value, onChange, required = false, disabled = false, label }: { value: string; onChange: (value: string) => void; required?: boolean; disabled?:boolean; label: string }) {
  return <span className="order-date-input">
    <input disabled={disabled} aria-label={label} required={required} inputMode="numeric" placeholder="dd/mm/aaaa" maxLength={10} pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}" value={formatOrderDate(value)} onChange={e => {
      const raw = e.target.value;
      onChange(/^\d{2}\/\d{2}\/\d{4}$/.test(raw) ? normalizeOrderDate(raw, "manual") || raw : raw);
    }}/>
    <span className="order-calendar" title={`Elegir ${label.toLowerCase()}`}><CalendarDays size={17}/><input disabled={disabled} type="date" aria-label={`Calendario: ${label}`} min="1900-01-01" max="2199-12-31" value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""} onInput={e => onChange(e.currentTarget.value)}/></span>
  </span>;
}

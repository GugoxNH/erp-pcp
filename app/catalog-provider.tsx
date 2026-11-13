"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getCatalog } from "./catalog-actions";
import { type Catalog } from "../lib/catalog-model";

type CatalogContextValue = Catalog & { ready: boolean; error: string; refresh: () => Promise<void>; changed: () => Promise<void> };
const Context = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog>({ clients: [], businesses: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const channel = useRef<BroadcastChannel | null>(null);
  const revision = useRef(0);
  const path = usePathname();
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    try {
      const result = await getCatalog();
      if (request !== revision.current) return;
      if (!result.ok) throw new Error(result.error);
      setCatalog(result.value); setError(""); setReady(true);
    } catch (cause) {
      if (request !== revision.current) return;
      setError(cause instanceof Error ? cause.message : "No se pudo cargar Supabase."); setReady(false);
    }
  }, []);
  const changed = useCallback(async () => { channel.current?.postMessage("changed"); await refresh(); }, [refresh]);
  useEffect(() => { void refresh(); }, [refresh, path]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("warehouse.supabase.catalogs");
      channel.current.onmessage = () => { void refresh(); };
    }
    const timer = window.setInterval(visible, 30000);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => { revision.current++; clearInterval(timer); channel.current?.close(); channel.current = null; window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  return <Context.Provider value={{ ...catalog, ready, error, refresh, changed }}>{children}</Context.Provider>;
}
export function useCatalog() {
  const context = useContext(Context);
  if (!context) throw new Error("Catalog provider unavailable");
  return context;
}

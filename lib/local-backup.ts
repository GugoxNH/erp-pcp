import { businesses, businessStorageKey, parseBusinessDetails } from "./businesses";
import { CLIENTS_KEY, readClients } from "./clients";
import { type LocalSnapshot } from "./catalog-model";

export type LocalBackup = { format: "warehouse-local-backup"; version: 1; exportedAt: string; rawStorage: Record<string, string | null> };
export function captureBackup(): LocalBackup {
  const keys = [CLIENTS_KEY, "warehouse.company.v1", ...businesses.map(b => businessStorageKey(b.id))];
  return { format: "warehouse-local-backup", version: 1, exportedAt: new Date().toISOString(), rawStorage: Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])) };
}
export function snapshotFromBackup(value: unknown): LocalSnapshot {
  if (!value || typeof value !== "object") throw new Error("Respaldo no válido.");
  const backup = value as LocalBackup;
  if (backup.format !== "warehouse-local-backup" || backup.version !== 1 || !backup.rawStorage || typeof backup.rawStorage !== "object") throw new Error("Formato de respaldo no reconocido.");
  const read = (key: string) => {
    const raw = backup.rawStorage[key];
    if (raw !== null && typeof raw !== "string") throw new Error(`El respaldo no contiene un valor válido para ${key}.`);
    return raw;
  };
  const clients = readClients(read(CLIENTS_KEY));
  const entries: LocalSnapshot["businesses"] = [];
  for (const business of businesses) {
    const raw = read(businessStorageKey(business.id));
    if (raw === null) continue;
    const source = JSON.parse(raw);
    if (source.clients !== undefined && (!Array.isArray(source.clients) || source.clients.some((id: unknown) => typeof id !== "string"))) throw new Error(`Las asociaciones de ${business.name} no son válidas.`);
    entries.push({ id: business.id, details: parseBusinessDetails(raw) });
  }
  return { version: 1, exportedAt: backup.exportedAt, clients, businesses: entries };
}
export function downloadBackup(backup: LocalBackup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `respaldo-almacen-${backup.exportedAt.replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

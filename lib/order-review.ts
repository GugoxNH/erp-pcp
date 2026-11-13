// Summarize repeated warnings for display without changing the extraction record.
export function summarizeOrderWarnings(warnings: string[]): string[] {
  const groups = new Map<string, { message: string; positions: Set<string> }>();
  for (const warning of warnings) {
    const match = warning.match(/^(?:(.+?), )?partida (\d+)(?: \(página \d+\))?: (.+)$/i);
    if (!match) {
      if (!groups.has(warning)) groups.set(warning, { message: warning, positions: new Set() });
      continue;
    }
    const [, company, position, detail] = match;
    let message = detail;
    if (company === "PolloQro" && detail.startsWith("se intercambiaron CANT. y UNITARIO por posible inversión de columnas.")) {
      message = "se intercambiaron CANT. y UNITARIO por posible inversión de columnas. El importe se conserva; favor de verificar.";
    }
    if (/^la fecha de entrega \d{2}\/\d{2}\/\d{4} es anterior a la emisión de la OC\. Se conserva la fecha\.$/.test(detail)) {
      message = "la fecha de entrega es anterior a la emisión de la OC. Se conserva la fecha; favor de verificar.";
    }
    message = company ? `${company}: ${message}` : message[0].toUpperCase() + message.slice(1);
    const key = `partidas:${message}`;
    if (!groups.has(key)) groups.set(key, { message, positions: new Set() });
    groups.get(key)!.positions.add(position);
  }
  return [...groups.values()].map(({ message, positions }) => {
    if (!positions.size) return message;
    const list = [...positions].sort((a, b) => Number(a) - Number(b)).join(", ");
    return `${message} ${positions.size === 1 ? "Partida" : "Partidas"} ${list}.`;
  });
}

const months: Record<string, number> = { ene: 1, enero: 1, jan: 1, january: 1, feb: 2, febrero: 2, february: 2, mar: 3, marzo: 3, march: 3, abr: 4, abril: 4, apr: 4, april: 4, may: 5, mayo: 5, jun: 6, junio: 6, june: 6, jul: 7, julio: 7, july: 7, ago: 8, agosto: 8, aug: 8, august: 8, sep: 9, sept: 9, septiembre: 9, september: 9, oct: 10, octubre: 10, october: 10, nov: 11, noviembre: 11, november: 11, dic: 12, diciembre: 12, dec: 12, december: 12 };

function iso(year: number, month: number, day: number) {
  if (year < 100) year += 2000;
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${value}T12:00:00Z`);
  return year >= 1900 && year <= 2199 && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "";
}
export function normalizeOrderDate(value: string, template = ""): string {
  const text = value.trim().toLowerCase().replace(/\bde\b/g, " ").replace(/[,]/g, " ").replace(/\s+/g, " ");
  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})[-/.\s]+([a-z]+)[-/.\s]+(\d{2}|\d{4})$/);
  if (m) return iso(+m[3], months[m[2]] ?? 0, +m[1]);
  m = text.match(/^([a-z]+)[-/.\s]+(\d{1,2})[-/.\s]+(\d{2}|\d{4})$/);
  if (m) return iso(+m[3], months[m[1]] ?? 0, +m[2]);
  m = text.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2}|\d{4})$/);
  if (!m) return "";
  const first = +m[1], second = +m[2];
  // Taylor originals include 4/24/2026 and 8/21/2026 in the Delivery column.
  if (["MEI", "Sherwin", "Hexpol", "Taylor farms"].includes(template)) return iso(+m[3], first, second);
  return template !== "manual" && first <= 12 && second > 12 ? iso(+m[3], first, second) : iso(+m[3], second, first);
}
export function formatOrderDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : value;
}

export function formatCurrency(value: number | null | undefined): string {
  const v = typeof value === "number" ? value : 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

export function parseCurrency(input: string): number {
  let s = String(input ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let normalized = s;
  if (hasDot && hasComma) {
    // Último separador é o decimal
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastComma > lastDot) {
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Vírgula é decimal (pt-BR)
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    // Só ponto: se houver mais de um ou 3 dígitos após o último, é separador de milhar
    const parts = s.split(".");
    const last = parts[parts.length - 1];
    if (parts.length > 2 || last.length === 3) {
      normalized = s.replace(/\./g, "");
    }
    // caso contrário, mantém como decimal (ex.: "90.00")
  }
  const n = parseFloat(normalized);
  if (isNaN(n)) return 0;
  return neg ? -n : n;
}

export function formatDateBR(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date + (date.length === 10 ? "T12:00:00" : "")) : date;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T12:00:00");
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
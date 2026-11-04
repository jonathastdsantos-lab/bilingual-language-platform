export const DEFAULT_TIMEZONE = "America/Sao_Paulo";
export const DEFAULT_CURRENCY = "BRL";

/**
 * Formata valores monetários sempre em Real Brasileiro (BRL),
 * respeitando a localização de exibição (pt-BR ou en-US).
 */
export function formatCurrencyBRL(value: number, locale = "pt-BR"): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: DEFAULT_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

/**
 * Retorna a chave de data (YYYY-MM-DD) no fuso horário America/Sao_Paulo
 * para garantir consistência de indicadores diários e mensais.
 */
export function toSaoPauloDateKey(input: Date | string, timeZone = DEFAULT_TIMEZONE): string {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/**
 * Formata data e hora no fuso horário America/Sao_Paulo.
 */
export function formatSaoPauloDateTime(
  input: Date | string,
  locale = "pt-BR",
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  },
  timeZone = DEFAULT_TIMEZONE,
): string {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
}

/**
 * Calcula o intervalo [start, end] para os filtros de período do Dashboard.
 */
export function getDashboardPeriodRange(
  period: "today" | "7d" | "month" | "30d" | "90d",
  referenceDate: Date = new Date(),
): { start: Date; end: Date; daysCount: number } {
  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);

  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);

  switch (period) {
    case "today":
      return { start, end, daysCount: 1 };
    case "7d":
      start.setDate(start.getDate() - 6);
      return { start, end, daysCount: 7 };
    case "month": {
      const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0);
      const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999);
      const diffDays = Math.max(1, Math.round((monthEnd.getTime() - monthStart.getTime()) / 86_400_000));
      return { start: monthStart, end: monthEnd, daysCount: diffDays };
    }
    case "90d":
      start.setDate(start.getDate() - 89);
      return { start, end, daysCount: 90 };
    case "30d":
    default:
      start.setDate(start.getDate() - 29);
      return { start, end, daysCount: 30 };
  }
}


import { isValidCPF } from "@/lib/i18n";

export { isValidCPF };

/**
 * Valida CNPJ (14 dígitos com dígitos verificadores oficiais).
 */
export function isValidCNPJ(raw: string): boolean {
  const c = raw.replace(/\D/g, "");
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    const sum = weights.reduce((acc, w, idx) => acc + Number(base[idx]) * w, 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calcDigit(c.slice(0, 12), w1);
  const d2 = calcDigit(c.slice(0, 12) + String(d1), w2);

  return d1 === Number(c[12]) && d2 === Number(c[13]);
}

export function formatCPF(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11) return raw;
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function formatCNPJ(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "");
  if (d.length !== 14) return raw;
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/**
 * Verifica se há sobreposição de intervalo de horários [startA, endA) e [startB, endB).
 */
export function hasTimeOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB;
}


import type {
  CategoryDreLine,
  ClinicalDreReport,
  FinancialEntry,
  ProfessionalCommissionSummary,
} from "@/types";

const DIRECT_CLINICAL_COST_CATEGORIES = new Set([
  "Material Odontológico",
  "Laboratório de Prótese",
]);

const COMMISSION_EXPENSE_CATEGORY = "Comissão de Profissionais";
const TAX_EXPENSE_CATEGORY = "Impostos / Taxas";

/**
 * Calcula o Demonstrativo de Resultado do Exercício (DRE Clínico) a partir dos
 * lançamentos financeiros quitados (regime de caixa) e das comissões apuradas.
 */
export function calculateClinicalDRE(
  entries: Pick<FinancialEntry, "entry_type" | "status" | "category" | "amount">[],
  commissions: Pick<ProfessionalCommissionSummary, "realizedCommission">[] = [],
): ClinicalDreReport {
  const paidEntries = entries.filter((e) => e.status === "paid");

  let grossRealizedRevenue = 0;
  let directClinicalCosts = 0;
  let explicitCommissionExpenses = 0;
  let administrativeExpenses = 0;
  let taxesAndFees = 0;

  const incomeMap = new Map<string, number>();
  const expenseMap = new Map<string, number>();

  for (const e of paidEntries) {
    const val = Math.max(0, Number(e.amount) || 0);
    if (e.entry_type === "income") {
      grossRealizedRevenue += val;
      incomeMap.set(e.category, (incomeMap.get(e.category) ?? 0) + val);
    } else {
      expenseMap.set(e.category, (expenseMap.get(e.category) ?? 0) + val);
      if (DIRECT_CLINICAL_COST_CATEGORIES.has(e.category)) {
        directClinicalCosts += val;
      } else if (e.category === COMMISSION_EXPENSE_CATEGORY) {
        explicitCommissionExpenses += val;
      } else if (e.category === TAX_EXPENSE_CATEGORY) {
        taxesAndFees += val;
      } else {
        administrativeExpenses += val;
      }
    }
  }

  const calculatedCommissions = commissions.reduce(
    (acc, c) => acc + Math.max(0, Number(c.realizedCommission) || 0),
    0,
  );

  // Usa o maior valor entre lançamentos explícitos de comissão pagos e a comissão apurada sobre receitas
  const professionalCommissions = Number(
    Math.max(explicitCommissionExpenses, calculatedCommissions).toFixed(2),
  );

  grossRealizedRevenue = Number(grossRealizedRevenue.toFixed(2));
  directClinicalCosts = Number(directClinicalCosts.toFixed(2));
  administrativeExpenses = Number(administrativeExpenses.toFixed(2));
  taxesAndFees = Number(taxesAndFees.toFixed(2));

  const contributionMargin = Number(
    (grossRealizedRevenue - directClinicalCosts - professionalCommissions).toFixed(2),
  );
  const contributionMarginPct =
    grossRealizedRevenue > 0
      ? Number(((contributionMargin / grossRealizedRevenue) * 100).toFixed(1))
      : 0;

  const netOperatingResult = Number(
    (contributionMargin - administrativeExpenses - taxesAndFees).toFixed(2),
  );
  const netMarginPct =
    grossRealizedRevenue > 0
      ? Number(((netOperatingResult / grossRealizedRevenue) * 100).toFixed(1))
      : 0;

  const totalExpenses = Array.from(expenseMap.values()).reduce((s, v) => s + v, 0);

  const incomeByCategory: CategoryDreLine[] = Array.from(incomeMap.entries())
    .map(([category, amount]) => ({
      category,
      amount: Number(amount.toFixed(2)),
      sharePct:
        grossRealizedRevenue > 0
          ? Number(((amount / grossRealizedRevenue) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const expenseByCategory: CategoryDreLine[] = Array.from(expenseMap.entries())
    .map(([category, amount]) => ({
      category,
      amount: Number(amount.toFixed(2)),
      sharePct:
        totalExpenses > 0 ? Number(((amount / totalExpenses) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    grossRealizedRevenue,
    directClinicalCosts,
    professionalCommissions,
    contributionMargin,
    contributionMarginPct,
    administrativeExpenses,
    taxesAndFees,
    netOperatingResult,
    netMarginPct,
    incomeByCategory,
    expenseByCategory,
  };
}

/**
 * Serializa linhas tabulares em CSV compatível com Excel (UTF-8 com BOM e separador ';').
 */
export function serializeRowsToCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const escapeCell = (cell: string | number | null | undefined): string => {
    const raw = cell === null || cell === undefined ? "" : String(cell);
    const cleaned = raw.replace(/\r?\n/g, " ");
    if (cleaned.includes(";") || cleaned.includes('"')) {
      return `"${cleaned.replace(/"/g, '""')}"`;
    }
    return cleaned;
  };

  const lines = [
    headers.map(escapeCell).join(";"),
    ...rows.map((r) => r.map(escapeCell).join(";")),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

/**
 * Dispara o download de um arquivo CSV no navegador do usuário.
 */
export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): void {
  const csvContent = serializeRowsToCsv(headers, rows);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}


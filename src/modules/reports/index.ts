import type {
  CategoryDreLine,
  ClinicalDreReport,
  FinancialEntry,
  ProfessionalCommissionSummary,
  ProcedureAbcClass,
  ProcedureAbcItem,
  ProcedureAbcReport,
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

/**
 * Calcula a Curva ABC (Princípio de Pareto) dos procedimentos realizados na clínica.
 * Classifica os tratamentos em Classe A (80% da receita), Classe B (15%) e Classe C (5%).
 */
export function calculateProcedureAbcCurve(
  appointments: Array<{
    procedure: string | null;
    price: number | string | null;
    status: string;
  }>,
): ProcedureAbcReport {
  const validAppts = appointments.filter(
    (a) => a.status !== "cancelled" && a.status !== "no_show" && Number(a.price) > 0,
  );

  const map = new Map<string, { count: number; totalRevenue: number }>();
  let totalRevenue = 0;
  let totalProcedures = 0;

  for (const a of validAppts) {
    const name = a.procedure?.trim() || "Consulta / Avaliação Geral";
    const price = Math.max(0, Number(a.price) || 0);
    const existing = map.get(name) || { count: 0, totalRevenue: 0 };
    existing.count += 1;
    existing.totalRevenue += price;
    map.set(name, existing);
    totalRevenue += price;
    totalProcedures += 1;
  }

  totalRevenue = Number(totalRevenue.toFixed(2));

  const sorted = Array.from(map.entries())
    .map(([procedureName, data]) => ({
      procedureName,
      count: data.count,
      totalRevenue: Number(data.totalRevenue.toFixed(2)),
      averageTicket: Number((data.totalRevenue / data.count).toFixed(2)),
      revenueSharePct:
        totalRevenue > 0
          ? Number(((data.totalRevenue / totalRevenue) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  let cumulativeRevenue = 0;
  let countA = 0;
  let countB = 0;
  let countC = 0;
  let revA = 0;
  let revB = 0;
  let revC = 0;

  const items: ProcedureAbcItem[] = sorted.map((it, idx) => {
    cumulativeRevenue += it.totalRevenue;
    const cumulativeSharePct =
      totalRevenue > 0
        ? Number(((cumulativeRevenue / totalRevenue) * 100).toFixed(1))
        : 0;

    let classification: ProcedureAbcClass = "C";
    // Regra clássica de Pareto ABC:
    // O primeiro item sempre ganha A ou quem estiver na faixa de até 80% do faturamento acumulado
    if (idx === 0 || cumulativeSharePct <= 80) {
      classification = "A";
      countA += 1;
      revA += it.totalRevenue;
    } else if (cumulativeSharePct <= 95) {
      classification = "B";
      countB += 1;
      revB += it.totalRevenue;
    } else {
      classification = "C";
      countC += 1;
      revC += it.totalRevenue;
    }

    return {
      ...it,
      cumulativeSharePct: Math.min(100, cumulativeSharePct),
      classification,
    };
  });

  return {
    items,
    totalRevenue,
    totalProcedures,
    countClassA: countA,
    countClassB: countB,
    countClassC: countC,
    revenueClassA: Number(revA.toFixed(2)),
    revenueClassB: Number(revB.toFixed(2)),
    revenueClassC: Number(revC.toFixed(2)),
    shareClassA: totalRevenue > 0 ? Number(((revA / totalRevenue) * 100).toFixed(1)) : 0,
    shareClassB: totalRevenue > 0 ? Number(((revB / totalRevenue) * 100).toFixed(1)) : 0,
    shareClassC: totalRevenue > 0 ? Number(((revC / totalRevenue) * 100).toFixed(1)) : 0,
  };
}



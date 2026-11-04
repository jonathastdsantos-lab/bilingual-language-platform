import { z } from "zod";
import { assertClinicScope, normalizeSupabaseError, supabase } from "@/services/supabase";
import type {
  AttendanceIndicators,
  CashClosing,
  CashFlowSummary,
  FinancialEntry,
  FinancialEntryStatus,
  FinancialEntryType,
  FinancialIndicators,
  PaymentMethod,
  ProfessionalCommissionSummary,
} from "@/types";
import { toSaoPauloDateKey } from "@/utils/timezone";

export interface RawAppointmentMetricRow {
  starts_at: string;
  status: string;
  price: number | string;
  professional_id: string;
}

export interface ProfessionalInfo {
  id: string;
  name: string;
  color: string;
  commission_pct?: number | string;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  "pix",
  "credit_card",
  "debit_card",
  "cash",
  "bank_slip",
  "transfer",
  "insurance",
];

export const INCOME_CATEGORIES = [
  "Procedimento",
  "Orçamento / Plano",
  "Consulta / Avaliação",
  "Ortodontia / Manutenção",
  "Implante / Prótese",
  "Convênio Odontológico",
  "Outros",
] as const;

export const EXPENSE_CATEGORIES = [
  "Material Odontológico",
  "Laboratório de Prótese",
  "Comissão de Profissionais",
  "Aluguel / Condomínio",
  "Salários / Equipe",
  "Energia / Água / Internet",
  "Impostos / Taxas",
  "Manutenção de Equipamentos",
  "Outros",
] as const;

export const financialEntryFormSchema = z.object({
  entry_type: z.enum(["income", "expense"]),
  category: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2, "Informe uma descrição.").max(240),
  total_amount: z.number().positive("O valor total deve ser maior que zero."),
  payment_method: z.enum(["pix", "credit_card", "debit_card", "cash", "bank_slip", "transfer", "insurance"]),
  status: z.enum(["pending", "paid", "overdue", "cancelled"]),
  first_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de vencimento inválida."),
  installments: z.number().int().min(1).max(24).default(1),
  patient_id: z.string().uuid().nullable().optional(),
  professional_id: z.string().uuid().nullable().optional(),
  unit_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export interface GeneratedInstallmentRow {
  clinic_id: string;
  unit_id: string | null;
  patient_id: string | null;
  professional_id: string | null;
  entry_type: FinancialEntryType;
  category: string;
  description: string;
  amount: number;
  payment_method: PaymentMethod;
  status: FinancialEntryStatus;
  due_date: string;
  paid_at: string | null;
  installment_number: number;
  total_installments: number;
  notes: string | null;
}

/**
 * Calcula os indicadores financeiros reais a partir das consultas do período.
 * Não utiliza dados fictícios: quando não há consultas, retorna zeros exatos.
 */
export function calculateFinancialIndicators(
  appointments: RawAppointmentMetricRow[],
  professionals: ProfessionalInfo[],
  periodStart: Date,
  periodEnd: Date,
  now: Date = new Date(),
): FinancialIndicators {
  const todayKey = toSaoPauloDateKey(now);
  const profCommissionMap = new Map<string, number>();
  for (const p of professionals) {
    profCommissionMap.set(p.id, Math.max(0, Math.min(100, Number(p.commission_pct) || 0)));
  }

  let revenueToday = 0;
  let revenuePeriod = 0;
  let projectedRevenuePeriod = 0;
  let estimatedCommissions = 0;
  let completedCount = 0;

  for (const appt of appointments) {
    const dt = new Date(appt.starts_at);
    const price = Math.max(0, Number(appt.price) || 0);
    const apptDateKey = toSaoPauloDateKey(appt.starts_at);

    if (appt.status === "completed" && apptDateKey === todayKey) {
      revenueToday += price;
    }

    if (dt >= periodStart && dt <= periodEnd) {
      if (appt.status === "completed") {
        revenuePeriod += price;
        completedCount += 1;
        const pct = profCommissionMap.get(appt.professional_id) ?? 0;
        estimatedCommissions += (price * pct) / 100;
      } else if (appt.status === "scheduled" || appt.status === "confirmed") {
        projectedRevenuePeriod += price;
      }
    }
  }

  const averageTicket = completedCount > 0 ? revenuePeriod / completedCount : 0;

  return {
    revenueToday,
    revenuePeriod,
    projectedRevenuePeriod,
    averageTicket,
    estimatedCommissions,
    completedCount,
  };
}

/**
 * Calcula os indicadores de atendimento reais no período selecionado.
 */
export function calculateAttendanceIndicators(
  appointments: RawAppointmentMetricRow[],
  newPatientsCount: number,
  periodStart: Date,
  periodEnd: Date,
): AttendanceIndicators {
  const inPeriod = appointments.filter((a) => {
    const dt = new Date(a.starts_at);
    return dt >= periodStart && dt <= periodEnd;
  });

  const scheduledCount = inPeriod.filter((a) => a.status === "scheduled").length;
  const confirmedCount = inPeriod.filter((a) => a.status === "confirmed").length;
  const completedCount = inPeriod.filter((a) => a.status === "completed").length;
  const cancelledCount = inPeriod.filter((a) => a.status === "cancelled").length;
  const noShowCount = inPeriod.filter((a) => a.status === "no_show").length;
  const totalAppointments = inPeriod.length;

  const nonCancelled = totalAppointments - cancelledCount;
  const completionRatePct = nonCancelled > 0 ? (completedCount / nonCancelled) * 100 : 0;
  const noShowRatePct = nonCancelled > 0 ? (noShowCount / nonCancelled) * 100 : 0;

  return {
    scheduledCount,
    confirmedCount,
    completedCount,
    cancelledCount,
    noShowCount,
    totalAppointments,
    completionRatePct,
    noShowRatePct,
    newPatientsCount,
  };
}

/**
 * Verifica se um lançamento financeiro está vencido na data de referência (fuso America/Sao_Paulo).
 */
export function isEntryOverdue(
  entry: Pick<FinancialEntry, "status" | "due_date">,
  now: Date = new Date(),
): boolean {
  if (entry.status === "paid" || entry.status === "cancelled") return false;
  if (entry.status === "overdue") return true;
  const todayKey = toSaoPauloDateKey(now);
  return entry.due_date < todayKey;
}

/**
 * Calcula o resumo completo do Fluxo de Caixa (Entradas, Saídas, Saldo, A Receber, A Pagar e Inadimplência).
 */
export function calculateCashFlowSummary(
  entries: Pick<FinancialEntry, "entry_type" | "status" | "amount" | "due_date">[],
  now: Date = new Date(),
): CashFlowSummary {
  let receivedIncome = 0;
  let paidExpenses = 0;
  let pendingReceivables = 0;
  let pendingPayables = 0;
  let overdueReceivables = 0;
  let overduePayables = 0;
  let overdueCount = 0;

  for (const e of entries) {
    if (e.status === "cancelled") continue;
    const val = Math.max(0, Number(e.amount) || 0);
    const overdue = isEntryOverdue(e, now);

    if (e.entry_type === "income") {
      if (e.status === "paid") {
        receivedIncome += val;
      } else {
        pendingReceivables += val;
        if (overdue) {
          overdueReceivables += val;
          overdueCount += 1;
        }
      }
    } else {
      if (e.status === "paid") {
        paidExpenses += val;
      } else {
        pendingPayables += val;
        if (overdue) {
          overduePayables += val;
          overdueCount += 1;
        }
      }
    }
  }

  return {
    receivedIncome,
    paidExpenses,
    netCashBalance: receivedIncome - paidExpenses,
    pendingReceivables,
    pendingPayables,
    overdueReceivables,
    overduePayables,
    overdueCount,
  };
}

/**
 * Gera parcelas mensais exatas em centavos (BRL) para qualquer valor e número de parcelas (1x a 24x).
 */
export function generateInstallmentRows(
  clinicId: string,
  input: z.infer<typeof financialEntryFormSchema>,
): GeneratedInstallmentRow[] {
  assertClinicScope(clinicId);
  const parsed = financialEntryFormSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados financeiros inválidos.");
  }

  const d = parsed.data;
  const n = d.installments;
  const totalCents = Math.round(d.total_amount * 100);
  const baseCents = Math.floor(totalCents / n);
  const remainderCents = totalCents - baseCents * n;

  const [yStr, mStr, dayStr] = d.first_due_date.split("-");
  const baseYear = Number(yStr);
  const baseMonth = Number(mStr) - 1;
  const baseDay = Number(dayStr);

  return Array.from({ length: n }, (_, idx) => {
    const instNum = idx + 1;
    const cents = idx === 0 ? baseCents + remainderCents : baseCents;
    const amount = Number((cents / 100).toFixed(2));

    const dueObj = new Date(Date.UTC(baseYear, baseMonth + idx, baseDay));
    const dueIso = dueObj.toISOString().slice(0, 10);

    const isPaid = d.status === "paid" && idx === 0;
    const rowStatus: FinancialEntryStatus = isPaid ? "paid" : d.status === "paid" ? "pending" : d.status;

    return {
      clinic_id: clinicId,
      unit_id: d.unit_id ?? null,
      patient_id: d.patient_id ?? null,
      professional_id: d.professional_id ?? null,
      entry_type: d.entry_type,
      category: d.category,
      description: n > 1 ? `${d.description} (${instNum}/${n})` : d.description,
      amount,
      payment_method: d.payment_method,
      status: rowStatus,
      due_date: dueIso,
      paid_at: isPaid ? new Date().toISOString() : null,
      installment_number: instNum,
      total_installments: n,
      notes: d.notes?.trim() || null,
    };
  });
}

/**
 * Calcula o relatório de comissões por profissional combinando receitas financeiras vinculadas.
 */
export function calculateProfessionalCommissions(
  entries: Pick<FinancialEntry, "entry_type" | "status" | "amount" | "professional_id">[],
  professionals: Array<{ id: string; name: string; commission_pct: number | string }>,
): ProfessionalCommissionSummary[] {
  return professionals.map((prof) => {
    const pct = Math.max(0, Math.min(100, Number(prof.commission_pct) || 0));
    const profIncomes = entries.filter(
      (e) => e.entry_type === "income" && e.status !== "cancelled" && e.professional_id === prof.id,
    );

    const realizedRevenue = profIncomes
      .filter((e) => e.status === "paid")
      .reduce((s, e) => s + Math.max(0, Number(e.amount) || 0), 0);

    const pendingRevenue = profIncomes
      .filter((e) => e.status !== "paid")
      .reduce((s, e) => s + Math.max(0, Number(e.amount) || 0), 0);

    return {
      professionalId: prof.id,
      professionalName: prof.name,
      commissionPct: pct,
      realizedRevenue,
      pendingRevenue,
      realizedCommission: Number(((realizedRevenue * pct) / 100).toFixed(2)),
      pendingCommission: Number(((pendingRevenue * pct) / 100).toFixed(2)),
    };
  });
}

// =============================================================================
// OPERAÇÕES NO BANCO DE DADOS (SUPABASE MULTI-TENANT)
// =============================================================================

type FinanceDbClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (c1: string, v1: string) => {
        order: (col: string, opts?: { ascending?: boolean }) => {
          limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>;
        };
      };
    };
    insert: (rows: Record<string, unknown> | Array<Record<string, unknown>>) => Promise<{ error: unknown }>;
    update: (row: Record<string, unknown>) => {
      eq: (c1: string, v1: string) => {
        eq: (c2: string, v2: string) => Promise<{ error: unknown }>;
      };
    };
    delete: () => {
      eq: (c1: string, v1: string) => {
        eq: (c2: string, v2: string) => Promise<{ error: unknown }>;
      };
    };
  };
};

const db = supabase as unknown as FinanceDbClient;

export async function fetchFinancialEntries(clinicId: string): Promise<FinancialEntry[]> {
  assertClinicScope(clinicId);
  const { data, error } = await db
    .from("financial_entries")
    .select("*,patients(full_name),professionals(name)")
    .eq("clinic_id", clinicId)
    .order("due_date", { ascending: false })
    .limit(500);

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }
  return (data ?? []) as FinancialEntry[];
}

export async function createFinancialEntriesWithInstallments(
  clinicId: string,
  input: z.infer<typeof financialEntryFormSchema>,
): Promise<void> {
  const rows = generateInstallmentRows(clinicId, input);
  const { error } = await db.from("financial_entries").insert(rows as unknown as Array<Record<string, unknown>>);
  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function updateFinancialEntryStatus(
  clinicId: string,
  entryId: string,
  status: FinancialEntryStatus,
): Promise<void> {
  assertClinicScope(clinicId);
  const { error } = await db
    .from("financial_entries")
    .update({
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    })
    .eq("clinic_id", clinicId)
    .eq("id", entryId);

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function deleteFinancialEntry(clinicId: string, entryId: string): Promise<void> {
  assertClinicScope(clinicId);
  const { error } = await db.from("financial_entries").delete().eq("clinic_id", clinicId).eq("id", entryId);
  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function fetchCashClosings(clinicId: string): Promise<CashClosing[]> {
  assertClinicScope(clinicId);
  const { data, error } = await db
    .from("cash_closings")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("closing_date", { ascending: false })
    .limit(60);

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }
  return (data ?? []) as CashClosing[];
}

export async function createCashClosing(params: {
  clinicId: string;
  closingDate: string;
  totalIncome: number;
  totalExpense: number;
  notes?: string;
}): Promise<void> {
  assertClinicScope(params.clinicId);
  const netBalance = Number((params.totalIncome - params.totalExpense).toFixed(2));
  const { error } = await db.from("cash_closings").insert({
    clinic_id: params.clinicId,
    closing_date: params.closingDate,
    total_income: params.totalIncome,
    total_expense: params.totalExpense,
    net_balance: netBalance,
    notes: params.notes?.trim() || null,
  });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isDuplicate) {
      throw new Error("O caixa desta data já foi fechado para esta clínica.");
    }
    throw new Error(norm.message);
  }
}

export type { FinancialEntryType };

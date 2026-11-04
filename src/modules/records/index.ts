import { z } from "zod";
import { assertClinicScope, normalizeSupabaseError, supabase } from "@/services/supabase";
import type {
  ClinicalRecord,
  ClinicalRecordType,
  OdontogramEntry,
  ToothConditionStatus,
  ToothSurface,
  TreatmentPlan,
  TreatmentPlanItem,
  TreatmentPlanStatus,
} from "@/types";

// =============================================================================
// NOTAÇÃO INTERNACIONAL FDI (DENTIÇÃO PERMANENTE E DECÍDUA)
// =============================================================================

export const ADULT_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11] as const;
export const ADULT_UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28] as const;
export const ADULT_LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41] as const;
export const ADULT_LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38] as const;

export const CHILD_UPPER_RIGHT = [55, 54, 53, 52, 51] as const;
export const CHILD_UPPER_LEFT = [61, 62, 63, 64, 65] as const;
export const CHILD_LOWER_RIGHT = [85, 84, 83, 82, 81] as const;
export const CHILD_LOWER_LEFT = [71, 72, 73, 74, 75] as const;

export const ALL_VALID_FDI_TEETH: readonly number[] = [
  ...ADULT_UPPER_RIGHT,
  ...ADULT_UPPER_LEFT,
  ...ADULT_LOWER_RIGHT,
  ...ADULT_LOWER_LEFT,
  ...CHILD_UPPER_RIGHT,
  ...CHILD_UPPER_LEFT,
  ...CHILD_LOWER_RIGHT,
  ...CHILD_LOWER_LEFT,
];

export const TOOTH_SURFACES: ToothSurface[] = ["W", "O", "V", "L", "M", "D"];

export const TOOTH_CONDITIONS: ToothConditionStatus[] = [
  "healthy",
  "caries",
  "restoration",
  "planned",
  "completed",
  "endodontics",
  "crown",
  "implant",
  "missing",
];

export const CLINICAL_RECORD_TYPES: ClinicalRecordType[] = [
  "evolution",
  "anamnesis",
  "prescription",
  "certificate",
  "exam",
];

export const TREATMENT_PLAN_STATUSES: TreatmentPlanStatus[] = [
  "draft",
  "approved",
  "in_progress",
  "completed",
  "cancelled",
];

export const CONDITION_COLORS: Record<ToothConditionStatus, string> = {
  healthy: "#e2e8f0",
  caries: "#ef4444",
  restoration: "#3b82f6",
  planned: "#f59e0b",
  completed: "#10b981",
  endodontics: "#8b5cf6",
  crown: "#06b6d4",
  implant: "#0ea5e9",
  missing: "#64748b",
};

export function isValidFdiTooth(tooth: number): boolean {
  return ALL_VALID_FDI_TEETH.includes(tooth);
}

// =============================================================================
// SCHEMAS DE VALIDAÇÃO (ZOD)
// =============================================================================

export const odontogramEntrySchema = z.object({
  patient_id: z.string().uuid("Paciente inválido."),
  professional_id: z.string().uuid().nullable().optional(),
  tooth_number: z.number().int().refine(isValidFdiTooth, "Número de dente FDI inválido."),
  surface: z.enum(["W", "O", "M", "D", "V", "L"]),
  condition: z.enum([
    "healthy",
    "caries",
    "restoration",
    "planned",
    "completed",
    "endodontics",
    "crown",
    "implant",
    "missing",
  ]),
  procedure: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const clinicalRecordSchema = z.object({
  patient_id: z.string().uuid("Paciente inválido."),
  professional_id: z.string().uuid().nullable().optional(),
  tooth_number: z
    .number()
    .int()
    .refine(isValidFdiTooth, "Dente FDI inválido.")
    .nullable()
    .optional(),
  record_type: z.enum(["evolution", "anamnesis", "prescription", "certificate", "exam"]),
  title: z.string().trim().min(2, "Informe um título (mín. 2 caracteres).").max(200),
  content: z.string().trim().min(2, "Descreva a evolução/registro clínico.").max(10000),
});

export const treatmentPlanSchema = z.object({
  patient_id: z.string().uuid("Paciente inválido."),
  professional_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2, "Informe o título do plano de tratamento.").max(160),
  discount_amount: z.number().min(0, "Desconto não pode ser negativo.").default(0),
  notes: z.string().trim().max(2000).optional(),
});

export const treatmentPlanItemSchema = z.object({
  plan_id: z.string().uuid("Plano inválido."),
  tooth_number: z
    .number()
    .int()
    .refine(isValidFdiTooth, "Dente FDI inválido.")
    .nullable()
    .optional(),
  surface: z.enum(["W", "O", "M", "D", "V", "L"]).default("W"),
  procedure_name: z.string().trim().min(2, "Informe o procedimento.").max(200),
  price: z.number().min(0, "O valor não pode ser negativo."),
});

// =============================================================================
// AGREGAÇÃO DO ESTADO DO ODONTOGRAMA E CÁLCULO DE ORÇAMENTOS
// =============================================================================

export interface AggregatedToothState {
  toothNumber: number;
  wholeCondition: ToothConditionStatus;
  surfaces: Record<Exclude<ToothSurface, "W">, ToothConditionStatus>;
  entriesCount: number;
  lastProcedure: string | null;
}

/**
 * Calcula o estado visual atual de cada dente e de suas 5 faces anatômicas
 * (O, M, D, V, L) a partir do histórico cronológico de entradas do odontograma.
 */
export function aggregateOdontogramState(entries: OdontogramEntry[]): Record<number, AggregatedToothState> {
  // Ordena do mais antigo para o mais recente para aplicar estado cumulativo real
  const sorted = [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const map: Record<number, AggregatedToothState> = {};

  for (const entry of sorted) {
    const t = entry.tooth_number;
    if (!map[t]) {
      map[t] = {
        toothNumber: t,
        wholeCondition: "healthy",
        surfaces: { O: "healthy", M: "healthy", D: "healthy", V: "healthy", L: "healthy" },
        entriesCount: 0,
        lastProcedure: null,
      };
    }

    const state = map[t]!;
    state.entriesCount += 1;
    if (entry.procedure) state.lastProcedure = entry.procedure;

    if (entry.surface === "W") {
      state.wholeCondition = entry.condition;
      if (entry.condition === "healthy" || entry.condition === "missing") {
        state.surfaces = {
          O: entry.condition,
          M: entry.condition,
          D: entry.condition,
          V: entry.condition,
          L: entry.condition,
        };
      }
    } else {
      state.surfaces[entry.surface] = entry.condition;
    }
  }

  return map;
}

export interface TreatmentPlanFinancialSummary {
  subtotal: number;
  discount: number;
  netTotal: number;
  completedTotal: number;
  plannedCount: number;
  completedCount: number;
  progressPct: number;
}

/**
 * Calcula os totais financeiros reais (em BRL) e progresso de um plano de tratamento.
 */
export function calculateTreatmentPlanSummary(
  plan: Pick<TreatmentPlan, "discount_amount">,
  items: Pick<TreatmentPlanItem, "price" | "status">[],
): TreatmentPlanFinancialSummary {
  const activeItems = items.filter((i) => i.status !== "cancelled");
  const subtotal = activeItems.reduce((sum, i) => sum + Math.max(0, Number(i.price) || 0), 0);
  const discount = Math.min(subtotal, Math.max(0, Number(plan.discount_amount) || 0));
  const netTotal = Math.max(0, subtotal - discount);

  const completedItems = activeItems.filter((i) => i.status === "completed");
  const completedTotal = completedItems.reduce((sum, i) => sum + Math.max(0, Number(i.price) || 0), 0);

  const plannedCount = activeItems.length;
  const completedCount = completedItems.length;
  const progressPct = plannedCount > 0 ? Math.round((completedCount / plannedCount) * 100) : 0;

  return {
    subtotal,
    discount,
    netTotal,
    completedTotal,
    plannedCount,
    completedCount,
    progressPct,
  };
}

// =============================================================================
// OPERAÇÕES NO BANCO DE DADOS (COM ESCOPO MULTI-TENANT E TRATAMENTO DE ERROS)
// =============================================================================

type DynamicClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (c1: string, v1: string) => {
        eq: (c2: string, v2: string) => {
          order: (col: string, opts?: { ascending?: boolean }) => Promise<{ data: unknown[] | null; error: unknown }>;
        };
        order: (col: string, opts?: { ascending?: boolean }) => Promise<{ data: unknown[] | null; error: unknown }>;
      };
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
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

const db = supabase as unknown as DynamicClient;

export async function fetchPatientOdontogram(clinicId: string, patientId: string): Promise<OdontogramEntry[]> {
  assertClinicScope(clinicId);
  const { data, error } = await db
    .from("odontogram_entries")
    .select("*,professionals(name,color)")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }
  return (data ?? []) as OdontogramEntry[];
}

export async function createOdontogramEntry(
  clinicId: string,
  input: z.infer<typeof odontogramEntrySchema>,
): Promise<void> {
  assertClinicScope(clinicId);
  const parsed = odontogramEntrySchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos para o odontograma.");
  }

  const { error } = await db.from("odontogram_entries").insert({
    clinic_id: clinicId,
    patient_id: parsed.data.patient_id,
    professional_id: parsed.data.professional_id ?? null,
    tooth_number: parsed.data.tooth_number,
    surface: parsed.data.surface,
    condition: parsed.data.condition,
    procedure: parsed.data.procedure?.trim() || null,
    notes: parsed.data.notes?.trim() || null,
  });

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function deleteOdontogramEntry(clinicId: string, entryId: string): Promise<void> {
  assertClinicScope(clinicId);
  const { error } = await db.from("odontogram_entries").delete().eq("clinic_id", clinicId).eq("id", entryId);
  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function fetchPatientClinicalRecords(clinicId: string, patientId: string): Promise<ClinicalRecord[]> {
  assertClinicScope(clinicId);
  const { data, error } = await db
    .from("clinical_records")
    .select("*,professionals(name)")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }
  return (data ?? []) as ClinicalRecord[];
}

export async function createClinicalRecord(
  clinicId: string,
  input: z.infer<typeof clinicalRecordSchema>,
): Promise<void> {
  assertClinicScope(clinicId);
  const parsed = clinicalRecordSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos para evolução clínica.");
  }

  const { error } = await db.from("clinical_records").insert({
    clinic_id: clinicId,
    patient_id: parsed.data.patient_id,
    professional_id: parsed.data.professional_id ?? null,
    tooth_number: parsed.data.tooth_number ?? null,
    record_type: parsed.data.record_type,
    title: parsed.data.title,
    content: parsed.data.content,
  });

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function fetchPatientTreatmentPlans(
  clinicId: string,
  patientId: string,
): Promise<{ plans: TreatmentPlan[]; items: TreatmentPlanItem[] }> {
  assertClinicScope(clinicId);
  const [plansRes, itemsRes] = await Promise.all([
    db
      .from("treatment_plans")
      .select("*,professionals(name)")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false }),
    db.from("treatment_plan_items").select("*").eq("clinic_id", clinicId).order("created_at", { ascending: true }),
  ]);

  if (plansRes.error) {
    const norm = normalizeSupabaseError(plansRes.error);
    if (norm.isSchemaPending) return { plans: [], items: [] };
    throw new Error(norm.message);
  }
  if (itemsRes.error) {
    const norm = normalizeSupabaseError(itemsRes.error);
    if (norm.isSchemaPending) return { plans: (plansRes.data ?? []) as TreatmentPlan[], items: [] };
    throw new Error(norm.message);
  }

  const plans = (plansRes.data ?? []) as TreatmentPlan[];
  const planIds = new Set(plans.map((p) => p.id));
  const items = ((itemsRes.data ?? []) as TreatmentPlanItem[]).filter((i) => planIds.has(i.plan_id));

  return { plans, items };
}

export async function createTreatmentPlan(
  clinicId: string,
  input: z.infer<typeof treatmentPlanSchema>,
): Promise<void> {
  assertClinicScope(clinicId);
  const parsed = treatmentPlanSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos para o plano de tratamento.");
  }

  const { error } = await db.from("treatment_plans").insert({
    clinic_id: clinicId,
    patient_id: parsed.data.patient_id,
    professional_id: parsed.data.professional_id ?? null,
    title: parsed.data.title,
    discount_amount: parsed.data.discount_amount,
    notes: parsed.data.notes?.trim() || null,
    status: "draft",
  });

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function updateTreatmentPlanStatus(
  clinicId: string,
  planId: string,
  status: TreatmentPlanStatus,
): Promise<void> {
  assertClinicScope(clinicId);
  const { error } = await db
    .from("treatment_plans")
    .update({ status })
    .eq("clinic_id", clinicId)
    .eq("id", planId);
  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function addTreatmentPlanItem(
  clinicId: string,
  input: z.infer<typeof treatmentPlanItemSchema>,
): Promise<void> {
  assertClinicScope(clinicId);
  const parsed = treatmentPlanItemSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Item de tratamento inválido.");
  }

  const { error } = await db.from("treatment_plan_items").insert({
    clinic_id: clinicId,
    plan_id: parsed.data.plan_id,
    tooth_number: parsed.data.tooth_number ?? null,
    surface: parsed.data.surface,
    procedure_name: parsed.data.procedure_name,
    price: parsed.data.price,
    status: "planned",
  });

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function updateTreatmentPlanItemStatus(
  clinicId: string,
  itemId: string,
  status: "planned" | "completed" | "cancelled",
): Promise<void> {
  assertClinicScope(clinicId);
  const { error } = await db
    .from("treatment_plan_items")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("clinic_id", clinicId)
    .eq("id", itemId);
  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}


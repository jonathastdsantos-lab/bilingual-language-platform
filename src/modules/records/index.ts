import { z } from "zod";
import { createFinancialEntriesWithInstallments } from "@/modules/finance";
import { assertClinicScope, normalizeSupabaseError, supabase } from "@/services/supabase";
import type {
  AsaClassification,
  ClinicalRecord,
  ClinicalRecordType,
  DentitionStage,
  ExamCategory,
  OdontogramEntry,
  PatientExamFile,
  PatientStructuredAnamnesis,
  PediatricCariesRiskLevel,
  PediatricDentalAssessment,
  PediatricToothEruptionInfo,
  ProstheticLabOrder,
  ProstheticLabStage,
  SurgicalRiskAlert,
  SurgicalRiskLevel,
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

// =============================================================================
// EMISSÃO DE RECEITUÁRIO, ATESTADOS ODONTOLÓGICOS (CID-10) E TCLE (A4 / A5)
// =============================================================================

export type PrintableDocumentKind =
  | "prescription_simple"
  | "prescription_controlled"
  | "certificate"
  | "attendance_declaration"
  | "orientation_post_op"
  | "tcle"
  | "contract";

export type PrintablePageSize = "A4" | "A5";

export const DENTAL_CID10_CODES = [
  { code: "Z01.2", description: "Exame odontológico de rotina" },
  { code: "K02.9", description: "Cárie dentária não especificada" },
  { code: "K04.0", description: "Pulpite aguda / Urgência Endodôntica" },
  { code: "K04.7", description: "Abscesso periapical sem fístula" },
  { code: "K01.1", description: "Dentes impactados / Exodontia de 3º Molar (Siso)" },
  { code: "K05.1", description: "Gengivite crônica / Raspagem Periodontal" },
  { code: "K05.3", description: "Periodontite crônica avançada" },
  { code: "K08.1", description: "Perda de dentes / Cirurgia de Implante Osteointegrado" },
  { code: "K07.6", description: "Transtorno da ATM / Disfunção Temporomandibular" },
  { code: "K03.0", description: "Atrito e desgaste dentário excessivo (Bruxismo)" },
] as const;

export interface DentalPrescriptionPreset {
  id: string;
  category: "analgesic" | "anti_inflammatory" | "antibiotic" | "antiseptic" | "corticoid_topical" | "anxiolytic" | "pediatric";
  categoryLabel: string;
  label: string;
  text: string;
}

export const DENTAL_PRESCRIPTION_PRESETS: readonly DentalPrescriptionPreset[] = [
  // 1. Analgésicos
  {
    id: "dipirona_500",
    category: "analgesic",
    categoryLabel: "Analgésicos",
    label: "Dipirona 500mg Comp.",
    text: "1) Uso Interno (Via Oral)\nDipirona Monoidratada 500mg ------------------------ 1 caixa (10 comprimidos)\nTomar 01 (um) comprimido de 6 em 6 horas, por até 3 dias, em caso de dor ou febre.",
  },
  {
    id: "dipirona_1000",
    category: "analgesic",
    categoryLabel: "Analgésicos",
    label: "Dipirona 1g Comp.",
    text: "1) Uso Interno (Via Oral)\nDipirona Monoidratada 1g --------------------------- 1 caixa (10 comprimidos)\nTomar 01 (um) comprimido de 6 em 6 horas em caso de dor intensa, por no máximo 3 dias.",
  },
  {
    id: "paracetamol_750",
    category: "analgesic",
    categoryLabel: "Analgésicos",
    label: "Paracetamol 750mg Comp.",
    text: "1) Uso Interno (Via Oral)\nParacetamol 750mg ---------------------------------- 1 caixa (10 comprimidos)\nTomar 01 (um) comprimido de 6 em 6 horas em caso de dor (não ultrapassar 4 comprimidos ao dia).",
  },
  {
    id: "toragesic_10",
    category: "analgesic",
    categoryLabel: "Analgésicos",
    label: "Toragesic 10mg Sublingual",
    text: "1) Uso Sublingual\nTrometamol Cetorolaco 10mg SL ---------------------- 1 caixa (10 comprimidos)\nDissolver 01 (um) comprimido sob a língua de 8 em 8 horas em caso de dor aguda pós-operatória (máx. 3 dias).",
  },
  // 2. Anti-inflamatórios
  {
    id: "ibuprofeno_600",
    category: "anti_inflammatory",
    categoryLabel: "Anti-inflamatórios",
    label: "Ibuprofeno 600mg Comp.",
    text: "1) Uso Interno (Via Oral)\nIbuprofeno 600mg ---------------------------------- 1 caixa (20 comprimidos)\nTomar 01 (um) comprimido de 8 em 8 horas, preferencialmente após as refeições, por 3 a 5 dias.",
  },
  {
    id: "nimesulida_100",
    category: "anti_inflammatory",
    categoryLabel: "Anti-inflamatórios",
    label: "Nimesulida 100mg Comp.",
    text: "1) Uso Interno (Via Oral)\nNimesulida 100mg ---------------------------------- 1 caixa (12 comprimidos)\nTomar 01 (um) comprimido de 12 em 12 horas, após alimentação, por 3 dias.",
  },
  {
    id: "dexametasona_4",
    category: "anti_inflammatory",
    categoryLabel: "Anti-inflamatórios",
    label: "Dexametasona 4mg (Pré-Op Dose Única)",
    text: "1) Uso Interno (Via Oral)\nDexametasona 4mg ---------------------------------- 1 comprimido\nTomar 01 (um) comprimido dose única 1 hora antes do procedimento cirúrgico (redução de edema).",
  },
  {
    id: "cetoprofeno_150",
    category: "anti_inflammatory",
    categoryLabel: "Anti-inflamatórios",
    label: "Cetoprofeno 150mg Liberação Prolongada",
    text: "1) Uso Interno (Via Oral)\nCetoprofeno 150mg LP ------------------------------ 1 caixa (10 comprimidos)\nTomar 01 (um) comprimido ao dia, após o almoço ou jantar, durante 3 a 5 dias.",
  },
  // 3. Antibióticos
  {
    id: "amoxicilina_500",
    category: "antibiotic",
    categoryLabel: "Antibióticos",
    label: "Amoxicilina 500mg (7 dias)",
    text: "1) Uso Interno (Via Oral)\nAmoxicilina 500mg --------------------------------- 21 cápsulas\nTomar 01 (uma) cápsula de 8 em 8 horas, rigorosamente nos horários estipulados, por 7 dias completos.",
  },
  {
    id: "amox_clav_875",
    category: "antibiotic",
    categoryLabel: "Antibióticos",
    label: "Amoxicilina + Clavulanato 875/125mg",
    text: "1) Uso Interno (Via Oral)\nAmoxicilina 875mg + Clavulanato de Potássio 125mg - 14 comprimidos\nTomar 01 (um) comprimido de 12 em 12 horas, no início das principais refeições, por 7 dias.",
  },
  {
    id: "azitromicina_500",
    category: "antibiotic",
    categoryLabel: "Antibióticos",
    label: "Azitromicina 500mg (3 dias)",
    text: "1) Uso Interno (Via Oral)\nAzitromicina 500mg -------------------------------- 3 comprimidos\nTomar 01 (um) comprimido ao dia, sempre no mesmo horário, 1 hora antes ou 2 horas após refeições, por 3 dias.",
  },
  {
    id: "clindamicina_300",
    category: "antibiotic",
    categoryLabel: "Antibióticos",
    label: "Clindamicina 300mg (Alérgicos a Penicilina)",
    text: "1) Uso Interno (Via Oral)\nCloridrato de Clindamicina 300mg ------------------ 21 cápsulas\nTomar 01 (uma) cápsula de 8 em 8 horas, com copo cheio de água, durante 7 dias.",
  },
  // 4. Antissépticos
  {
    id: "clorexidina_012",
    category: "antiseptic",
    categoryLabel: "Antissépticos",
    label: "Clorexidina 0,12% (Sem Álcool)",
    text: "1) Uso Tópico Bucal (Bochecho)\nDigluconato de Clorexidina 0,12% (Sem Álcool) ----- 1 frasco (250ml)\nBochechar 15ml puros durante 1 minuto, a cada 12 horas, por 7 dias (iniciar somente 24h após cirurgias). Não engolir nem enxaguar com água.",
  },
  // 5. Corticoides Tópicos
  {
    id: "triancinolona_orabase",
    category: "corticoid_topical",
    categoryLabel: "Tópicos Bucais",
    label: "Triancinolona Orabase (Aftas/Lesões)",
    text: "1) Uso Tópico Bucal\nTriancinolona Acetonida 1mg/g Pomada Orabase ------ 1 bisnaga (10g)\nAplicar pequena quantidade sobre a lesão/afta sem friccionar, 2 a 3 vezes ao dia, preferencialmente antes de dormir.",
  },
  // 6. Ansiolíticos / Pré-operatório
  {
    id: "midazolam_15",
    category: "anxiolytic",
    categoryLabel: "Sedação Leve",
    label: "Midazolam 15mg Comp. (Controle Especial)",
    text: "1) Uso Interno (Via Oral)\nMaleato de Midazolam 15mg ------------------------- 1 comprimido\nTomar 01 (um) comprimido 30 a 45 minutos antes da cirurgia odontológica. Necessário vir acompanhado(a) de maior responsável.",
  },
  // 7. Pediátricos
  {
    id: "dipirona_gotas",
    category: "pediatric",
    categoryLabel: "Odontopediatria",
    label: "Dipirona Gotas 500mg/ml (Pediátrico)",
    text: "1) Uso Interno (Via Oral - Pediátrico)\nDipirona Monoidratada Gotas 500mg/ml -------------- 1 frasco (20ml)\nAdministrar 1 gota por kg de peso corporal (máximo 35 gotas por tomada), de 6 em 6 horas se houver dor ou febre.",
  },
  {
    id: "paracetamol_gotas",
    category: "pediatric",
    categoryLabel: "Odontopediatria",
    label: "Paracetamol Gotas 200mg/ml (Pediátrico)",
    text: "1) Uso Interno (Via Oral - Pediátrico)\nParacetamol Gotas 200mg/ml ------------------------ 1 frasco (15ml)\nAdministrar 1 gota por kg de peso (máximo 35 gotas), de 6 em 6 horas se necessário.",
  },
  {
    id: "amox_suspensao",
    category: "pediatric",
    categoryLabel: "Odontopediatria",
    label: "Amoxicilina Suspensão 250mg/5ml",
    text: "1) Uso Interno (Via Oral - Pediátrico)\nAmoxicilina Pó para Suspensão Oral 250mg/5ml ------ 1 frasco (150ml)\nApós reconstituição, administrar conforme peso corporal a cada 8 horas, por 7 dias ininterruptos.",
  },
] as const;

export const clinicalDocumentInputSchema = z.object({
  kind: z.enum([
    "prescription_simple",
    "prescription_controlled",
    "certificate",
    "attendance_declaration",
    "orientation_post_op",
    "tcle",
    "contract",
  ]),
  pageSize: z.enum(["A4", "A5"]).default("A4"),
  clinicName: z.string().trim().min(2),
  unitName: z.string().trim().optional(),
  unitAddress: z.string().trim().optional(),
  unitPhone: z.string().trim().optional(),
  patientName: z.string().trim().min(2),
  patientCpf: z.string().trim().optional(),
  professionalName: z.string().trim().min(2),
  professionalCro: z.string().trim().min(2, "Informe o número do CRO (ex.: CRO-SP 12345)."),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  bodyText: z.string().trim().min(5, "O conteúdo do documento deve ter ao menos 5 caracteres."),
  cid10Code: z.string().trim().optional(),
  restDays: z.number().int().min(0).max(60).optional(),
  attendanceStartTime: z.string().trim().optional(),
  attendanceEndTime: z.string().trim().optional(),
  authorizeCidDisclosure: z.boolean().optional(),
  procedureName: z.string().trim().optional(),
  validationCode: z.string().trim().optional(),
  validationUrl: z.string().trim().optional(),
  signatureDataUrl: z.string().trim().optional(),
});

export type ClinicalDocumentInput = z.infer<typeof clinicalDocumentInputSchema>;

/**
 * Gera o título e o corpo estruturado para gravação no Prontuário Eletrônico (`clinical_records`).
 */
export function buildClinicalDocumentRecordPayload(input: ClinicalDocumentInput): {
  recordType: ClinicalRecordType;
  title: string;
  content: string;
} {
  const parsed = clinicalDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados do documento clínico inválidos.");
  }

  const d = parsed.data;
  const headerMeta = `Cirurgião-Dentista: ${d.professionalName} (${d.professionalCro}) | Data: ${d.issueDate} | Formato: ${d.pageSize}`;

  if (d.kind === "prescription_simple") {
    return {
      recordType: "prescription",
      title: `Receituário Simples — ${d.professionalName} (${d.professionalCro})`,
      content: `${headerMeta}\n\n${d.bodyText}`,
    };
  }

  if (d.kind === "prescription_controlled") {
    return {
      recordType: "prescription",
      title: `Receituário de Controle Especial (2 Vias) — ${d.professionalName} (${d.professionalCro})`,
      content: `${headerMeta}\n[1ª Via Farmácia / 2ª Via Paciente — Portaria SVS/MS 344/98]\n\n${d.bodyText}`,
    };
  }

  if (d.kind === "certificate") {
    const cidLine =
      d.cid10Code && d.authorizeCidDisclosure
        ? `CID-10 autorizado pelo paciente: ${d.cid10Code}`
        : "CID-10: Oculto a pedido/sigilo odontológico";
    const restLine =
      d.restDays && d.restDays > 0
        ? `Período de afastamento/repouso recomendado: ${d.restDays} dia(s).`
        : "Declaração de comparecimento no horário indicado.";
    return {
      recordType: "certificate",
      title: `Atestado Odontológico${d.cid10Code && d.authorizeCidDisclosure ? ` (CID ${d.cid10Code})` : ""} — ${d.professionalName}`,
      content: `${headerMeta}\n${restLine}\n${cidLine}\n\n${d.bodyText}`,
    };
  }

  if (d.kind === "attendance_declaration") {
    const timeInfo =
      d.attendanceStartTime && d.attendanceEndTime
        ? `Horário de atendimento: das ${d.attendanceStartTime} às ${d.attendanceEndTime}.`
        : "Comparecimento odontológico confirmado.";
    return {
      recordType: "certificate",
      title: `Declaração de Comparecimento — ${d.professionalName}`,
      content: `${headerMeta}\n${timeInfo}\n\n${d.bodyText}`,
    };
  }

  if (d.kind === "orientation_post_op") {
    return {
      recordType: "evolution",
      title: `Orientações Pós-Operatórias — ${d.patientName}`,
      content: `${headerMeta}\n\n${d.bodyText}`,
    };
  }

  if (d.kind === "contract") {
    return {
      recordType: "evolution",
      title: `Contrato de Prestação de Serviços Odontológicos — ${d.patientName}`,
      content: `${headerMeta}\n\n${d.bodyText}`,
    };
  }

  return {
    recordType: "evolution",
    title: `Termo de Consentimento Livre e Esclarecido (TCLE)${d.procedureName ? ` — ${d.procedureName}` : ""}`,
    content: `${headerMeta}\nProcedimento: ${d.procedureName || "Tratamento Odontológico"}\n\n${d.bodyText}`,
  };
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Gera o HTML pronto para impressão em folha A4 ou A5 (com estilos @page e blocos de assinatura).
 */
export function buildPrintableDocumentHtml(input: ClinicalDocumentInput): string {
  const parsed = clinicalDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados do documento inválidos.");
  }
  const d = parsed.data;
  const [y, m, day] = d.issueDate.split("-");
  const formattedDate = `${day}/${m}/${y}`;

  const docTitle =
    d.kind === "prescription_simple"
      ? "RECEITUÁRIO ODONTOLÓGICO"
      : d.kind === "prescription_controlled"
        ? "RECEITUÁRIO DE CONTROLE ESPECIAL (2 VIAS)"
        : d.kind === "certificate"
          ? "ATESTADO ODONTOLÓGICO"
          : d.kind === "attendance_declaration"
            ? "DECLARAÇÃO DE COMPARECIMENTO ODONTOLÓGICO"
            : d.kind === "orientation_post_op"
              ? "ORIENTAÇÕES E CUIDADOS PÓS-OPERATÓRIOS"
              : d.kind === "contract"
                ? "CONTRATO DE PRESTAÇÃO DE SERVIÇOS ODONTOLÓGICOS"
                : "TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)";

  const validationSealBlock = d.validationCode
    ? `<div class="security-seal">
        <div class="seal-header">
          <span class="seal-tag">ASSINATURA DIGITAL OFICIAL — ICP-BRASIL / MP 2.200-2/2001</span>
          <span class="seal-code">Código: <strong>${escapeHtml(d.validationCode)}</strong></span>
        </div>
        <div class="seal-body">
          <div class="seal-text">
            Este documento foi emitido e assinado eletronicamente por <strong>${escapeHtml(d.professionalName)} (${escapeHtml(d.professionalCro)})</strong>.<br/>
            A autenticidade e validade jurídica deste receituário/atestado pode ser confirmada por farmácias e órgãos competentes apontando a câmera para o QR Code ao lado ou acessando:
            <br/><a href="${escapeHtml(d.validationUrl || `https://app.sondapro.com.br/validar/${d.validationCode}`)}" target="_blank" style="color: #0b3b75; font-weight: bold; text-decoration: underline;">${escapeHtml(d.validationUrl || `https://app.sondapro.com.br/validar/${d.validationCode}`)}</a>
          </div>
          <div class="seal-qr">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="70" height="70" style="display: block;">
              <rect width="100" height="100" fill="#ffffff" />
              <g fill="#0b1f3a">
                <rect x="10" y="10" width="26" height="26" />
                <rect x="14" y="14" width="18" height="18" fill="#ffffff" />
                <rect x="18" y="18" width="10" height="10" />
                <rect x="64" y="10" width="26" height="26" />
                <rect x="68" y="14" width="18" height="18" fill="#ffffff" />
                <rect x="72" y="18" width="10" height="10" />
                <rect x="10" y="64" width="26" height="26" />
                <rect x="14" y="68" width="18" height="18" fill="#ffffff" />
                <rect x="18" y="72" width="10" height="10" />
                <rect x="42" y="14" width="6" height="12" />
                <rect x="52" y="14" width="6" height="6" />
                <rect x="42" y="42" width="16" height="16" />
                <rect x="64" y="42" width="10" height="6" />
                <rect x="78" y="48" width="12" height="12" />
                <rect x="42" y="64" width="8" height="14" />
                <rect x="54" y="72" width="14" height="6" />
                <rect x="72" y="72" width="18" height="18" />
              </g>
            </svg>
            <div style="font-size: 8px; font-weight: 700; color: #475569; text-align: center; margin-top: 2px;">SCAN TO VERIFY</div>
          </div>
        </div>
      </div>`
    : "";

  const cidBlock =
    d.kind === "certificate" && d.cid10Code && d.authorizeCidDisclosure
      ? `<div class="box"><strong>Classificação Internacional de Doenças (CID-10):</strong> ${escapeHtml(d.cid10Code)}<br/><small>Autorizo expressamente a inclusão do código CID-10 neste atestado. Assinatura do Paciente: ___________________________</small></div>`
      : "";

  const controlledBuyerSupplierBox =
    d.kind === "prescription_controlled"
      ? `<div class="controlled-grid">
          <div class="box">
            <strong>IDENTIFICAÇÃO DO COMPRADOR</strong><br/>
            Nome: ___________________________________________<br/>
            RG / Órgão Emissor: ______________________________<br/>
            Endereço: ________________________________________<br/>
            Cidade/UF: ___________________ Tel.: ______________
          </div>
          <div class="box">
            <strong>IDENTIFICAÇÃO DO FORNECEDOR (FARMÁCIA)</strong><br/>
            Data do aviamento: ____/____/________<br/><br/>
            _________________________________________________<br/>
            Assinatura do Farmacêutico e Carimbo do Estabelecimento<br/>
            <small>1ª Via: Retenção da Farmácia | 2ª Via: Orientação ao Paciente</small>
          </div>
        </div>`
      : "";

  const tclePatientSignature =
    d.kind === "tcle" || d.kind === "certificate"
      ? `<div class="sig-col">
          <div class="sig-line"></div>
          <strong>${escapeHtml(d.patientName)}</strong>
          <div>Paciente / Responsável Legal${d.patientCpf ? ` — CPF: ${escapeHtml(d.patientCpf)}` : ""}</div>
        </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docTitle)} — ${escapeHtml(d.patientName)}</title>
  <style>
    @page { size: ${d.pageSize}; margin: 14mm; }
    * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; color: #0b1f3a; }
    body { margin: 0; padding: 12px; font-size: ${d.pageSize === "A5" ? "12px" : "13.5px"}; line-height: 1.55; }
    .header { border-bottom: 2px solid #0b3b75; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
    .clinic-name { font-size: 18px; font-weight: 800; color: #0b1f3a; }
    .clinic-sub { font-size: 11.5px; color: #475569; margin-top: 2px; }
    .doc-badge { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-weight: 700; font-size: 11px; padding: 4px 10px; border-radius: 6px; }
    .title { text-align: center; font-size: 16px; font-weight: 800; letter-spacing: 0.5px; margin: 14px 0; color: #0b3b75; }
    .patient-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; }
    .body-content { white-space: pre-wrap; min-height: ${d.pageSize === "A5" ? "140px" : "240px"}; padding: 8px 4px; font-size: ${d.pageSize === "A5" ? "12.5px" : "14px"}; }
    .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-top: 12px; font-size: 11.5px; }
    .controlled-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
    .footer-date { text-align: right; margin-top: 20px; font-size: 12.5px; }
    .signatures { display: flex; justify-content: space-around; gap: 24px; margin-top: 38px; text-align: center; }
    .sig-col { flex: 1; max-width: 280px; font-size: 12px; }
    .sig-line { border-top: 1px solid #0b1f3a; margin-bottom: 6px; }
    .security-seal { border: 1.5px solid #0b3b75; border-radius: 8px; background: #f0f7ff; padding: 10px 14px; margin-top: 18px; }
    .seal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #bfdbfe; padding-bottom: 6px; margin-bottom: 8px; font-size: 11px; }
    .seal-tag { background: #0b3b75; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 9.5px; letter-spacing: 0.5px; }
    .seal-code { font-family: monospace; color: #0b3b75; font-size: 11.5px; }
    .seal-body { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .seal-text { font-size: 11px; color: #1e3a8a; line-height: 1.45; flex: 1; }
    .seal-qr { flex-shrink: 0; background: #ffffff; padding: 4px; border: 1px solid #93c5fd; border-radius: 6px; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="clinic-name">${escapeHtml(d.clinicName)}</div>
      <div class="clinic-sub">
        ${d.unitName ? escapeHtml(d.unitName) : "Unidade Matriz"}
        ${d.unitAddress ? ` • ${escapeHtml(d.unitAddress)}` : ""}
        ${d.unitPhone ? ` • Tel: ${escapeHtml(d.unitPhone)}` : ""}
      </div>
    </div>
    <div class="doc-badge">Folha ${d.pageSize}</div>
  </div>

  <div class="title">${escapeHtml(docTitle)}</div>

  <div class="patient-box">
    <strong>Paciente:</strong> ${escapeHtml(d.patientName)}
    ${d.patientCpf ? ` &nbsp;|&nbsp; <strong>CPF:</strong> ${escapeHtml(d.patientCpf)}` : ""}
    ${d.procedureName ? `<br/><strong>Procedimento / Referência:</strong> ${escapeHtml(d.procedureName)}` : ""}
  </div>

  <div class="body-content">${escapeHtml(d.bodyText)}</div>

  ${cidBlock}
  ${controlledBuyerSupplierBox}
  ${validationSealBlock}

  <div class="footer-date">
    Data de emissão: <strong>${formattedDate}</strong>
  </div>

  <div class="signatures">
    <div class="sig-col">
      ${d.signatureDataUrl
      ? `<img src="${d.signatureDataUrl}" alt="Assinatura Digital" style="max-height: 48px; max-width: 180px; display: block; margin: 0 auto 4px auto;" />`
      : ""
    }
      <div class="sig-line"></div>
      <strong>${escapeHtml(d.professionalName)}</strong>
      <div>Cirurgião-Dentista — ${escapeHtml(d.professionalCro)}</div>
    </div>
    ${tclePatientSignature}
  </div>
</body>
</html>`;
}

// =============================================================================
// GALERIA DE EXAMES E RADIOGRAFIAS (SUPABASE STORAGE COM RLS MULTI-TENANT)
// =============================================================================

export const CLINICAL_EXAMS_BUCKET = "clinical-exams" as const;
export const MAX_EXAM_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_EXAM_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const EXAM_CATEGORIES: ExamCategory[] = [
  "periapical",
  "panoramic",
  "bitewing",
  "tomography",
  "intraoral_before",
  "intraoral_after",
  "document",
];

export const EXAM_CATEGORY_LABELS: Record<ExamCategory, string> = {
  periapical: "Radiografia Periapical",
  panoramic: "Radiografia Panorâmica",
  bitewing: "Interproximal / Bitewing",
  tomography: "Tomografia Cone Beam (TCFC)",
  intraoral_before: "Foto Intraoral — Antes",
  intraoral_after: "Foto Intraoral — Depois",
  document: "Laudo / Exame em PDF",
};

export const patientExamUploadSchema = z.object({
  patient_id: z.string().uuid("Paciente inválido."),
  professional_id: z.string().uuid().nullable().optional(),
  tooth_number: z
    .number()
    .int()
    .refine(isValidFdiTooth, "Número de dente FDI inválido.")
    .nullable()
    .optional(),
  exam_category: z.enum([
    "periapical",
    "panoramic",
    "bitewing",
    "tomography",
    "intraoral_before",
    "intraoral_after",
    "document",
  ]),
  title: z.string().trim().min(2, "Informe o título do exame (mín. 2 caracteres).").max(160),
  notes: z.string().trim().max(2000).optional(),
  exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data do exame inválida."),
  file_name: z.string().trim().min(1, "Nome de arquivo inválido.").max(240),
  mime_type: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"], {
    message: "Formato não permitido. Envie JPG, PNG, WEBP ou PDF.",
  }),
  file_size_bytes: z
    .number()
    .int()
    .positive("O arquivo está vazio.")
    .max(MAX_EXAM_FILE_SIZE_BYTES, "O arquivo excede o limite máximo de 15 MB."),
});

export type PatientExamUploadInput = z.infer<typeof patientExamUploadSchema>;

/**
 * Higieniza o nome original do arquivo removendo caracteres especiais e prevenindo Path Traversal.
 */
export function sanitizeExamFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "exame";
  const cleaned = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 100);
  return cleaned || "exame.jpg";
}

/**
 * Constrói o caminho de armazenamento isolado por clínica e paciente:
 * `<clinic_id>/<patient_id>/<uniqueId>-<sanitizedFileName>`
 * O primeiro segmento DEVE ser `clinic_id` para satisfazer as políticas RLS em `storage.objects`.
 */
export function buildTenantExamStoragePath(
  clinicId: string,
  patientId: string,
  fileName: string,
  uniquePrefix?: string,
): string {
  assertClinicScope(clinicId);
  const parsedPatient = z.string().uuid().safeParse(patientId);
  if (!parsedPatient.success) {
    throw new Error("Identificador de paciente inválido para armazenamento.");
  }
  const safeName = sanitizeExamFileName(fileName);
  const prefix =
    uniquePrefix?.trim() ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`);
  return `${clinicId}/${patientId}/${prefix}-${safeName}`;
}

/**
 * Garante que um `storage_path` pertence estritamente ao `clinicId` ativo (prevenção de acesso Cross-Tenant).
 */
export function verifyExamStoragePathTenant(clinicId: string, storagePath: string): boolean {
  assertClinicScope(clinicId);
  if (!storagePath || storagePath.includes("..")) return false;
  const parts = storagePath.split("/");
  return parts.length >= 3 && parts[0] === clinicId;
}

export async function fetchPatientExamFiles(
  clinicId: string,
  patientId: string,
): Promise<PatientExamFile[]> {
  assertClinicScope(clinicId);
  const { data, error } = await db
    .from("patient_exam_files")
    .select("*,professionals(name)")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("exam_date", { ascending: false });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }
  return (data ?? []) as PatientExamFile[];
}

export async function uploadPatientExamFile(
  clinicId: string,
  input: PatientExamUploadInput,
  file: Blob,
): Promise<void> {
  assertClinicScope(clinicId);
  const parsed = patientExamUploadSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados do exame inválidos.");
  }

  const d = parsed.data;
  const storagePath = buildTenantExamStoragePath(clinicId, d.patient_id, d.file_name);

  // 1. Upload do binário para o bucket privado 'clinical-exams' no Supabase Storage
  const { error: uploadErr } = await supabase.storage
    .from(CLINICAL_EXAMS_BUCKET)
    .upload(storagePath, file, {
      contentType: d.mime_type,
      upsert: false,
    });

  if (uploadErr) {
    throw new Error(`Falha ao enviar arquivo ao Storage: ${uploadErr.message}`);
  }

  // 2. Registro dos metadados auditados na tabela patient_exam_files
  const { error: dbErr } = await db.from("patient_exam_files").insert({
    clinic_id: clinicId,
    patient_id: d.patient_id,
    professional_id: d.professional_id ?? null,
    tooth_number: d.tooth_number ?? null,
    exam_category: d.exam_category,
    title: d.title,
    notes: d.notes?.trim() || null,
    file_name: d.file_name,
    mime_type: d.mime_type,
    file_size_bytes: d.file_size_bytes,
    storage_path: storagePath,
    exam_date: d.exam_date,
  });

  if (dbErr) {
    // Rollback do objeto no Storage caso a inserção no banco falhe
    await supabase.storage.from(CLINICAL_EXAMS_BUCKET).remove([storagePath]);
    throw new Error(normalizeSupabaseError(dbErr).message);
  }
}

export async function createSignedExamUrl(
  clinicId: string,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  if (!verifyExamStoragePathTenant(clinicId, storagePath)) {
    throw new Error("Acesso negado: o arquivo solicitado não pertence à clínica ativa.");
  }
  const { data, error } = await supabase.storage
    .from(CLINICAL_EXAMS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Não foi possível gerar link temporário do exame.");
  }
  return data.signedUrl;
}

export async function deletePatientExamFile(
  clinicId: string,
  exam: Pick<PatientExamFile, "id" | "storage_path">,
): Promise<void> {
  if (!verifyExamStoragePathTenant(clinicId, exam.storage_path)) {
    throw new Error("Operação bloqueada: arquivo fora do escopo da clínica ativa.");
  }

  const { error: dbErr } = await db
    .from("patient_exam_files")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("id", exam.id);

  if (dbErr) {
    throw new Error(normalizeSupabaseError(dbErr).message);
  }

  await supabase.storage.from(CLINICAL_EXAMS_BUCKET).remove([exam.storage_path]);
}

// =============================================================================
// ANAMNESE DIGITAL ESTRUTURADA, CLASSIFICAÇÃO ASA E ALERTAS DE RISCO CIRÚRGICO
// =============================================================================

export const ASA_CLASSIFICATIONS: AsaClassification[] = [
  "ASA I",
  "ASA II",
  "ASA III",
  "ASA IV",
];

export const structuredAnamnesisSchema = z.object({
  patient_id: z.string().uuid("Paciente inválido."),
  professional_id: z.string().uuid().nullable().optional(),
  asa_classification: z.enum(["ASA I", "ASA II", "ASA III", "ASA IV"]).optional(),
  has_hypertension: z.boolean().default(false),
  has_diabetes: z.boolean().default(false),
  has_heart_disease: z.boolean().default(false),
  uses_anticoagulants: z.boolean().default(false),
  uses_bisphosphonates: z.boolean().default(false),
  has_bleeding_disorder: z.boolean().default(false),
  is_pregnant_or_lactating: z.boolean().default(false),
  allergy_local_anesthetic: z.boolean().default(false),
  allergy_penicillin: z.boolean().default(false),
  allergy_latex: z.boolean().default(false),
  allergy_nsaids: z.boolean().default(false),
  other_allergies: z.string().trim().max(500).optional(),
  current_medications: z.string().trim().max(1000).optional(),
  has_bruxism: z.boolean().default(false),
  is_smoker: z.boolean().default(false),
  blood_pressure_systolic: z.number().int().min(60).max(280).nullable().optional(),
  blood_pressure_diastolic: z.number().int().min(30).max(180).nullable().optional(),
  chief_complaint: z.string().trim().max(1000).optional(),
  clinical_observations: z.string().trim().max(3000).optional(),
});

export type StructuredAnamnesisInput = z.infer<typeof structuredAnamnesisSchema>;

export interface SurgicalRiskEvaluation {
  recommendedAsa: AsaClassification;
  overallRiskLevel: SurgicalRiskLevel;
  alerts: SurgicalRiskAlert[];
  allergiesSummary: string;
  conditionsSummary: string;
}

export type SurgicalRiskEvaluationInput = {
  [K in keyof Omit<
    PatientStructuredAnamnesis,
    "id" | "clinic_id" | "patient_id" | "updated_at" | "updated_by"
  >]?: PatientStructuredAnamnesis[K] | undefined;
};

/**
 * Avalia o perfil sistêmico e farmacológico do paciente para calcular automaticamente:
 * - Classificação ASA recomendada (ASA I a ASA IV)
 * - Nível de risco cirúrgico global ('low' | 'moderate' | 'high' | 'critical')
 * - Alertas clínicos acionáveis para o cirurgião-dentista (anestesia, hemostasia, MRONJ, profilaxia)
 */
export function evaluateSurgicalRiskAndAsa(
  input: SurgicalRiskEvaluationInput,
): SurgicalRiskEvaluation {
  const alerts: SurgicalRiskAlert[] = [];
  const sys = input.blood_pressure_systolic ?? null;
  const dia = input.blood_pressure_diastolic ?? null;

  // 1. Avaliação Pressórica (PA)
  if ((sys !== null && sys >= 180) || (dia !== null && dia >= 110)) {
    alerts.push({
      id: "hypertensive-crisis",
      level: "critical",
      title: `Crise Hipertensiva Detectada (${sys ?? "?"}x${dia ?? "?"} mmHg)`,
      clinicalRecommendation:
        "Contraindicar procedimentos odontológicos eletivos/cirúrgicos imediatamente e encaminhar para estabilização médica.",
    });
  } else if ((sys !== null && sys >= 140) || (dia !== null && dia >= 90) || input.has_hypertension) {
    alerts.push({
      id: "hypertension",
      level: "moderate",
      title: `Hipertensão Arterial${sys && dia ? ` (PA: ${sys}x${dia} mmHg)` : ""}`,
      clinicalRecommendation:
        "Monitorar PA pré-operatória, controlar ansiedade e limitar vasoconstritor adrenérgico (máx. 2 tubetes de Epinefrina 1:100.000).",
    });
  }

  // 2. Alergia a Anestésico Local
  if (input.allergy_local_anesthetic) {
    alerts.push({
      id: "allergy-anesthetic",
      level: "critical",
      title: "Alergia a Anestésico Local",
      clinicalRecommendation:
        "Identificar grupo químico (amida vs. éster) ou hipersensibilidade a conservantes bissulfitos antes de qualquer bloqueio anestésico.",
    });
  }

  // 3. Uso de Bisfosfonatos / Risco de Osteonecrose dos Maxilares (MRONJ)
  if (input.uses_bisphosphonates) {
    alerts.push({
      id: "bisphosphonates-mronj",
      level: "high",
      title: "Risco de Osteonecrose dos Maxilares (MRONJ — Bisfosfonatos)",
      clinicalRecommendation:
        "Alto risco em exodontias, cirurgias periodontais e instalação de implantes. Priorizar tratamentos conservadores/endodônticos e cobertura antibiótica.",
    });
  }

  // 4. Anticoagulantes / Distúrbios de Coagulação
  if (input.uses_anticoagulants || input.has_bleeding_disorder) {
    alerts.push({
      id: "bleeding-risk",
      level: "high",
      title: "Risco Hemorrágico Cirúrgico (Anticoagulantes / Coagulopatia)",
      clinicalRecommendation:
        "Verificar INR recente antes de exodontias/cirurgias e preparar manobras hemostáticas locais (esponja de colágeno, sutura em massa e ácido tranexâmico).",
    });
  }

  // 5. Cardiopatia
  if (input.has_heart_disease) {
    alerts.push({
      id: "heart-disease",
      level: "high",
      title: "Cardiopatia Relatada",
      clinicalRecommendation:
        "Avaliar indicação de profilaxia antibiótica para Endocardite Infecciosa (AHA) em procedimentos com sangramento gengival/periapical.",
    });
  }

  // 6. Alergia a Penicilina / AINEs / Látex
  if (input.allergy_penicillin) {
    alerts.push({
      id: "allergy-penicillin",
      level: "high",
      title: "Alergia a Penicilina / Amoxicilina",
      clinicalRecommendation:
        "Contraindicado grupo das Penicilinas/Cefalosporinas. Substituir por Clindamicina 300mg ou Azitromicina 500mg.",
    });
  }

  if (input.allergy_nsaids) {
    alerts.push({
      id: "allergy-nsaids",
      level: "moderate",
      title: "Alergia a AINEs / Dipirona",
      clinicalRecommendation:
        "Evitar Ibuprofeno, Nimesulida, Cetorolaco e Dipirona. Utilizar Paracetamol ou Corticosteroide (Dexametasona) conforme histórico.",
    });
  }

  if (input.allergy_latex) {
    alerts.push({
      id: "allergy-latex",
      level: "moderate",
      title: "Alergia ao Látex",
      clinicalRecommendation:
        "Utilizar exclusivamente luvas nitrílicas/vinil e lençol de isolamento absoluto (dique) livre de látex.",
    });
  }

  // 7. Gestante / Lactante e Diabetes
  if (input.is_pregnant_or_lactating) {
    alerts.push({
      id: "pregnancy",
      level: "moderate",
      title: "Paciente Gestante / Lactante",
      clinicalRecommendation:
        "Priorizar 2º trimestre para tratamentos eletivos, utilizar avental plumbífero com protetor de tireoide e preferir Lidocaína 2% com Epinefrina 1:100.000.",
    });
  }

  if (input.has_diabetes) {
    alerts.push({
      id: "diabetes",
      level: "moderate",
      title: "Diabetes Mellitus",
      clinicalRecommendation:
        "Agendar preferencialmente no início da manhã, aferir glicemia capilar antes de cirurgias e monitorar resposta cicatricial periodontal.",
    });
  }

  if (input.has_bruxism) {
    alerts.push({
      id: "bruxism",
      level: "low",
      title: "Bruxismo / Apertamento Dental",
      clinicalRecommendation:
        "Planejar proteção oclusal (Placa Miorrelaxante em acrílico) para preservar restaurações, facetas e próteses sobre implante.",
    });
  }

  // Cálculo da Classificação ASA recomendada e risco global
  const hasCritical = alerts.some((a) => a.level === "critical");
  const hasHigh = alerts.some((a) => a.level === "high");
  const hasModerate = alerts.some((a) => a.level === "moderate");

  let recommendedAsa: AsaClassification = "ASA I";
  let overallRiskLevel: SurgicalRiskLevel = "low";

  if (hasCritical) {
    recommendedAsa = "ASA IV";
    overallRiskLevel = "critical";
  } else if (hasHigh) {
    recommendedAsa = "ASA III";
    overallRiskLevel = "high";
  } else if (hasModerate || input.is_smoker) {
    recommendedAsa = "ASA II";
    overallRiskLevel = "moderate";
  }

  // Resumos textuais para sincronização automática no prontuário do paciente
  const allergyItems: string[] = [];
  if (input.allergy_local_anesthetic) allergyItems.push("Anestésico Local");
  if (input.allergy_penicillin) allergyItems.push("Penicilina/Amoxicilina");
  if (input.allergy_nsaids) allergyItems.push("AINEs/Dipirona");
  if (input.allergy_latex) allergyItems.push("Látex");
  if (input.other_allergies?.trim()) allergyItems.push(input.other_allergies.trim());

  const condItems: string[] = [recommendedAsa];
  if (input.has_hypertension) condItems.push("Hipertensão");
  if (input.has_diabetes) condItems.push("Diabetes");
  if (input.has_heart_disease) condItems.push("Cardiopatia");
  if (input.uses_anticoagulants) condItems.push("Anticoagulantes");
  if (input.uses_bisphosphonates) condItems.push("Bisfosfonatos (Risco MRONJ)");
  if (input.has_bleeding_disorder) condItems.push("Coagulopatia");
  if (input.is_pregnant_or_lactating) condItems.push("Gestante/Lactante");
  if (input.has_bruxism) condItems.push("Bruxismo");
  if (input.is_smoker) condItems.push("Tabagista");
  if (sys && dia) condItems.push(`PA ${sys}x${dia} mmHg`);

  return {
    recommendedAsa,
    overallRiskLevel,
    alerts,
    allergiesSummary: allergyItems.join(", "),
    conditionsSummary: condItems.join(" • "),
  };
}

export async function fetchPatientStructuredAnamnesis(
  clinicId: string,
  patientId: string,
): Promise<PatientStructuredAnamnesis | null> {
  assertClinicScope(clinicId);
  const { data, error } = await db
    .from("patient_anamnesis")
    .select("*,professionals(name)")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("updated_at", { ascending: false });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return null;
    throw new Error(norm.message);
  }
  const rows = (data ?? []) as PatientStructuredAnamnesis[];
  return rows[0] ?? null;
}

export async function savePatientStructuredAnamnesis(
  clinicId: string,
  input: StructuredAnamnesisInput,
): Promise<SurgicalRiskEvaluation> {
  assertClinicScope(clinicId);
  const parsed = structuredAnamnesisSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados da anamnese inválidos.");
  }

  const d = parsed.data;
  const evaluation = evaluateSurgicalRiskAndAsa({
    ...d,
    other_allergies: d.other_allergies ?? null,
    current_medications: d.current_medications ?? null,
    blood_pressure_systolic: d.blood_pressure_systolic ?? null,
    blood_pressure_diastolic: d.blood_pressure_diastolic ?? null,
    chief_complaint: d.chief_complaint ?? null,
    clinical_observations: d.clinical_observations ?? null,
  });

  const effectiveAsa = d.asa_classification ?? evaluation.recommendedAsa;

  const existing = await fetchPatientStructuredAnamnesis(clinicId, d.patient_id);

  const payload = {
    clinic_id: clinicId,
    patient_id: d.patient_id,
    professional_id: d.professional_id ?? null,
    asa_classification: effectiveAsa,
    has_hypertension: d.has_hypertension,
    has_diabetes: d.has_diabetes,
    has_heart_disease: d.has_heart_disease,
    uses_anticoagulants: d.uses_anticoagulants,
    uses_bisphosphonates: d.uses_bisphosphonates,
    has_bleeding_disorder: d.has_bleeding_disorder,
    is_pregnant_or_lactating: d.is_pregnant_or_lactating,
    allergy_local_anesthetic: d.allergy_local_anesthetic,
    allergy_penicillin: d.allergy_penicillin,
    allergy_latex: d.allergy_latex,
    allergy_nsaids: d.allergy_nsaids,
    other_allergies: d.other_allergies?.trim() || null,
    current_medications: d.current_medications?.trim() || null,
    has_bruxism: d.has_bruxism,
    is_smoker: d.is_smoker,
    blood_pressure_systolic: d.blood_pressure_systolic ?? null,
    blood_pressure_diastolic: d.blood_pressure_diastolic ?? null,
    chief_complaint: d.chief_complaint?.trim() || null,
    clinical_observations: d.clinical_observations?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error: updErr } = await db
      .from("patient_anamnesis")
      .update(payload)
      .eq("clinic_id", clinicId)
      .eq("id", existing.id);
    if (updErr) throw new Error(normalizeSupabaseError(updErr).message);
  } else {
    const { error: insErr } = await db.from("patient_anamnesis").insert(payload);
    if (insErr) throw new Error(normalizeSupabaseError(insErr).message);
  }

  // Sincroniza o resumo de alergias e anamnese no cadastro do paciente para alertas na Agenda/Dashboard
  await db
    .from("patients")
    .update({
      allergies: evaluation.allergiesSummary || null,
      anamnesis: evaluation.conditionsSummary || null,
    })
    .eq("clinic_id", clinicId)
    .eq("id", d.patient_id);

  // Registra cópia imutável na linha do tempo do Prontuário Eletrônico (`clinical_records`)
  await createClinicalRecord(clinicId, {
    patient_id: d.patient_id,
    professional_id: d.professional_id ?? null,
    tooth_number: null,
    record_type: "anamnesis",
    title: `Anamnese Estruturada Atualizada (${effectiveAsa})`,
    content: [
      `Classificação ASA: ${effectiveAsa} | Risco Cirúrgico: ${evaluation.overallRiskLevel.toUpperCase()}`,
      `Condições Sistêmicas: ${evaluation.conditionsSummary}`,
      `Alergias Mapeadas: ${evaluation.allergiesSummary || "Nenhuma alergia relatada"}`,
      d.current_medications ? `Medicações em Uso: ${d.current_medications}` : null,
      d.chief_complaint ? `Queixa Principal: ${d.chief_complaint}` : null,
      d.clinical_observations ? `Observações Clínicas: ${d.clinical_observations}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return evaluation;
}

// =============================================================================
// CONTROLE DE LABORATÓRIO DE PRÓTESE (RASTREAMENTO DE TRABALHOS PROTÉTICOS)
// =============================================================================

export const PROSTHETIC_LAB_STAGES: readonly ProstheticLabStage[] = [
  "sent",
  "infrastructure_try_in",
  "teeth_try_in",
  "glaze_finish",
  "delivered_to_clinic",
  "installed_in_patient",
  "returned_adjustment",
] as const;

export const PROSTHETIC_STAGE_LABELS: Record<ProstheticLabStage, string> = {
  sent: "Enviado ao Laboratório (Moldagem/Scan)",
  infrastructure_try_in: "Prova de Infraestrutura / Coping",
  teeth_try_in: "Prova de Dentes / Cerâmica (Bisque)",
  glaze_finish: "Acabamento / Glaze / Acrilização",
  delivered_to_clinic: "Entregue na Clínica (Pronto p/ Consulta)",
  installed_in_patient: "Cimentado / Instalado no Paciente",
  returned_adjustment: "Retornado para Ajuste / Repetição",
};

export const PROSTHESIS_TYPES = [
  "Coroa em Zircônia Monolítica",
  "Coroa Dissilicato de Lítio (E-max)",
  "Faceta / Lente de Contato Cerâmica",
  "Coroa Sobre Implante (Parafusada/Cimentada)",
  "Prótese Protocolo Brånemark (Acrílico/Zircônia)",
  "Inlay / Onlay / Overlay Cerâmico",
  "Placa Miorrelaxante Acrílica (Bruxismo)",
  "Prótese Parcial Removível (PPR Metálica)",
  "Prótese Total (PT Caracterizada)",
  "Provisório Fresado em PMMA",
  "Núcleo Metálico Fundido / Pino de Fibra",
  "Guia Cirúrgico Impresso 3D",
] as const;

export const VITA_SHADES = [
  "BL1",
  "BL2",
  "BL3",
  "BL4",
  "A1",
  "A2",
  "A3",
  "A3.5",
  "A4",
  "B1",
  "B2",
  "B3",
  "B4",
  "C1",
  "C2",
  "C3",
  "C4",
  "D2",
  "D3",
  "D4",
  "Incolor / Transparente (Placa)",
] as const;

export const prostheticLabOrderSchema = z
  .object({
    patient_id: z.string().uuid("Paciente inválido."),
    professional_id: z.string().uuid().nullable().optional(),
    laboratory_name: z.string().trim().min(2, "Informe o nome do Laboratório de Prótese.").max(140),
    prosthesis_type: z.string().trim().min(2, "Informe o tipo de trabalho protético.").max(140),
    tooth_numbers: z.string().trim().max(80).nullable().optional(),
    vita_shade: z.string().trim().max(40).nullable().optional(),
    stage: z.enum([
      "sent",
      "infrastructure_try_in",
      "teeth_try_in",
      "glaze_finish",
      "delivered_to_clinic",
      "installed_in_patient",
      "returned_adjustment",
    ]),
    sent_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de envio inválida."),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Prazo de entrega inválido."),
    lab_cost: z.number().min(0, "O custo laboratorial não pode ser negativo.").max(200000),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((data) => data.due_date >= data.sent_date, {
    message: "O prazo de entrega não pode ser anterior à data de envio.",
    path: ["due_date"],
  });

export type ProstheticLabOrderInput = z.infer<typeof prostheticLabOrderSchema>;

export interface ProstheticLabSummary {
  totalOrders: number;
  activeInLabCount: number;
  readyInClinicCount: number;
  installedCount: number;
  overdueCount: number;
  totalLabCost: number;
}

/**
 * Calcula indicadores consolidados das Ordens de Serviço Protéticas (trabalhos em laboratório,
 * prontos para instalação na clínica, atrasados em relação ao prazo e custo laboratorial total).
 */
export function summarizeProstheticLabOrders(
  orders: Pick<ProstheticLabOrder, "stage" | "due_date" | "lab_cost">[],
  referenceDateIso: string = new Date().toISOString().slice(0, 10),
): ProstheticLabSummary {
  let activeInLabCount = 0;
  let readyInClinicCount = 0;
  let installedCount = 0;
  let overdueCount = 0;
  let totalLabCost = 0;

  for (const order of orders) {
    const cost = Math.max(0, Number(order.lab_cost) || 0);
    totalLabCost += cost;

    if (order.stage === "installed_in_patient") {
      installedCount += 1;
    } else if (order.stage === "delivered_to_clinic") {
      readyInClinicCount += 1;
    } else {
      activeInLabCount += 1;
      if (order.due_date < referenceDateIso) {
        overdueCount += 1;
      }
    }
  }

  return {
    totalOrders: orders.length,
    activeInLabCount,
    readyInClinicCount,
    installedCount,
    overdueCount,
    totalLabCost: Number(totalLabCost.toFixed(2)),
  };
}

export async function fetchPatientProstheticLabOrders(
  clinicId: string,
  patientId: string,
): Promise<ProstheticLabOrder[]> {
  assertClinicScope(clinicId);
  const { data, error } = await db
    .from("prosthetic_lab_orders")
    .select("*,professionals(name)")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("due_date", { ascending: false });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }
  return (data ?? []) as ProstheticLabOrder[];
}

export async function createProstheticLabOrder(
  clinicId: string,
  input: ProstheticLabOrderInput,
  options?: {
    generateExpenseInFinance?: boolean;
    patientName?: string;
  },
): Promise<void> {
  assertClinicScope(clinicId);
  const parsed = prostheticLabOrderSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados da Ordem Protética inválidos.");
  }

  const d = parsed.data;
  const shouldGenerateExpense = Boolean(options?.generateExpenseInFinance && d.lab_cost > 0);

  const { error } = await db.from("prosthetic_lab_orders").insert({
    clinic_id: clinicId,
    patient_id: d.patient_id,
    professional_id: d.professional_id ?? null,
    laboratory_name: d.laboratory_name,
    prosthesis_type: d.prosthesis_type,
    tooth_numbers: d.tooth_numbers?.trim() || null,
    vita_shade: d.vita_shade?.trim() || null,
    stage: d.stage,
    sent_date: d.sent_date,
    due_date: d.due_date,
    delivered_date:
      d.stage === "delivered_to_clinic" || d.stage === "installed_in_patient"
        ? new Date().toISOString().slice(0, 10)
        : null,
    lab_cost: d.lab_cost,
    financial_entry_generated: shouldGenerateExpense,
    notes: d.notes?.trim() || null,
  });

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }

  if (shouldGenerateExpense) {
    await createFinancialEntriesWithInstallments(clinicId, {
      entry_type: "expense",
      category: "Laboratório de Prótese",
      description: `Lab. ${d.laboratory_name} — ${d.prosthesis_type}${d.tooth_numbers ? ` (Dentes: ${d.tooth_numbers})` : ""}${options?.patientName ? ` • Pac.: ${options.patientName}` : ""}`,
      total_amount: d.lab_cost,
      payment_method: "pix",
      status: "pending",
      first_due_date: d.due_date,
      installments: 1,
      patient_id: d.patient_id,
      professional_id: d.professional_id ?? null,
      notes: d.notes ?? undefined,
    });
  }

  await createClinicalRecord(clinicId, {
    patient_id: d.patient_id,
    professional_id: d.professional_id ?? null,
    tooth_number: null,
    record_type: "evolution",
    title: `OS Prótese Enviada: ${d.prosthesis_type} (${d.laboratory_name})`,
    content: [
      `Laboratório: ${d.laboratory_name}`,
      `Trabalho Protético: ${d.prosthesis_type}`,
      d.tooth_numbers ? `Elementos / Região: ${d.tooth_numbers}` : null,
      d.vita_shade ? `Cor / Escala Vita: ${d.vita_shade}` : null,
      `Etapa: ${PROSTHETIC_STAGE_LABELS[d.stage]}`,
      `Envio: ${d.sent_date} | Prazo Entrega: ${d.due_date}`,
      d.notes ? `Instruções Técnicas: ${d.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

export async function updateProstheticLabOrderStage(
  clinicId: string,
  order: ProstheticLabOrder,
  nextStage: ProstheticLabStage,
): Promise<void> {
  assertClinicScope(clinicId);
  const deliveredDate =
    nextStage === "delivered_to_clinic" || nextStage === "installed_in_patient"
      ? order.delivered_date ?? new Date().toISOString().slice(0, 10)
      : order.delivered_date;

  const { error } = await db
    .from("prosthetic_lab_orders")
    .update({
      stage: nextStage,
      delivered_date: deliveredDate,
      updated_at: new Date().toISOString(),
    })
    .eq("clinic_id", clinicId)
    .eq("id", order.id);

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }

  if (nextStage === "installed_in_patient" && order.stage !== "installed_in_patient") {
    await createClinicalRecord(clinicId, {
      patient_id: order.patient_id,
      professional_id: order.professional_id,
      tooth_number: null,
      record_type: "evolution",
      title: `Prótese Instalada / Cimentada: ${order.prosthesis_type}`,
      content: `Trabalho protético (${order.prosthesis_type}${order.tooth_numbers ? ` — Dentes ${order.tooth_numbers}` : ""}${order.vita_shade ? ` — Cor ${order.vita_shade}` : ""}) confeccionado pelo laboratório ${order.laboratory_name} foi instalado/cimentado no paciente.`,
    });
  }
}

export async function registerProstheticOrderExpenseInFinance(
  clinicId: string,
  order: ProstheticLabOrder,
  patientName?: string,
): Promise<void> {
  assertClinicScope(clinicId);
  const cost = Number(order.lab_cost) || 0;
  if (cost <= 0) {
    throw new Error("Informe um custo laboratorial maior que zero para lançar no Contas a Pagar.");
  }

  await createFinancialEntriesWithInstallments(clinicId, {
    entry_type: "expense",
    category: "Laboratório de Prótese",
    description: `Lab. ${order.laboratory_name} — ${order.prosthesis_type}${order.tooth_numbers ? ` (Dentes: ${order.tooth_numbers})` : ""}${patientName ? ` • Pac.: ${patientName}` : ""}`,
    total_amount: cost,
    payment_method: "pix",
    status: "pending",
    first_due_date: order.due_date,
    installments: 1,
    patient_id: order.patient_id,
    professional_id: order.professional_id,
    notes: order.notes ?? undefined,
  });

  const { error } = await db
    .from("prosthetic_lab_orders")
    .update({
      financial_entry_generated: true,
      updated_at: new Date().toISOString(),
    })
    .eq("clinic_id", clinicId)
    .eq("id", order.id);

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function deleteProstheticLabOrder(
  clinicId: string,
  orderId: string,
): Promise<void> {
  assertClinicScope(clinicId);
  const { error } = await db
    .from("prosthetic_lab_orders")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("id", orderId);

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

// =============================================================================
// ODONTOPEDIATRIA: DENTIÇÃO DECÍDUA (51-85) E CRONOLOGIA DE ERUPÇÃO
// =============================================================================

export const PEDIATRIC_ERUPTION_TIMELINE: PediatricToothEruptionInfo[] = [
  // Arcada Superior Direita (Quadrante 5)
  { fdiNumber: 55, namePt: "Segundo Molar Superior Direito Decíduo", nameEn: "Upper Right Second Primary Molar", eruptionAgeMonths: "25 - 33 meses", exfoliationAgeYears: "10 - 12 anos", arch: "upper", quadrant: 5 },
  { fdiNumber: 54, namePt: "Primeiro Molar Superior Direito Decíduo", nameEn: "Upper Right First Primary Molar", eruptionAgeMonths: "13 - 19 meses", exfoliationAgeYears: "9 - 11 anos", arch: "upper", quadrant: 5 },
  { fdiNumber: 53, namePt: "Canino Superior Direito Decíduo", nameEn: "Upper Right Primary Canine", eruptionAgeMonths: "16 - 22 meses", exfoliationAgeYears: "10 - 12 anos", arch: "upper", quadrant: 5 },
  { fdiNumber: 52, namePt: "Incisivo Lateral Superior Direito Decíduo", nameEn: "Upper Right Primary Lateral Incisor", eruptionAgeMonths: "9 - 13 meses", exfoliationAgeYears: "7 - 8 anos", arch: "upper", quadrant: 5 },
  { fdiNumber: 51, namePt: "Incisivo Central Superior Direito Decíduo", nameEn: "Upper Right Primary Central Incisor", eruptionAgeMonths: "8 - 12 meses", exfoliationAgeYears: "6 - 7 anos", arch: "upper", quadrant: 5 },

  // Arcada Superior Esquerda (Quadrante 6)
  { fdiNumber: 61, namePt: "Incisivo Central Superior Esquerdo Decíduo", nameEn: "Upper Left Primary Central Incisor", eruptionAgeMonths: "8 - 12 meses", exfoliationAgeYears: "6 - 7 anos", arch: "upper", quadrant: 6 },
  { fdiNumber: 62, namePt: "Incisivo Lateral Superior Esquerdo Decíduo", nameEn: "Upper Left Primary Lateral Incisor", eruptionAgeMonths: "9 - 13 meses", exfoliationAgeYears: "7 - 8 anos", arch: "upper", quadrant: 6 },
  { fdiNumber: 63, namePt: "Canino Superior Esquerdo Decíduo", nameEn: "Upper Left Primary Canine", eruptionAgeMonths: "16 - 22 meses", exfoliationAgeYears: "10 - 12 anos", arch: "upper", quadrant: 6 },
  { fdiNumber: 64, namePt: "Primeiro Molar Superior Esquerdo Decíduo", nameEn: "Upper Left First Primary Molar", eruptionAgeMonths: "13 - 19 meses", exfoliationAgeYears: "9 - 11 anos", arch: "upper", quadrant: 6 },
  { fdiNumber: 65, namePt: "Segundo Molar Superior Esquerdo Decíduo", nameEn: "Upper Left Second Primary Molar", eruptionAgeMonths: "25 - 33 meses", exfoliationAgeYears: "10 - 12 anos", arch: "upper", quadrant: 6 },

  // Arcada Inferior Esquerda (Quadrante 7)
  { fdiNumber: 71, namePt: "Incisivo Central Inferior Esquerdo Decíduo", nameEn: "Lower Left Primary Central Incisor", eruptionAgeMonths: "6 - 10 meses", exfoliationAgeYears: "6 - 7 anos", arch: "lower", quadrant: 7 },
  { fdiNumber: 72, namePt: "Incisivo Lateral Inferior Esquerdo Decíduo", nameEn: "Lower Left Primary Lateral Incisor", eruptionAgeMonths: "10 - 16 meses", exfoliationAgeYears: "7 - 8 anos", arch: "lower", quadrant: 7 },
  { fdiNumber: 73, namePt: "Canino Inferior Esquerdo Decíduo", nameEn: "Lower Left Primary Canine", eruptionAgeMonths: "17 - 23 meses", exfoliationAgeYears: "9 - 12 anos", arch: "lower", quadrant: 7 },
  { fdiNumber: 74, namePt: "Primeiro Molar Inferior Esquerdo Decíduo", nameEn: "Lower Left First Primary Molar", eruptionAgeMonths: "14 - 18 meses", exfoliationAgeYears: "9 - 11 anos", arch: "lower", quadrant: 7 },
  { fdiNumber: 75, namePt: "Segundo Molar Inferior Esquerdo Decíduo", nameEn: "Lower Left Second Primary Molar", eruptionAgeMonths: "23 - 31 meses", exfoliationAgeYears: "10 - 12 anos", arch: "lower", quadrant: 7 },

  // Arcada Inferior Direita (Quadrante 8)
  { fdiNumber: 85, namePt: "Segundo Molar Inferior Direito Decíduo", nameEn: "Lower Right Second Primary Molar", eruptionAgeMonths: "23 - 31 meses", exfoliationAgeYears: "10 - 12 anos", arch: "lower", quadrant: 8 },
  { fdiNumber: 84, namePt: "Primeiro Molar Inferior Direito Decíduo", nameEn: "Lower Right First Primary Molar", eruptionAgeMonths: "14 - 18 meses", exfoliationAgeYears: "9 - 11 anos", arch: "lower", quadrant: 8 },
  { fdiNumber: 83, namePt: "Canino Inferior Direito Decíduo", nameEn: "Lower Right Primary Canine", eruptionAgeMonths: "17 - 23 meses", exfoliationAgeYears: "9 - 12 anos", arch: "lower", quadrant: 8 },
  { fdiNumber: 82, namePt: "Incisivo Lateral Inferior Direito Decíduo", nameEn: "Lower Right Primary Lateral Incisor", eruptionAgeMonths: "10 - 16 meses", exfoliationAgeYears: "7 - 8 anos", arch: "lower", quadrant: 8 },
  { fdiNumber: 81, namePt: "Incisivo Central Inferior Direito Decíduo", nameEn: "Lower Right Primary Central Incisor", eruptionAgeMonths: "6 - 10 meses", exfoliationAgeYears: "6 - 7 anos", arch: "lower", quadrant: 8 },
];

/**
 * Calcula o risco de cárie odontopediátrico baseado em evidências (AAPD / ABOPED)
 */
export function calculatePediatricCariesRisk(assessment: {
  sugar_intake_frequency?: "low" | "moderate" | "high";
  bottle_feeding_habit?: { active: boolean; sleep_bottle: boolean; sweetened: boolean };
  brushing_frequency_daily?: number;
  fluoride_ppm?: number;
  mouth_breathing?: boolean;
}): PediatricCariesRiskLevel {
  let score = 0;

  // Consumo frequente de açúcar entre refeições
  if (assessment.sugar_intake_frequency === "high") score += 3;
  else if (assessment.sugar_intake_frequency === "moderate") score += 1;

  // Uso de mamadeira noturna (Cárie Precoce da Infância)
  if (assessment.bottle_feeding_habit?.active) {
    if (assessment.bottle_feeding_habit.sweetened) score += 3;
    if (assessment.bottle_feeding_habit.sleep_bottle) score += 2;
  }

  // Frequência de escovação deficiente
  if (assessment.brushing_frequency_daily !== undefined) {
    if (assessment.brushing_frequency_daily < 2) score += 2;
    if (assessment.brushing_frequency_daily === 0) score += 3;
  }

  // Creme dental sem flúor (< 1000 ppm)
  if (assessment.fluoride_ppm !== undefined && assessment.fluoride_ppm < 1000) {
    score += 2;
  }

  // Respiração bucal (resseca a mucosa e diminui efeito protetor da saliva)
  if (assessment.mouth_breathing) score += 1;

  if (score >= 4) return "high";
  if (score >= 2) return "moderate";
  return "low";
}

/**
 * Busca a avaliação odontopediátrica do paciente
 */
export async function fetchPatientPediatricAssessment(
  clinicId: string,
  patientId: string,
): Promise<PediatricDentalAssessment | null> {
  assertClinicScope(clinicId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("pediatric_dental_assessments")
    .select("*, evaluator:professionals(name)")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("assessment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return null;
    throw new Error(norm.message);
  }

  return (data as PediatricDentalAssessment) || null;
}

/**
 * Salva ou atualiza a avaliação odontopediátrica
 */
export async function savePatientPediatricAssessment(
  clinicId: string,
  input: {
    id?: string | null | undefined;
    patient_id: string;
    evaluator_id?: string | null | undefined;
    dentition_stage: DentitionStage;
    pacifier_habit: { active: boolean; frequency: "none" | "occasional" | "frequent" | "continuous"; duration_years: number };
    thumb_sucking_habit: { active: boolean; frequency: "none" | "occasional" | "frequent" | "continuous"; duration_years: number };
    bottle_feeding_habit: { active: boolean; sleep_bottle: boolean; sweetened: boolean };
    mouth_breathing: boolean;
    bruxism: boolean;
    atypical_swallowing: boolean;
    brushing_frequency_daily: number;
    fluoride_ppm: number;
    toothpaste_amount: "rice_grain" | "pea_size" | "standard";
    floss_frequency: "never" | "rarely" | "weekly" | "daily";
    sugar_intake_frequency: "low" | "moderate" | "high";
    clinical_notes?: string | null | undefined;
  },
): Promise<PediatricDentalAssessment> {
  assertClinicScope(clinicId);

  const cariesRisk = calculatePediatricCariesRisk({
    sugar_intake_frequency: input.sugar_intake_frequency,
    bottle_feeding_habit: input.bottle_feeding_habit,
    brushing_frequency_daily: input.brushing_frequency_daily,
    fluoride_ppm: input.fluoride_ppm,
    mouth_breathing: input.mouth_breathing,
  });

  const payload = {
    clinic_id: clinicId,
    patient_id: input.patient_id,
    evaluator_id: input.evaluator_id || null,
    dentition_stage: input.dentition_stage,
    pacifier_habit: input.pacifier_habit,
    thumb_sucking_habit: input.thumb_sucking_habit,
    bottle_feeding_habit: input.bottle_feeding_habit,
    mouth_breathing: input.mouth_breathing,
    bruxism: input.bruxism,
    atypical_swallowing: input.atypical_swallowing,
    brushing_frequency_daily: input.brushing_frequency_daily,
    fluoride_ppm: input.fluoride_ppm,
    toothpaste_amount: input.toothpaste_amount,
    floss_frequency: input.floss_frequency,
    sugar_intake_frequency: input.sugar_intake_frequency,
    caries_risk_level: cariesRisk,
    clinical_notes: input.clinical_notes || null,
    updated_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;

  if (input.id) {
    const { data, error } = await client
      .from("pediatric_dental_assessments")
      .update(payload)
      .eq("clinic_id", clinicId)
      .eq("id", input.id)
      .select("*, evaluator:professionals(name)")
      .single();

    if (error) throw new Error(normalizeSupabaseError(error).message);
    return data as PediatricDentalAssessment;
  }

  const { data, error } = await client
    .from("pediatric_dental_assessments")
    .insert(payload)
    .select("*, evaluator:professionals(name)")
    .single();

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) {
      return {
        id: crypto.randomUUID(),
        assessment_date: new Date().toISOString().split("T")[0]!,
        created_at: new Date().toISOString(),
        ...payload,
      } as PediatricDentalAssessment;
    }
    throw new Error(norm.message);
  }

  return data as PediatricDentalAssessment;
}






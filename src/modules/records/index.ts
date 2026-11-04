import { z } from "zod";
import { assertClinicScope, normalizeSupabaseError, supabase } from "@/services/supabase";
import type {
  ClinicalRecord,
  ClinicalRecordType,
  ExamCategory,
  OdontogramEntry,
  PatientExamFile,
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
  | "tcle";

export type PrintablePageSize = "A4" | "A5";

export const DENTAL_CID10_CODES = [
  { code: "Z01.2", description: "Exame odontológico" },
  { code: "K02.9", description: "Cárie dentária não especificada" },
  { code: "K04.0", description: "Pulpite (Urgência Endodôntica)" },
  { code: "K04.7", description: "Abscesso periapical sem fístula" },
  { code: "K01.1", description: "Dentes impactados (Exodontia de Siso)" },
  { code: "K05.1", description: "Gengivite / Tratamento Periodontal" },
  { code: "K08.1", description: "Perda de dentes / Implante Osteointegrado" },
  { code: "K07.6", description: "Transtornos da ATM (DTM)" },
] as const;

export const DENTAL_PRESCRIPTION_PRESETS = [
  {
    id: "dipirona",
    label: "Analgésico — Dipirona 500mg",
    text: "1) Uso Interno (Via Oral)\nDipirona Monoidratada 500mg ------------------------ 1 caixa\nTomar 01 (um) comprimido de 6 em 6 horas, por 3 dias, em caso de dor.",
  },
  {
    id: "ibuprofeno",
    label: "Anti-inflamatório — Ibuprofeno 600mg",
    text: "1) Uso Interno (Via Oral)\nIbuprofeno 600mg ---------------------------------- 1 caixa\nTomar 01 (um) comprimido de 8 em 8 horas, após as refeições, durante 3 dias.",
  },
  {
    id: "amoxicilina",
    label: "Antibiótico — Amoxicilina 500mg (7 dias)",
    text: "1) Uso Interno (Via Oral)\nAmoxicilina 500mg --------------------------------- 21 cápsulas\nTomar 01 (uma) cápsula de 8 em 8 horas, rigorosamente no horário, durante 7 dias.",
  },
  {
    id: "clindamicina",
    label: "Antibiótico (Alérgicos a Penicilina) — Clindamicina 300mg",
    text: "1) Uso Interno (Via Oral)\nCloridrato de Clindamicina 300mg ------------------ 21 cápsulas\nTomar 01 (uma) cápsula de 8 em 8 horas, durante 7 dias.",
  },
  {
    id: "clorexidina",
    label: "Antisséptico Bucal — Clorexidina 0,12%",
    text: "1) Uso Tópico Bucal (Bochecho)\nDigluconato de Clorexidina 0,12% ------------------ 1 frasco (250ml)\nBochechar 15ml sem diluir durante 1 minuto, de 12 em 12 horas, por 7 dias (iniciar 24h após o procedimento).",
  },
] as const;

export const clinicalDocumentInputSchema = z.object({
  kind: z.enum(["prescription_simple", "prescription_controlled", "certificate", "tcle"]),
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
          : "TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)";

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

  <div class="footer-date">
    Data de emissão: <strong>${formattedDate}</strong>
  </div>

  <div class="signatures">
    <div class="sig-col">
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




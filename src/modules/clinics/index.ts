import { z } from "zod";
import { assertClinicScope, normalizeSupabaseError, supabase } from "@/services/supabase";
import type { ClinicUnit, DentalInsurance, ProcedureCatalogItem } from "@/types";
import { isValidCNPJ } from "@/utils/validators";

/**
 * Lista as unidades (Matriz e Filiais) da clínica ativa.
 */
export async function fetchClinicUnits(clinicId: string): Promise<ClinicUnit[]> {
  assertClinicScope(clinicId);
  const client = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts?: { ascending?: boolean }) => Promise<{ data: ClinicUnit[] | null; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await client
    .from("clinic_units")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("is_main", { ascending: false });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) {
      return [];
    }
    throw new Error(norm.message);
  }

  return data ?? [];
}

/**
 * Cria uma nova unidade (Matriz ou Filial) vinculada à clínica ativa.
 */
export async function createClinicUnit(input: {
  clinicId: string;
  name: string;
  cnpj?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  isMain?: boolean;
}): Promise<void> {
  assertClinicScope(input.clinicId);
  const trimmedName = input.name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 120) {
    throw new Error("O nome da unidade deve ter entre 2 e 120 caracteres.");
  }

  const cleanCnpj = input.cnpj ? input.cnpj.replace(/\D/g, "") : "";
  if (cleanCnpj && !isValidCNPJ(cleanCnpj)) {
    throw new Error("CNPJ inválido.");
  }

  const client = supabase as unknown as {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };

  const { error } = await client.from("clinic_units").insert({
    clinic_id: input.clinicId,
    name: trimmedName,
    cnpj: cleanCnpj || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim().toUpperCase().slice(0, 2) || null,
    is_main: Boolean(input.isMain),
    active: true,
  });

  if (error) {
    const norm = normalizeSupabaseError(error);
    throw new Error(norm.message);
  }
}

/**
 * Exclui uma unidade da clínica ativa (respeitando escopo multi-tenant).
 */
export async function deleteClinicUnit(clinicId: string, unitId: string): Promise<void> {
  assertClinicScope(clinicId);
  const client = supabase as unknown as {
    from: (table: string) => {
      delete: () => {
        eq: (c1: string, v1: string) => {
          eq: (c2: string, v2: string) => Promise<{ error: unknown }>;
        };
      };
    };
  };

  const { error } = await client
    .from("clinic_units")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("id", unitId);

  if (error) {
    const norm = normalizeSupabaseError(error);
    throw new Error(norm.message);
  }
}

// =============================================================================
// CATÁLOGO DE PROCEDIMENTOS (TABELA TUSS / HONORÁRIOS) E CONVÊNIOS (ANS)
// =============================================================================

export const DENTAL_SPECIALTIES = [
  "Clínica Geral",
  "Diagnóstico / Radiologia",
  "Prevenção / Profilaxia",
  "Dentística / Restauração",
  "Endodontia",
  "Periodontia",
  "Cirurgia / Exodontia",
  "Implantodontia",
  "Prótese Dentária",
  "Ortodontia",
  "Odontopediatria",
  "Estética / Clareamento",
] as const;

export const STANDARD_TUSS_PROCEDURES = [
  {
    tuss_code: "81000065",
    name: "Consulta odontológica inicial / Avaliação e Plano",
    specialty: "Diagnóstico / Radiologia",
    base_price: 150,
    estimated_material_cost: 15,
    default_duration_minutes: 45,
  },
  {
    tuss_code: "84000198",
    name: "Profilaxia (Polimento coronário) + Aplicação tópica de flúor",
    specialty: "Prevenção / Profilaxia",
    base_price: 220,
    estimated_material_cost: 22,
    default_duration_minutes: 45,
  },
  {
    tuss_code: "85300047",
    name: "Raspagem supragengival (por hemiarcada)",
    specialty: "Periodontia",
    base_price: 250,
    estimated_material_cost: 25,
    default_duration_minutes: 50,
  },
  {
    tuss_code: "85100196",
    name: "Restauração em resina composta fotopolimerizável (1 face)",
    specialty: "Dentística / Restauração",
    base_price: 240,
    estimated_material_cost: 35,
    default_duration_minutes: 45,
  },
  {
    tuss_code: "85100200",
    name: "Restauração em resina composta fotopolimerizável (2 ou mais faces)",
    specialty: "Dentística / Restauração",
    base_price: 320,
    estimated_material_cost: 48,
    default_duration_minutes: 60,
  },
  {
    tuss_code: "85200140",
    name: "Tratamento endodôntico birradicular (Canal)",
    specialty: "Endodontia",
    base_price: 780,
    estimated_material_cost: 110,
    default_duration_minutes: 90,
  },
  {
    tuss_code: "85200158",
    name: "Tratamento endodôntico multirradicular (Molar)",
    specialty: "Endodontia",
    base_price: 1100,
    estimated_material_cost: 150,
    default_duration_minutes: 120,
  },
  {
    tuss_code: "82000875",
    name: "Exodontia simples de permanente",
    specialty: "Cirurgia / Exodontia",
    base_price: 300,
    estimated_material_cost: 40,
    default_duration_minutes: 45,
  },
  {
    tuss_code: "82000859",
    name: "Exodontia de terceiro molar incluso / impactado (Siso)",
    specialty: "Cirurgia / Exodontia",
    base_price: 680,
    estimated_material_cost: 85,
    default_duration_minutes: 60,
  },
  {
    tuss_code: "85400149",
    name: "Coroa total em cerâmica pura / E-max ou Zircônia",
    specialty: "Prótese Dentária",
    base_price: 1850,
    estimated_material_cost: 480,
    default_duration_minutes: 60,
  },
] as const;

export const dentalInsuranceSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do convênio (mín. 2 caracteres).").max(120),
  ans_code: z.string().trim().max(30).optional(),
  cnpj: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isValidCNPJ(v), "CNPJ do convênio inválido."),
  reimbursement_days: z.number().int().min(0).max(180).default(30),
  notes: z.string().trim().max(1000).optional(),
});

export const procedureCatalogSchema = z.object({
  insurance_id: z.string().uuid().nullable().optional(),
  tuss_code: z.string().trim().max(20).optional(),
  name: z.string().trim().min(2, "Informe o nome do procedimento.").max(200),
  specialty: z.string().trim().min(2).max(80).default("Clínica Geral"),
  base_price: z.number().min(0, "O valor base não pode ser negativo."),
  estimated_material_cost: z.number().min(0, "O custo estimado não pode ser negativo.").default(0),
  default_duration_minutes: z
    .number()
    .int()
    .min(10, "Duração mínima de 10 minutos.")
    .max(480, "Duração máxima de 480 minutos.")
    .default(60),
});

export interface ProcedureEconomics {
  basePrice: number;
  materialCost: number;
  netMargin: number;
  marginPct: number;
  hourlyChairRevenue: number;
}

/**
 * Calcula a margem líquida de contribuição (Honorário - Custo de Insumo) e o
 * faturamento por hora de cadeira clínica.
 */
export function calculateProcedureEconomics(
  item: Pick<ProcedureCatalogItem, "base_price" | "estimated_material_cost" | "default_duration_minutes">,
): ProcedureEconomics {
  const basePrice = Math.max(0, Number(item.base_price) || 0);
  const materialCost = Math.max(0, Number(item.estimated_material_cost) || 0);
  const duration = Math.max(10, Number(item.default_duration_minutes) || 60);

  const netMargin = Number((basePrice - materialCost).toFixed(2));
  const marginPct = basePrice > 0 ? Number(((netMargin / basePrice) * 100).toFixed(1)) : 0;
  const hourlyChairRevenue = Number(((basePrice / duration) * 60).toFixed(2));

  return {
    basePrice,
    materialCost,
    netMargin,
    marginPct,
    hourlyChairRevenue,
  };
}

type CatalogDbClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (c1: string, v1: string) => {
        order: (col: string, opts?: { ascending?: boolean }) => Promise<{ data: unknown[] | null; error: unknown }>;
      };
    };
    insert: (rows: Record<string, unknown> | Array<Record<string, unknown>>) => Promise<{ error: unknown }>;
    delete: () => {
      eq: (c1: string, v1: string) => {
        eq: (c2: string, v2: string) => Promise<{ error: unknown }>;
      };
    };
  };
};

const catalogDb = supabase as unknown as CatalogDbClient;

export async function fetchDentalInsurances(clinicId: string): Promise<DentalInsurance[]> {
  assertClinicScope(clinicId);
  const { data, error } = await catalogDb
    .from("dental_insurances")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("name", { ascending: true });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }
  return (data ?? []) as DentalInsurance[];
}

export async function createDentalInsurance(
  clinicId: string,
  input: z.infer<typeof dentalInsuranceSchema>,
): Promise<void> {
  assertClinicScope(clinicId);
  const parsed = dentalInsuranceSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados do convênio inválidos.");
  }

  const d = parsed.data;
  const cleanCnpj = d.cnpj ? d.cnpj.replace(/\D/g, "") : null;
  const { error } = await catalogDb.from("dental_insurances").insert({
    clinic_id: clinicId,
    name: d.name,
    ans_code: d.ans_code?.trim() || null,
    cnpj: cleanCnpj || null,
    reimbursement_days: d.reimbursement_days,
    notes: d.notes?.trim() || null,
    active: true,
  });

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function deleteDentalInsurance(clinicId: string, insuranceId: string): Promise<void> {
  assertClinicScope(clinicId);
  const { error } = await catalogDb
    .from("dental_insurances")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("id", insuranceId);
  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function fetchProcedureCatalog(clinicId: string): Promise<ProcedureCatalogItem[]> {
  assertClinicScope(clinicId);
  const { data, error } = await catalogDb
    .from("procedure_catalog")
    .select("*,dental_insurances(name)")
    .eq("clinic_id", clinicId)
    .order("name", { ascending: true });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }
  return (data ?? []) as ProcedureCatalogItem[];
}

export async function createProcedureCatalogItem(
  clinicId: string,
  input: z.infer<typeof procedureCatalogSchema>,
): Promise<void> {
  assertClinicScope(clinicId);
  const parsed = procedureCatalogSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados do procedimento inválidos.");
  }

  const d = parsed.data;
  const { error } = await catalogDb.from("procedure_catalog").insert({
    clinic_id: clinicId,
    insurance_id: d.insurance_id ?? null,
    tuss_code: d.tuss_code?.trim() || null,
    name: d.name,
    specialty: d.specialty,
    base_price: d.base_price,
    estimated_material_cost: d.estimated_material_cost,
    default_duration_minutes: d.default_duration_minutes,
    active: true,
  });

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function seedStandardTussCatalog(clinicId: string): Promise<void> {
  assertClinicScope(clinicId);
  const rows = STANDARD_TUSS_PROCEDURES.map((p) => ({
    clinic_id: clinicId,
    insurance_id: null,
    tuss_code: p.tuss_code,
    name: p.name,
    specialty: p.specialty,
    base_price: p.base_price,
    estimated_material_cost: p.estimated_material_cost,
    default_duration_minutes: p.default_duration_minutes,
    active: true,
  }));

  const { error } = await catalogDb.from("procedure_catalog").insert(rows);
  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function deleteProcedureCatalogItem(clinicId: string, itemId: string): Promise<void> {
  assertClinicScope(clinicId);
  const { error } = await catalogDb
    .from("procedure_catalog")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("id", itemId);
  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

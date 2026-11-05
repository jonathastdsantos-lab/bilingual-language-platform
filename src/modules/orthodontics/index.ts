import { supabase } from "@/services/supabase";
import type {
  OrthodonticTreatment,
  OrthodonticMaintenance,
  OrthodonticTreatmentStatus,
  HygieneScore,
} from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = supabase as any;

export const ARCHWIRE_CATALOG = [
  // Fios de Alinhamento e Nivelamento (NiTi)
  "0.012 NiTi Termoativado",
  "0.014 NiTi Termoativado",
  "0.016 NiTi Superelástico",
  "0.018 NiTi",
  "0.020 NiTi",
  // Fios de Transição / Retangulares NiTi
  "16x22 NiTi",
  "17x25 NiTi",
  "19x25 NiTi",
  // Fios de Trabalho e Mecânica (Aço Inoxidável)
  "0.016 Aço",
  "0.018 Aço",
  "0.020 Aço",
  "16x22 Aço Retangular",
  "17x25 Aço Retangular",
  "19x25 Aço Retangular (Fechamento de Espaço)",
  "21x25 Aço",
  // Fios de Finalização (TMA / Beta-Titânio e Braided)
  "17x25 TMA",
  "19x25 TMA",
  "17x25 Braided (Multifilamentado)",
  "19x25 Braided",
  "Arco Seccionado / Mola Aberta",
  "Arco Removido / Sem Fio",
];

export const BRACKET_PRESCRIPTIONS = [
  "Roth .022",
  "Roth .018",
  "MBT .022",
  "MBT .018",
  "Edgewise Standard .022",
  "Damon System (Autoligado Passivo)",
  "Capelozza Padrão I",
  "Capelozza Padrão II",
  "Capelozza Padrão III",
  "Alexander .018",
];

export const APPLIANCE_TYPES = [
  "Metálico Convencional",
  "Autoligado Metálico",
  "Autoligado Cerâmico / Safira",
  "Cerâmico Convencional (Estético)",
  "Alinhador Invisível (Clear Aligner)",
  "Expansor Palatino (Disjuntor Hyrax)",
  "Expansor Haas",
  "Aparelho Ortopédico (Bionator / Klammt)",
  "Contenção Fixa 3x3",
  "Contenção Removível Hawley",
  "Placa de Contenção Termoformada (Essix)",
];

export const ELASTICS_CATALOG = [
  "Nenhum elástico intermaxilar",
  "Classe II (3/16 Médio)",
  "Classe II (1/4 Pesado)",
  "Classe III (3/16 Médio)",
  "Classe III (1/4 Pesado)",
  "Interdigitação Triangular (1/8 Médio)",
  "Cruzamento Posterior (3/16 Pesado)",
  "Linha Média (1/4 Médio)",
  "Guia Canino (3/16)",
];

/**
 * Consulta o tratamento ortodôntico ativo do paciente
 */
export async function fetchOrthodonticTreatment(
  clinicId: string,
  patientId: string
): Promise<OrthodonticTreatment | null> {
  const { data, error } = await client
    .from("orthodontic_treatments")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as OrthodonticTreatment;
}

/**
 * Salva ou atualiza a ficha do tratamento ortodôntico
 */
export async function saveOrthodonticTreatment(
  clinicId: string,
  treatment: Partial<OrthodonticTreatment> & { patient_id: string }
): Promise<OrthodonticTreatment> {
  const payload = {
    ...treatment,
    clinic_id: clinicId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("orthodontic_treatments")
    .upsert(payload, { onConflict: "clinic_id, patient_id" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Erro ao salvar tratamento ortodôntico.");
  }

  return data as OrthodonticTreatment;
}

/**
 * Consulta todas as manutenções ortodônticas do tratamento
 */
export async function fetchOrthodonticMaintenances(
  treatmentId: string
): Promise<OrthodonticMaintenance[]> {
  const { data, error } = await client
    .from("orthodontic_maintenances")
    .select("*")
    .eq("treatment_id", treatmentId)
    .order("maintenance_number", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as OrthodonticMaintenance[]) || [];
}

/**
 * Registra uma nova sessão de manutenção ortodôntica e atualiza os arcos atuais do tratamento
 */
export async function recordOrthodonticMaintenance(
  clinicId: string,
  maintenance: Partial<OrthodonticMaintenance> & {
    treatment_id: string;
    patient_id: string;
  }
): Promise<OrthodonticMaintenance> {
  const payload = {
    ...maintenance,
    clinic_id: clinicId,
    created_at: new Date().toISOString(),
  };

  // 1. Inserir a sessão de manutenção
  const { data, error } = await client
    .from("orthodontic_maintenances")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Erro ao registrar manutenção ortodôntica.");
  }

  // 2. Atualizar os arcos vigentes no tratamento ortodôntico
  if (maintenance.upper_archwire || maintenance.lower_archwire) {
    await client
      .from("orthodontic_treatments")
      .update({
        upper_current_arch: maintenance.upper_archwire || null,
        lower_current_arch: maintenance.lower_archwire || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", maintenance.treatment_id);
  }

  return data as OrthodonticMaintenance;
}

/**
 * Calcula o progresso temporal do tratamento ortodôntico
 */
export function calculateOrthodonticProgress(
  treatment: OrthodonticTreatment,
  maintenancesCount: number
): {
  elapsedMonths: number;
  progressPct: number;
  isOverdue: boolean;
} {
  const start = new Date(treatment.start_date);
  const now = new Date();

  let elapsedMonths =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  if (elapsedMonths < 0) elapsedMonths = 0;

  const estimated = Math.max(1, treatment.estimated_duration_months || 24);
  const progressPct = Math.min(
    100,
    Math.round((maintenancesCount / estimated) * 100)
  );
  const isOverdue = elapsedMonths > estimated;

  return {
    elapsedMonths,
    progressPct,
    isOverdue,
  };
}


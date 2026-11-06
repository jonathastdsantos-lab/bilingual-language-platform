/**
 * ============================================================================
 * MÓDULO DE SEGURANÇA LGPD (LEI GERAL DE PROTEÇÃO DE DADOS - LEI 13.709/2018)
 * Trilha de auditoria, mascaramento de dados sensíveis e direito ao esquecimento
 * ============================================================================
 */

import { supabase, assertClinicScope, normalizeSupabaseError } from "@/services/supabase";

export type LgpdAuditAction =
  | "view_patient_profile"
  | "view_clinical_record"
  | "export_patient_data"
  | "edit_sensitive_data"
  | "anonymize_patient"
  | "revoke_consent"
  | "generate_prescription"
  | "view_financial_history";

export interface LgpdAuditLog {
  id: string;
  clinic_id: string;
  user_id: string | null;
  user_email: string | null;
  patient_id: string | null;
  action: LgpdAuditAction;
  resource_type: string;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

/**
 * Registra formalmente um evento de acesso a dados de saúde de paciente (LGPD Art. 6, VIII e Art. 46)
 */
export async function recordLgpdAuditLog(params: {
  clinicId: string;
  patientId?: string | null;
  action: LgpdAuditAction;
  resourceType?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  assertClinicScope(params.clinicId);

  try {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    await client.from("lgpd_access_audit_logs").insert({
      clinic_id: params.clinicId,
      user_id: user?.id || null,
      user_email: user?.email || null,
      patient_id: params.patientId || null,
      action: params.action,
      resource_type: params.resourceType || "patient",
      details: params.details || {},
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch (err) {
    // Não interrompe o fluxo clínico caso a tabela ainda esteja em migração
    console.warn("recordLgpdAuditLog fallback:", err);
  }
}

/**
 * Busca o histórico de acessos a dados pessoais para auditoria do DPO / Proprietário
 */
export async function fetchLgpdAuditLogs(clinicId: string, limit = 50): Promise<LgpdAuditLog[]> {
  assertClinicScope(clinicId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("lgpd_access_audit_logs")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }

  return (data || []) as LgpdAuditLog[];
}

/**
 * Executa o Direito ao Esquecimento / Revogação de Consentimento (LGPD Art. 18)
 * Anonimiza os dados cadastrais do paciente preservando o prontuário para guarda legal (CFO)
 */
export async function anonymizePatientData(clinicId: string, patientId: string): Promise<void> {
  assertClinicScope(clinicId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { error } = await client.rpc("lgpd_anonymize_patient", {
    _clinic_id: clinicId,
    _patient_id: patientId,
  });

  if (error) {
    // Fallback caso a RPC ainda não tenha sido sincronizada no Supabase
    const { error: updateErr } = await client
      .from("patients")
      .update({
        name: `Paciente Anonimizado [${patientId.substring(0, 8)}]`,
        cpf: "000.000.000-00",
        rg: null,
        phone: "00000000000",
        email: null,
        notes: "[Dados anonimizados conforme Art. 18 da LGPD - Lei 13.709/2018]",
      })
      .eq("clinic_id", clinicId)
      .eq("id", patientId);

    if (updateErr) {
      throw new Error(`Falha ao anonimizar paciente: ${updateErr.message}`);
    }

    await recordLgpdAuditLog({
      clinicId,
      patientId,
      action: "anonymize_patient",
      details: { reason: "Solicitação expressa do titular (Art. 18 da LGPD)" },
    });
  }
}

/**
 * Utilitário de Mascaramento de CPF (ex: 123.***.***-00)
 */
export function maskCpf(cpf?: string | null): string {
  if (!cpf) return "***.***.***-**";
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return "***.***.***-**";
  return `${clean.slice(0, 3)}.***.***-${clean.slice(9, 11)}`;
}

/**
 * Utilitário de Mascaramento de Telefone (ex: (11) 9****-1234)
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return "(**) *****-****";
  const clean = phone.replace(/\D/g, "");
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 3)}****-${clean.slice(7, 11)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ****-${clean.slice(6, 10)}`;
  }
  return "(**) *****-****";
}

/**
 * Utilitário de Mascaramento de Email (ex: d***o@gmail.com)
 */
export function maskEmail(email?: string | null): string {
  if (!email || !email.includes("@")) return "*****@*****.***";
  const [user, domain] = email.split("@");
  if (!user || user.length <= 2) return `*@${domain}`;
  return `${user.charAt(0)}***${user.charAt(user.length - 1)}@${domain}`;
}


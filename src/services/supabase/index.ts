import { supabase } from "@/integrations/supabase/client";

export { supabase };

export interface NormalizedDbError {
  code: string;
  message: string;
  isRlsViolation: boolean;
  isConflict: boolean;
  isDuplicate: boolean;
  isSchemaPending: boolean;
}

/**
 * Valida obrigatoriamente o identificador da clínica ativa antes de qualquer
 * operação multi-tenant, prevenindo consultas sem escopo (defesa em profundidade
 * em conjunto com o RLS do PostgreSQL).
 */
export function assertClinicScope(clinicId: string | null | undefined): asserts clinicId is string {
  if (!clinicId || typeof clinicId !== "string" || clinicId.trim().length < 10) {
    throw new Error("Escopo de clínica inválido: operação bloqueada por segurança multi-tenant.");
  }
}

/**
 * Padroniza o tratamento de erros retornados pelo Supabase / PostgreSQL.
 */
export function normalizeSupabaseError(error: unknown, fallbackMessage = "Erro ao processar operação no banco de dados."): NormalizedDbError {
  if (!error || typeof error !== "object") {
    return {
      code: "UNKNOWN",
      message: fallbackMessage,
      isRlsViolation: false,
      isConflict: false,
      isDuplicate: false,
      isSchemaPending: false,
    };
  }

  const err = error as { code?: string; message?: string; details?: string };
  const code = err.code ?? "UNKNOWN";
  const rawMsg = err.message ?? fallbackMessage;

  const isRlsViolation = code === "42501" || rawMsg.toLowerCase().includes("row-level security") || rawMsg.toLowerCase().includes("forbidden");
  const isConflict = code === "23P01" || rawMsg.includes("no_prof_overlap") || rawMsg.includes("no_room_overlap");
  const isDuplicate = code === "23505";
  const isSchemaPending = code === "42P01" || code === "PGRST205" || code === "PGRST204";

  return {
    code,
    message: rawMsg,
    isRlsViolation,
    isConflict,
    isDuplicate,
    isSchemaPending,
  };
}


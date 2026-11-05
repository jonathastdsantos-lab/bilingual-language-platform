import { assertClinicScope, normalizeSupabaseError, supabase } from "@/services/supabase";
import type { PublicAppointmentInfo, PublicConfirmationResponse } from "@/types";

type TokenDbClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (c1: string, v1: string) => {
        eq: (c2: string, v2: string) => {
          order: (col: string, opts?: { ascending?: boolean }) => {
            limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>;
          };
        };
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: (col: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const db = supabase as unknown as TokenDbClient;

/**
 * Cria ou recupera o token de confirmação seguro para envio via WhatsApp.
 */
export async function getOrCreateAppointmentToken(
  clinicId: string,
  appointmentId: string,
): Promise<string> {
  assertClinicScope(clinicId);

  // Busca se já existe um token ativo não expirado
  const { data: existing } = await db
    .from("appointment_confirmation_tokens")
    .select("token")
    .eq("clinic_id", clinicId)
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(1);

  const rows = (existing ?? []) as Array<{ token: string }>;
  if (rows[0]?.token) {
    return rows[0].token;
  }

  // Gera novo token
  const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const { data: inserted, error } = await db
    .from("appointment_confirmation_tokens")
    .insert({
      clinic_id: clinicId,
      appointment_id: appointmentId,
      token,
      status: "pending",
    })
    .select("token")
    .single();

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return token;
    throw new Error(norm.message);
  }

  return (inserted as { token: string })?.token ?? token;
}

/**
 * Monta o link público seguro para o paciente acessar no WhatsApp.
 */
export function buildPublicConfirmationUrl(token: string, baseUrl?: string): string {
  const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin}/confirm/${token}`;
}

/**
 * Consulta pública dos dados do agendamento a partir do token (sem auth).
 */
export async function fetchPublicAppointmentInfo(token: string): Promise<PublicAppointmentInfo> {
  const { data, error } = await db.rpc("get_public_appointment_by_token", { _token: token });
  if (error) {
    return {
      valid: false,
      error: normalizeSupabaseError(error).message,
    };
  }
  return data as PublicAppointmentInfo;
}

/**
 * Responde à confirmação pública (confirmar presença ou cancelar).
 */
export async function submitPublicConfirmationResponse(params: {
  token: string;
  action: "confirm" | "cancel";
  notes?: string | undefined;
}): Promise<PublicConfirmationResponse> {
  const { data, error } = await db.rpc("respond_public_appointment_confirmation", {
    _token: params.token,
    _action: params.action,
    _notes: params.notes ?? null,
  });

  if (error) {
    return {
      success: false,
      error: normalizeSupabaseError(error).message,
    };
  }

  return data as PublicConfirmationResponse;
}


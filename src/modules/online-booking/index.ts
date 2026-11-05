import { supabase } from "@/services/supabase";
import type {
  ClinicBookingSettings,
  PublicClinicBookingData,
  SubmitBookingParams,
  PublicBookingResult,
} from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = supabase as any;

/**
 * Obtém os dados públicos da clínica para a página de agendamento online.
 */
export async function fetchPublicClinicBookingData(
  identifier: string
): Promise<PublicClinicBookingData> {
  const { data, error } = await client.rpc("get_public_clinic_booking_data", {
    _identifier: identifier.trim(),
  });

  if (error) {
    return {
      valid: false,
      error: error.message || "Erro ao consultar dados da clínica para agendamento.",
    };
  }

  return (data as unknown as PublicClinicBookingData) || {
    valid: false,
    error: "Clínica não encontrada.",
  };
}

/**
 * Consulta horários disponíveis em uma data específica para um profissional ou clínica.
 */
export async function fetchAvailableBookingSlots(
  clinicId: string,
  professionalId: string | null,
  date: string
): Promise<string[]> {
  const { data, error } = await client.rpc("get_public_available_booking_slots", {
    _clinic_id: clinicId,
    _professional_id: professionalId || null,
    _date: date,
  });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data as string[];
}

/**
 * Submete o agendamento público feito pelo paciente na web.
 */
export async function submitPublicBooking(
  params: SubmitBookingParams
): Promise<PublicBookingResult> {
  const { data, error } = await client.rpc("submit_public_appointment_booking", {
    _clinic_id: params.clinic_id,
    _unit_id: params.unit_id,
    _professional_id: params.professional_id || null,
    _procedure: params.procedure,
    _starts_at: params.starts_at,
    _patient_name: params.patient_name.trim(),
    _patient_cpf: params.patient_cpf?.trim() || null,
    _patient_phone: params.patient_phone.trim(),
    _patient_email: params.patient_email?.trim() || null,
    _notes: params.notes?.trim() || null,
  });

  if (error) {
    return {
      success: false,
      error: error.message || "Erro ao processar agendamento.",
    };
  }

  return (
    (data as unknown as PublicBookingResult) || {
      success: false,
      error: "Resposta inválida.",
    }
  );
}

/**
 * Busca as configurações de agendamento online da clínica (área autenticada).
 */
export async function fetchClinicBookingSettings(
  clinicId: string
): Promise<ClinicBookingSettings | null> {
  const { data, error } = await client
    .from("clinic_booking_settings")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as unknown as ClinicBookingSettings;
}

/**
 * Atualiza ou insere as configurações de agendamento online da clínica.
 */
export async function updateClinicBookingSettings(
  clinicId: string,
  settings: Partial<ClinicBookingSettings>
): Promise<{ success: boolean; error?: string }> {
  const payload = {
    ...settings,
    clinic_id: clinicId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client
    .from("clinic_booking_settings")
    .upsert(payload, { onConflict: "clinic_id" });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Gera URL absoluta para agendamento online
 */
export function generateBookingLink(slugOrId: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://app.sondapro.com.br";
  return `${origin}/agendar/${slugOrId}`;
}

/**
 * Gera link para o Google Agenda
 */
export function generateGoogleCalendarUrl(params: {
  title: string;
  clinicName: string;
  address?: string | null | undefined;
  startsAt: string;
  endsAt: string;
  details?: string | undefined;
}): string {
  const startIso = new Date(params.startsAt)
    .toISOString()
    .replace(/-|:|\.\d\d\d/g, "");
  const endIso = new Date(params.endsAt)
    .toISOString()
    .replace(/-|:|\.\d\d\d/g, "");

  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: `${params.title} - ${params.clinicName}`,
    dates: `${startIso}/${endIso}`,
    details: params.details || `Consulta odontológica na clínica ${params.clinicName}.`,
    location: params.address || params.clinicName,
  });

  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}

/**
 * Gera mensagem formatada para WhatsApp de confirmação
 */
export function generateBookingWhatsAppMessage(params: {
  clinicName: string;
  patientName: string;
  procedure: string;
  startsAt: string;
  professionalName?: string | null | undefined;
}): string {
  const dateFormatted = new Date(params.startsAt).toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let msg = `Olá, *${params.patientName}*! 🎉\n\n`;
  msg += `Seu agendamento para *${params.procedure}* na *${params.clinicName}* foi realizado com sucesso!\n\n`;
  msg += `📅 *Data e Horário:* ${dateFormatted}\n`;
  if (params.professionalName) {
    msg += `👨‍⚕️ *Profissional:* ${params.professionalName}\n`;
  }
  msg += `\nAgradecemos a sua preferência e aguardamos você!`;

  return encodeURIComponent(msg);
}

import { supabase } from "@/services/supabase";
import type {
  WhatsAppReminderSettings,
  UpcomingAppointmentReminder,
  ReminderType,
} from "@/types";
import { normalizeBrazilianWhatsAppPhone } from "./index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = supabase as any;

export const DEFAULT_REMINDER_24H_TEMPLATE =
  "Olá, {paciente}! Lembramos da sua consulta amanhã ({data}) às {hora} na {clinica} com Dr(a). {profissional}. Para confirmar sua presença ou reagendar, acesse: {link_confirmacao}";

export const DEFAULT_REMINDER_2H_TEMPLATE =
  "Olá, {paciente}! Passando para lembrar que sua consulta na {clinica} com Dr(a). {profissional} será hoje às {hora}. Estamos te aguardando!";

/**
 * Consulta as configurações de lembrete 24h e 2h da clínica
 */
export async function fetchReminderSettings(
  clinicId: string
): Promise<WhatsAppReminderSettings> {
  const { data, error } = await client
    .from("whatsapp_reminder_settings")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (error || !data) {
    return {
      clinic_id: clinicId,
      enabled_24h: true,
      enabled_2h: true,
      template_24h: DEFAULT_REMINDER_24H_TEMPLATE,
      template_2h: DEFAULT_REMINDER_2H_TEMPLATE,
      auto_dispatch_active: false,
      updated_at: new Date().toISOString(),
    };
  }

  return data as WhatsAppReminderSettings;
}

/**
 * Atualiza ou insere as configurações de lembrete da clínica
 */
export async function updateReminderSettings(
  clinicId: string,
  settings: Partial<WhatsAppReminderSettings>
): Promise<{ success: boolean; error?: string }> {
  const payload = {
    ...settings,
    clinic_id: clinicId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client
    .from("whatsapp_reminder_settings")
    .upsert(payload, { onConflict: "clinic_id" });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Consulta as próximas consultas (próximas 48h) e status de envio de lembretes 24h e 2h
 */
export async function fetchUpcomingReminders(
  clinicId: string
): Promise<UpcomingAppointmentReminder[]> {
  const { data, error } = await client.rpc(
    "get_upcoming_appointment_reminders",
    {
      _clinic_id: clinicId,
    }
  );

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data as UpcomingAppointmentReminder[];
}

/**
 * Registra o envio de um lembrete (24h ou 2h)
 */
export async function markReminderSent(
  clinicId: string,
  appointmentId: string,
  patientId: string,
  reminderType: ReminderType,
  phone: string,
  message: string
): Promise<{ success: boolean; reminder_id?: string; error?: string }> {
  const cleanPhone = normalizeBrazilianWhatsAppPhone(phone);

  const { data, error } = await client.rpc("mark_appointment_reminder_sent", {
    _clinic_id: clinicId,
    _appointment_id: appointmentId,
    _patient_id: patientId,
    _reminder_type: reminderType,
    _phone: cleanPhone,
    _message: message,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return (data as { success: boolean; reminder_id?: string }) || { success: true };
}

/**
 * Monta o texto do lembrete a partir do template substituindo as tags dinâmicas
 */
export function buildReminderMessage(
  template: string,
  params: {
    patientName: string;
    clinicName: string;
    startsAt: string;
    professionalName?: string | null | undefined;
    token?: string | null | undefined;
  }
): string {
  const dt = new Date(params.startsAt);
  const dataStr = dt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const horaStr = dt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://app.sondapro.com.br";
  const linkConfirmacao = params.token
    ? `${origin}/confirm/${params.token}`
    : `${origin}`;

  let text = template;
  text = text.replace(/\{paciente\}/gi, params.patientName);
  text = text.replace(/\{clinica\}/gi, params.clinicName);
  text = text.replace(/\{data\}/gi, dataStr);
  text = text.replace(/\{hora\}/gi, horaStr);
  text = text.replace(/\{horario\}/gi, horaStr);
  text = text.replace(
    /\{profissional\}/gi,
    params.professionalName || "Cirurgião-Dentista"
  );
  text = text.replace(/\{link_confirmacao\}/gi, linkConfirmacao);

  return text;
}

/**
 * Gera URL wa.me com mensagem codificada para o WhatsApp
 */
export function buildWhatsAppReminderUrl(phone: string, message: string): string {
  const cleanPhone = normalizeBrazilianWhatsAppPhone(phone);
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encoded}`;
}


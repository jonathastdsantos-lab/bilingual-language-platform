import { z } from "zod";
import { assertClinicScope, normalizeSupabaseError, supabase } from "@/services/supabase";
import type {
  WhatsappDispatchLog,
  WhatsappTemplate,
  WhatsappTemplateCategory,
} from "@/types";

export interface WhatsappTemplateVariables {
  paciente: string;
  data?: string;
  hora?: string;
  profissional?: string;
  procedimento?: string;
  clinica?: string;
  valor?: string;
  link_confirmacao?: string;
}

export const WHATSAPP_CATEGORIES: WhatsappTemplateCategory[] = [
  "confirmation",
  "reminder",
  "post_op",
  "recall",
  "financial",
];

export const DEFAULT_WHATSAPP_TEMPLATES: Array<{
  name: string;
  category: WhatsappTemplateCategory;
  body_template: string;
}> = [
  {
    name: "Confirmação de Consulta (Link Seguro)",
    category: "confirmation",
    body_template:
      "Olá, {paciente}! Aqui é da {clinica}. Confirmamos seu atendimento com Dr(a). {profissional} no dia {data} às {hora}. Para confirmar sua presença em 1 clique ou reagendar, acesse: {link_confirmacao}",
  },
  {
    name: "Lembrete no Dia do Atendimento",
    category: "reminder",
    body_template:
      "Olá, {paciente}! Passando para lembrar do seu atendimento hoje ({data}) às {hora} na {clinica} com Dr(a). {profissional}. Estamos aguardando você!",
  },
  {
    name: "Orientações Pós-Operatórias",
    category: "post_op",
    body_template:
      "Olá, {paciente}! Aqui é da {clinica}. Como você está se sentindo após o procedimento ({procedimento}) com Dr(a). {profissional}? Lembre-se de seguir as recomendações prescritas e, se precisar, fale conosco.",
  },
  {
    name: "Retorno Preventivo / Profilaxia",
    category: "recall",
    body_template:
      "Olá, {paciente}! Aqui é da {clinica}. Está chegando o período ideal para sua revisão odontológica e profilaxia com Dr(a). {profissional}. Qual o melhor dia para agendarmos?",
  },
  {
    name: "Aviso Financeiro / Parcela",
    category: "financial",
    body_template:
      "Olá, {paciente}! Aqui é do setor financeiro da {clinica}. Lembramos do vencimento referente a {procedimento} em {data}. Caso já tenha efetuado o pagamento, desconsidere esta mensagem.",
  },
];

export const whatsappTemplateFormSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do modelo.").max(120),
  category: z.enum(["confirmation", "reminder", "post_op", "recall", "financial"]),
  body_template: z
    .string()
    .trim()
    .min(5, "Digite o texto da mensagem.")
    .max(1500),
});

/**
 * Normaliza números de telefone brasileiros para o padrão internacional DDI 55 (ex.: 5511999998888).
 */
export function normalizeBrazilianWhatsAppPhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

/**
 * Substitui as variáveis dinâmicas ({paciente}, {data}, {hora}, {profissional}, {procedimento}, {clinica}, {valor})
 * pelo contexto real do agendamento ou paciente.
 */
export function interpolateWhatsappTemplate(
  template: string,
  vars: WhatsappTemplateVariables,
): string {
  const map: Record<string, string> = {
    "{paciente}": vars.paciente || "Paciente",
    "{data}": vars.data || "—",
    "{hora}": vars.hora || "—",
    "{profissional}": vars.profissional || "Dentista",
    "{procedimento}": vars.procedimento || "Avaliação Odontológica",
    "{clinica}": vars.clinica || "Clínica Odontológica",
    "{valor}": vars.valor || "",
    "{link_confirmacao}": vars.link_confirmacao || "",
  };

  return template.replace(
    /\{(paciente|data|hora|profissional|procedimento|clinica|valor|link_confirmacao)\}/g,
    (match) => map[match] ?? match,
  );
}

/**
 * Gera a URL oficial do WhatsApp Web / App (`https://wa.me/...`) com número normalizado e texto codificado.
 */
export function buildWhatsAppWebUrl(phone: string, message: string): string {
  const normalized = normalizeBrazilianWhatsAppPhone(phone);
  if (!normalized || normalized.length < 10) {
    throw new Error("Número de WhatsApp/telefone inválido ou ausente no cadastro do paciente.");
  }
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message.trim())}`;
}

// =============================================================================
// OPERAÇÕES NO BANCO DE DADOS (SUPABASE MULTI-TENANT)
// =============================================================================

type WhatsappDbClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (c1: string, v1: string) => {
        order: (col: string, opts?: { ascending?: boolean }) => {
          limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>;
        };
      };
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    delete: () => {
      eq: (c1: string, v1: string) => {
        eq: (c2: string, v2: string) => Promise<{ error: unknown }>;
      };
    };
  };
};

const db = supabase as unknown as WhatsappDbClient;

export async function fetchWhatsappTemplates(clinicId: string): Promise<WhatsappTemplate[]> {
  assertClinicScope(clinicId);
  const { data, error } = await db
    .from("whatsapp_templates")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }
  return (data ?? []) as WhatsappTemplate[];
}

export async function createWhatsappTemplate(
  clinicId: string,
  input: z.infer<typeof whatsappTemplateFormSchema>,
): Promise<void> {
  assertClinicScope(clinicId);
  const parsed = whatsappTemplateFormSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Modelo de mensagem inválido.");
  }

  const d = parsed.data;
  const { error } = await db.from("whatsapp_templates").insert({
    clinic_id: clinicId,
    name: d.name,
    category: d.category,
    body_template: d.body_template,
    active: true,
  });

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function deleteWhatsappTemplate(
  clinicId: string,
  templateId: string,
): Promise<void> {
  assertClinicScope(clinicId);
  const { error } = await db
    .from("whatsapp_templates")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("id", templateId);

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function fetchWhatsappDispatchLogs(
  clinicId: string,
): Promise<WhatsappDispatchLog[]> {
  assertClinicScope(clinicId);
  const { data, error } = await db
    .from("whatsapp_dispatch_logs")
    .select("*,patients(full_name)")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }
  return (data ?? []) as WhatsappDispatchLog[];
}

export async function logWhatsappDispatch(params: {
  clinicId: string;
  patientId?: string | null;
  appointmentId?: string | null;
  templateCategory: WhatsappTemplateCategory;
  phoneNumber: string;
  renderedMessage: string;
}): Promise<void> {
  assertClinicScope(params.clinicId);
  const { error } = await db.from("whatsapp_dispatch_logs").insert({
    clinic_id: params.clinicId,
    patient_id: params.patientId ?? null,
    appointment_id: params.appointmentId ?? null,
    template_category: params.templateCategory,
    phone_number: normalizeBrazilianWhatsAppPhone(params.phoneNumber),
    rendered_message: params.renderedMessage,
  });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return;
    throw new Error(norm.message);
  }
}


/**
 * SondaPro Dental - WhatsApp CRM & Régua de Relacionamento Automática
 * 
 * Implementa o ciclo completo de relacionamento com o paciente:
 * 1. Boas-vindas ao Novo Paciente
 * 2. Confirmação Ativa de Consulta (48h/24h)
 * 3. Cuidado Pós-Operatório Humanizado (24h após atendimento)
 * 4. Pesquisa de Satisfação NPS & Google Avaliações (48h após consulta)
 * 5. Aniversariantes do Dia / Mês com mimo de cortesia
 * 6. Recall Preventivo / Pacientes Inativos (180 dias sem retorno)
 * 7. Resgate de Orçamentos Pendentes (Follow-up de planos não iniciados)
 */

import { supabase } from "@/services/supabase";
import { normalizeBrazilianWhatsAppPhone } from "@/modules/whatsapp";

export type RelationshipStageKey =
  | "welcome"
  | "confirmation_48h"
  | "post_op_care"
  | "nps_survey"
  | "birthday_greeting"
  | "preventive_recall"
  | "open_treatment_recovery";

export interface RelationshipStageConfig {
  id: RelationshipStageKey;
  name: string;
  description: string;
  enabled: boolean;
  delayHours: number; // Intervalo em horas após o evento gatilho
  template: string;
  category: "acquisition" | "retention" | "care" | "nps" | "reactivation";
}

export interface RelationshipRuleSettings {
  clinicId: string;
  googleReviewUrl: string;
  autoDispatchActive: boolean;
  stages: Record<RelationshipStageKey, RelationshipStageConfig>;
  updatedAt: string;
}

export interface CrmPatientLead {
  patientId: string;
  fullName: string;
  phone: string;
  stage: RelationshipStageKey;
  stageName: string;
  triggerDate: string;
  professionalName?: string;
  procedureName?: string;
  amount?: number;
  lastVisitDaysAgo?: number;
  status: "pending" | "sent" | "converted" | "cancelled";
  messageText: string;
  googleReviewUrl?: string;
}

export const DEFAULT_RELATIONSHIP_STAGES: Record<RelationshipStageKey, RelationshipStageConfig> = {
  welcome: {
    id: "welcome",
    name: "1. Boas-vindas ao Novo Paciente",
    description: "Enviado imediatamente após o cadastro do paciente na clínica.",
    enabled: true,
    delayHours: 0,
    category: "acquisition",
    template:
      "Olá, {paciente}! Seja muito bem-vindo(a) à {clinica}! 🦷✨ É uma grande alegria cuidar do seu sorriso. Para acessar seu histórico, receitas e agendamentos pelo celular, acesse seu portal exclusivo: {link_portal}. Se precisar de qualquer informação, estamos à disposição!",
  },
  confirmation_48h: {
    id: "confirmation_48h",
    name: "2. Confirmação & Lembrete de Consulta",
    description: "Enviado de 24h a 48h antes da consulta com link de confirmação em 1 clique.",
    enabled: true,
    delayHours: 24,
    category: "retention",
    template:
      "Olá, {paciente}! Lembramos da sua consulta na {clinica} com Dr(a). {profissional} agendada para {data} às {hora} ({procedimento}). Por favor, confirme sua presença em 1 clique ou solicite reagendamento no link: {link_confirmacao}",
  },
  post_op_care: {
    id: "post_op_care",
    name: "3. Cuidado Pós-Operatório Humanizado",
    description: "Enviado 24h após procedimentos cirúrgicos, canal, restauração ou implante.",
    enabled: true,
    delayHours: 24,
    category: "care",
    template:
      "Olá, {paciente}! Aqui é da equipe da {clinica}. Como você está se sentindo hoje após o atendimento de {procedimento} com Dr(a). {profissional}? Lembre-se de manter o repouso e seguir as orientações prescritas. Se sentir qualquer desconforto, nos chame imediatamente por aqui!",
  },
  nps_survey: {
    id: "nps_survey",
    name: "4. Pesquisa de Satisfação NPS & Google Avaliações",
    description: "Enviado 48h após a consulta. Se a experiência foi ótima, convida a avaliar no Google.",
    enabled: true,
    delayHours: 48,
    category: "nps",
    template:
      "Olá, {paciente}! Sua opinião é muito valiosa para nós na {clinica}. Como foi sua experiência recente com Dr(a). {profissional}? De 0 a 10, o quanto recomendaria nossa clínica para um amigo? Se puder nos avaliar com 5 estrelas no Google, ficaremos muito gratos: {link_google}",
  },
  birthday_greeting: {
    id: "birthday_greeting",
    name: "5. Parabéns Aniversariante com Mimo",
    description: "Enviado automaticamente no dia do aniversário do paciente com cortesia especial.",
    enabled: true,
    delayHours: 0,
    category: "retention",
    template:
      "Parabéns, {paciente}! 🎂🎉 Toda a equipe da {clinica} deseja a você um feliz aniversário, com muita saúde, paz e motivos para sorrir! Como presente especial, preparamos uma cortesia de profilaxia / check-up estético válida durante este mês. Agende sua visita de presente!",
  },
  preventive_recall: {
    id: "preventive_recall",
    name: "6. Recall Preventivo (Pacientes sem Retorno há 6 Meses)",
    description: "Reativa pacientes que não comparecem há mais de 180 dias para profilaxia e revisão.",
    enabled: true,
    delayHours: 4320, // 180 dias
    category: "reactivation",
    template:
      "Olá, {paciente}! Já faz 6 meses desde seu último atendimento na {clinica}. Para garantir a saúde da sua gengiva, dentes e evitar surpresas desagradáveis, está na hora do seu check-up semestral e limpeza. Vamos agendar seu horário nesta semana?",
  },
  open_treatment_recovery: {
    id: "open_treatment_recovery",
    name: "7. Resgate de Orçamentos Pendentes",
    description: "Follow-up cordial enviado 15 a 30 dias após avaliação onde o plano não foi iniciado.",
    enabled: true,
    delayHours: 360, // 15 dias
    category: "acquisition",
    template:
      "Olá, {paciente}! Tudo bem? Passando para saber se ficou com alguma dúvida sobre o plano de tratamento ({procedimento}) conversado na {clinica}. Facilitamos o pagamento no cartão ou boleto parcelado para você cuidar da sua saúde sem adiar. Vamos conversar?",
  },
};

const STORAGE_KEY_PREFIX = "sondapro.whatsapp.relationship_rules.";

/**
 * Carrega as configurações da Régua de Relacionamento da clínica
 */
export function getRelationshipRuleSettings(clinicId: string): RelationshipRuleSettings {
  if (typeof window === "undefined") {
    return {
      clinicId,
      googleReviewUrl: "https://g.page/r/sua-clinica/review",
      autoDispatchActive: false,
      stages: DEFAULT_RELATIONSHIP_STAGES,
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${clinicId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        clinicId,
        googleReviewUrl: parsed.googleReviewUrl || "https://g.page/r/sua-clinica/review",
        autoDispatchActive: !!parsed.autoDispatchActive,
        stages: {
          ...DEFAULT_RELATIONSHIP_STAGES,
          ...(parsed.stages || {}),
        },
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // fallback
  }

  return {
    clinicId,
    googleReviewUrl: "https://g.page/r/sua-clinica/review",
    autoDispatchActive: false,
    stages: DEFAULT_RELATIONSHIP_STAGES,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Salva as configurações da Régua de Relacionamento no armazenamento local
 */
export function saveRelationshipRuleSettings(
  clinicId: string,
  settings: Partial<RelationshipRuleSettings>
): RelationshipRuleSettings {
  const current = getRelationshipRuleSettings(clinicId);
  const updated: RelationshipRuleSettings = {
    ...current,
    ...settings,
    stages: {
      ...current.stages,
      ...(settings.stages || {}),
    },
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${clinicId}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  return updated;
}

/**
 * Substitui todas as variáveis dinâmicas da mensagem da régua
 */
export function renderRelationshipMessage(
  template: string,
  vars: {
    paciente: string;
    clinica: string;
    profissional?: string | undefined;
    procedimento?: string | undefined;
    data?: string | undefined;
    hora?: string | undefined;
    link_portal?: string | undefined;
    link_confirmacao?: string | undefined;
    link_google?: string | undefined;
  }
): string {
  let rendered = template;
  rendered = rendered.replace(/{paciente}/g, vars.paciente || "Paciente");
  rendered = rendered.replace(/{clinica}/g, vars.clinica || "Clínica Odontológica");
  rendered = rendered.replace(/{profissional}/g, vars.profissional || "Cirurgião-Dentista");
  rendered = rendered.replace(/{procedimento}/g, vars.procedimento || "Atendimento Odontológico");
  rendered = rendered.replace(/{data}/g, vars.data || "hoje");
  rendered = rendered.replace(/{hora}/g, vars.hora || "");
  rendered = rendered.replace(
    /{link_portal}/g,
    vars.link_portal || `${typeof window !== "undefined" ? window.location.origin : ""}/portal`
  );
  rendered = rendered.replace(
    /{link_confirmacao}/g,
    vars.link_confirmacao || `${typeof window !== "undefined" ? window.location.origin : ""}/portal`
  );
  rendered = rendered.replace(
    /{link_google}/g,
    vars.link_google || "https://g.page/r/sua-clinica/review"
  );
  return rendered;
}

/**
 * Monta o link web de disparo direto via WhatsApp Web / App
 */
export function buildRelationshipWhatsAppUrl(phone: string, text: string): string {
  const cleanPhone = normalizeBrazilianWhatsAppPhone(phone);
  const encodedText = encodeURIComponent(text);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

/**
 * Computa os pacientes elegíveis para cada etapa do Funil de Relacionamento WhatsApp
 */
export async function computeCrmPatientsQueue(
  clinicId: string,
  clinicName: string
): Promise<CrmPatientLead[]> {
  const settings = getRelationshipRuleSettings(clinicId);
  const leads: CrmPatientLead[] = [];
  const now = new Date();

  try {
    // 1. Busca pacientes da clínica
    const { data: patientsData } = await supabase
      .from("patients")
      .select("id, full_name, phone, birth_date, created_at")
      .eq("clinic_id", clinicId)
      .limit(300);

    const patients = patientsData || [];

    // 2. Busca agendamentos recentes e futuros
    const { data: appointmentsData } = await supabase
      .from("appointments")
      .select("id, patient_id, professional_id, starts_at, status, procedure, professionals(name), patients(full_name, phone)")
      .eq("clinic_id", clinicId)
      .order("starts_at", { ascending: false })
      .limit(300);

    const appointments = appointmentsData || [];

    // 3. Processa cada paciente no motor da Régua
    for (const patient of patients) {
      if (!patient.phone) continue;

      const pAppts = appointments.filter((a) => a.patient_id === patient.id);
      const lastAppt = pAppts[0];
      const futureAppt = pAppts.find((a) => new Date(a.starts_at) > now);

      // A) Aniversariantes do Dia
      if (settings.stages.birthday_greeting.enabled && patient.birth_date) {
        const bdate = new Date(`${patient.birth_date}T12:00:00`);
        if (bdate.getDate() === now.getDate() && bdate.getMonth() === now.getMonth()) {
          leads.push({
            patientId: patient.id,
            fullName: patient.full_name || "Paciente",
            phone: patient.phone,
            stage: "birthday_greeting",
            stageName: "Aniversariante de Hoje",
            triggerDate: now.toISOString(),
            status: "pending",
            messageText: renderRelationshipMessage(settings.stages.birthday_greeting.template, {
              paciente: patient.full_name || "Paciente",
              clinica: clinicName,
            }),
          });
        }
      }

      // B) Confirmação de Consulta (Futura nas próximas 48h)
      if (settings.stages.confirmation_48h.enabled && futureAppt) {
        const apptDate = new Date(futureAppt.starts_at);
        const diffHours = (apptDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (diffHours > 0 && diffHours <= 48 && futureAppt.status !== "confirmed") {
          leads.push({
            patientId: patient.id,
            fullName: patient.full_name || "Paciente",
            phone: patient.phone,
            stage: "confirmation_48h",
            stageName: "Confirmação de Consulta",
            triggerDate: futureAppt.starts_at,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            professionalName: (futureAppt as any)?.professionals?.name || "Dentista",
            procedureName: futureAppt.procedure || "Consulta Odontológica",
            status: "pending",
            messageText: renderRelationshipMessage(settings.stages.confirmation_48h.template, {
              paciente: patient.full_name || "Paciente",
              clinica: clinicName,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              profissional: (futureAppt as any)?.professionals?.name,
              procedimento: futureAppt.procedure || undefined,
              data: apptDate.toLocaleDateString("pt-BR"),
              hora: apptDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            }),
          });
        }
      }

      // C) Pós-Operatório & NPS (Consulta concluída há 1 a 3 dias)
      if (lastAppt && lastAppt.status === "completed") {
        const lastDate = new Date(lastAppt.starts_at);
        const daysAgo = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

        if (settings.stages.post_op_care.enabled && daysAgo === 1) {
          leads.push({
            patientId: patient.id,
            fullName: patient.full_name || "Paciente",
            phone: patient.phone,
            stage: "post_op_care",
            stageName: "Pós-Operatório (24h)",
            triggerDate: lastAppt.starts_at,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            professionalName: (lastAppt as any)?.professionals?.name || "Dentista",
            procedureName: lastAppt.procedure || "Procedimento",
            status: "pending",
            messageText: renderRelationshipMessage(settings.stages.post_op_care.template, {
              paciente: patient.full_name || "Paciente",
              clinica: clinicName,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              profissional: (lastAppt as any)?.professionals?.name,
              procedimento: lastAppt.procedure || undefined,
            }),
          });
        } else if (settings.stages.nps_survey.enabled && daysAgo === 2) {
          leads.push({
            patientId: patient.id,
            fullName: patient.full_name || "Paciente",
            phone: patient.phone,
            stage: "nps_survey",
            stageName: "Pesquisa NPS & Google",
            triggerDate: lastAppt.starts_at,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            professionalName: (lastAppt as any)?.professionals?.name || "Dentista",
            googleReviewUrl: settings.googleReviewUrl,
            status: "pending",
            messageText: renderRelationshipMessage(settings.stages.nps_survey.template, {
              paciente: patient.full_name || "Paciente",
              clinica: clinicName,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              profissional: (lastAppt as any)?.professionals?.name,
              link_google: settings.googleReviewUrl,
            }),
          });
        }
      }

      // D) Recall Preventivo (Sem atendimento há mais de 180 dias)
      if (settings.stages.preventive_recall.enabled && lastAppt) {
        const lastDate = new Date(lastAppt.starts_at);
        const daysAgo = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysAgo >= 180 && !futureAppt) {
          leads.push({
            patientId: patient.id,
            fullName: patient.full_name || "Paciente",
            phone: patient.phone,
            stage: "preventive_recall",
            stageName: "Recall Preventivo (6 Meses)",
            triggerDate: lastAppt.starts_at,
            lastVisitDaysAgo: daysAgo,
            status: "pending",
            messageText: renderRelationshipMessage(settings.stages.preventive_recall.template, {
              paciente: patient.full_name || "Paciente",
              clinica: clinicName,
            }),
          });
        }
      }

      // E) Boas-Vindas ao Novo Paciente (Cadastrado recentemente sem consultas anteriores)
      if (settings.stages.welcome.enabled && pAppts.length === 0) {
        const createdDate = new Date(patient.created_at);
        const daysSinceCreation = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceCreation <= 7) {
          leads.push({
            patientId: patient.id,
            fullName: patient.full_name || "Paciente",
            phone: patient.phone,
            stage: "welcome",
            stageName: "Boas-vindas Novo Paciente",
            triggerDate: patient.created_at,
            status: "pending",
            messageText: renderRelationshipMessage(settings.stages.welcome.template, {
              paciente: patient.full_name || "Paciente",
              clinica: clinicName,
            }),
          });
        }
      }
    }
  } catch (err) {
    console.error("Erro ao computar fila do CRM:", err);
  }

  return leads;
}

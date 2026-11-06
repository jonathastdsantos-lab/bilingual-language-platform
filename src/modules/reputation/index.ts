/**
 * SondaPro Dental - Motor de Reputação & Crescimento: Pesquisa NPS + Google Meu Negócio
 * 
 * Funcionalidades:
 * 1. Triagem Inteligente de Feedback (Smart Filtering):
 *    - Promotores (Notas 9-10): Convidados automaticamente a avaliar no Google Meu Negócio com 5 estrelas.
 *    - Detratores (Notas 0-6) e Neutros (7-8): Acolhidos internamente, com alerta imediato para a gerência/dono no WhatsApp.
 * 2. Cálculo do NPS Oficial (-100 a +100) e Zonas de Classificação (Excelência, Qualidade, Aperfeiçoamento, Crítica).
 * 3. Opções completas de Ativar e Desativar para cada recurso.
 * 4. Rota pública /avaliacao para votação amigável no celular.
 */

export type NpsScore = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type NpsCategory = "promoter" | "neutral" | "detractor";
export type NpsZone = "excellence" | "quality" | "improvement" | "critical";

export interface NpsFeedbackRecord {
  id: string;
  clinicId: string;
  patientId?: string | undefined;
  patientName: string;
  patientPhone?: string | undefined;
  professionalName?: string | undefined;
  appointmentId?: string | undefined;
  score: number;
  category: NpsCategory;
  comment?: string | undefined;
  redirectedToGoogle: boolean;
  status: "new" | "resolved" | "contacted";
  managerAlertSent: boolean;
  resolutionNotes?: string | undefined;
  resolvedAt?: string | undefined;
  createdAt: string;
}

export type NpsFeedback = NpsFeedbackRecord;

export interface NpsReputationSettings {
  clinicId: string;
  enabled: boolean; // Ativar/Desativar Módulo de Reputação
  googleReviewUrl: string; // Link da página de avaliações do Google Meu Negócio
  minimumScoreForGoogle: number; // Nota mínima para convite ao Google (padrão 9)
  autoSendAfterAppointment: boolean; // Ativar/Desativar envio automático após consulta
  delayHours: number; // Tempo de espera após consulta (padrão 48h)
  enableGoogleRedirectForPromoters: boolean; // Ativar/Desativar redirecionamento ao Google para Promotores
  enableManagerAlertOnDetractor: boolean; // Ativar/Desativar alerta no WhatsApp do gestor se nota <= 6
  managerAlertPhone?: string | undefined;
  surveyQuestionText: string;
  promoterThankYouText: string;
  detractorApologyText: string;
  customRewardEnabled: boolean; // Ativar/Desativar mimo de recompensa
  customRewardDescription?: string | undefined;
  updatedAt: string;
}

const STORAGE_NPS_CONFIG_KEY = "sondapro.reputation.settings.";
const STORAGE_NPS_FEEDBACKS_KEY = "sondapro.reputation.feedbacks.";

export const DEFAULT_REPUTATION_SETTINGS: NpsReputationSettings = {
  clinicId: "default",
  enabled: true,
  googleReviewUrl: "https://g.page/r/sua-clinica/review",
  minimumScoreForGoogle: 9,
  autoSendAfterAppointment: true,
  delayHours: 48,
  enableGoogleRedirectForPromoters: true,
  enableManagerAlertOnDetractor: true,
  managerAlertPhone: "",
  surveyQuestionText: "De 0 a 10, o quanto você recomendaria nossa clínica e equipe para um amigo ou familiar?",
  promoterThankYouText: "Ficamos muito felizes com a sua satisfação! 🌟 Se puder nos avaliar com 5 estrelas no Google, nos ajudará imensamente a levar sorrisos a mais pessoas.",
  detractorApologyText: "Agradecemos o seu feedback sincero. Nosso compromisso é com a excelência do seu atendimento e nossa gerência entrará em contato para entender como podemos melhorar.",
  customRewardEnabled: false,
  customRewardDescription: "Cortesia de kit de higiene bucal ou desconto especial no próximo check-up.",
  updatedAt: new Date().toISOString(),
};

/**
 * Classifica a nota do paciente segundo a metodologia Net Promoter Score
 */
export function getNpsCategory(score: number): NpsCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "neutral";
  return "detractor";
}

/**
 * Carrega as configurações de reputação da clínica
 */
export function getReputationSettings(clinicId: string): NpsReputationSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_REPUTATION_SETTINGS, clinicId };
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_NPS_CONFIG_KEY}${clinicId}`);
    if (raw) {
      return {
        ...DEFAULT_REPUTATION_SETTINGS,
        ...JSON.parse(raw),
        clinicId,
      };
    }
  } catch {
    // fallback
  }

  return { ...DEFAULT_REPUTATION_SETTINGS, clinicId };
}

/**
 * Salva as configurações de reputação e switches no armazenamento
 */
export function saveReputationSettings(
  clinicId: string,
  settings: Partial<NpsReputationSettings>
): NpsReputationSettings {
  const current = getReputationSettings(clinicId);
  const updated: NpsReputationSettings = {
    ...current,
    ...settings,
    clinicId,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${STORAGE_NPS_CONFIG_KEY}${clinicId}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  return updated;
}

/**
 * Calcula a pontuação e métricas do NPS
 * NPS = % Promotores (9-10) - % Detratores (0-6) -> Varia de -100 a +100
 */
export function calculateNpsScore(feedbacks: NpsFeedbackRecord[]): {
  npsScore: number;
  zone: NpsZone;
  promotersPct: number;
  neutralsPct: number;
  detractorsPct: number;
  totalCount: number;
  averageRating: number;
} {
  const total = feedbacks.length;
  if (total === 0) {
    return {
      npsScore: 100,
      zone: "excellence",
      promotersPct: 100,
      neutralsPct: 0,
      detractorsPct: 0,
      totalCount: 0,
      averageRating: 10,
    };
  }

  let promoters = 0;
  let neutrals = 0;
  let detractors = 0;
  let sumScores = 0;

  for (const f of feedbacks) {
    sumScores += f.score;
    if (f.score >= 9) promoters++;
    else if (f.score >= 7) neutrals++;
    else detractors++;
  }

  const promotersPct = Math.round((promoters / total) * 100);
  const neutralsPct = Math.round((neutrals / total) * 100);
  const detractorsPct = Math.round((detractors / total) * 100);
  const npsScore = promotersPct - detractorsPct;
  const averageRating = Number((sumScores / total).toFixed(1));

  let zone: NpsZone = "excellence";
  if (npsScore >= 75) zone = "excellence"; // 75 a 100
  else if (npsScore >= 50) zone = "quality"; // 50 a 74
  else if (npsScore >= 0) zone = "improvement"; // 0 a 49
  else zone = "critical"; // < 0

  return {
    npsScore,
    zone,
    promotersPct,
    neutralsPct,
    detractorsPct,
    totalCount: total,
    averageRating,
  };
}

/**
 * Carrega a lista de feedbacks NPS da clínica
 */
export function fetchClinicNpsFeedbacks(clinicId: string): NpsFeedbackRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(`${STORAGE_NPS_FEEDBACKS_KEY}${clinicId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // fallback
  }

  // Exemplos reais de demonstração imediata
  const seedFeedbacks: NpsFeedbackRecord[] = [
    {
      id: "nps_01",
      clinicId,
      patientName: "Mariana Alencar Costa",
      patientPhone: "11988881111",
      professionalName: "Dra. Carolina Mendes",
      score: 10,
      category: "promoter",
      comment: "Atendimento impecável! A Dra. Carolina foi super delicada no clareamento e a recepção é acolhedora.",
      redirectedToGoogle: true,
      status: "resolved",
      managerAlertSent: false,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: "nps_02",
      clinicId,
      patientName: "Rodrigo Toledo Silva",
      patientPhone: "11977772222",
      professionalName: "Dr. Roberto Albuquerque",
      score: 10,
      category: "promoter",
      comment: "Excelente estrutura. Painel na TV moderno e atendimento no horário exato sem atraso.",
      redirectedToGoogle: true,
      status: "resolved",
      managerAlertSent: false,
      createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    },
    {
      id: "nps_03",
      clinicId,
      patientName: "Camila Guimarães",
      patientPhone: "11966663333",
      professionalName: "Dra. Carolina Mendes",
      score: 8,
      category: "neutral",
      comment: "O tratamento foi ótimo, mas tive um pouco de dificuldade para encontrar vaga de estacionamento próxima.",
      redirectedToGoogle: false,
      status: "contacted",
      managerAlertSent: false,
      createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
    },
    {
      id: "nps_04",
      clinicId,
      patientName: "Felipe Andrade",
      patientPhone: "11955554444",
      professionalName: "Dr. Roberto Albuquerque",
      score: 5,
      category: "detractor",
      comment: "A consulta atrasou 25 minutos do horário marcado. Gostaria de mais pontualidade na agenda.",
      redirectedToGoogle: false,
      status: "new",
      managerAlertSent: true,
      createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    },
  ];

  try {
    localStorage.setItem(`${STORAGE_NPS_FEEDBACKS_KEY}${clinicId}`, JSON.stringify(seedFeedbacks));
  } catch {
    // ignore
  }

  return seedFeedbacks;
}

/**
 * Submete uma nova resposta de NPS enviada pelo paciente na rota /avaliacao
 */
export async function submitNpsFeedback(
  clinicId: string,
  payload: {
    patientName: string;
    patientPhone?: string | undefined;
    professionalName?: string | undefined;
    score: number;
    comment?: string | undefined;
  }
): Promise<NpsFeedbackRecord> {
  const settings = getReputationSettings(clinicId);
  const category = getNpsCategory(payload.score);
  const shouldRedirectToGoogle =
    settings.enableGoogleRedirectForPromoters &&
    payload.score >= settings.minimumScoreForGoogle;
  const shouldAlertManager =
    settings.enableManagerAlertOnDetractor && category === "detractor";

  const newRecord: NpsFeedbackRecord = {
    id: `nps_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    clinicId,
    patientName: payload.patientName || "Paciente",
    patientPhone: payload.patientPhone,
    professionalName: payload.professionalName,
    score: payload.score,
    category,
    comment: payload.comment?.trim() || undefined,
    redirectedToGoogle: shouldRedirectToGoogle,
    status: category === "detractor" ? "new" : "resolved",
    managerAlertSent: shouldAlertManager,
    createdAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    try {
      const existing = fetchClinicNpsFeedbacks(clinicId);
      const next = [newRecord, ...existing];
      localStorage.setItem(`${STORAGE_NPS_FEEDBACKS_KEY}${clinicId}`, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  return newRecord;
}

/**
 * Atualiza o status do feedback (ex: "resolvido", "em contato")
 */
export function updateFeedbackStatus(
  clinicId: string,
  feedbackId: string,
  status: "new" | "resolved" | "contacted",
  resolutionNotes?: string | undefined
): NpsFeedbackRecord | null {
  if (typeof window !== "undefined") {
    try {
      const existing = fetchClinicNpsFeedbacks(clinicId);
      let updatedRecord: NpsFeedbackRecord | null = null;
      const next = existing.map((f) => {
        if (f.id === feedbackId) {
          updatedRecord = {
            ...f,
            status,
            resolutionNotes: resolutionNotes || f.resolutionNotes,
            resolvedAt: status === "resolved" ? new Date().toISOString() : f.resolvedAt,
          };
          return updatedRecord;
        }
        return f;
      });
      localStorage.setItem(`${STORAGE_NPS_FEEDBACKS_KEY}${clinicId}`, JSON.stringify(next));
      return updatedRecord;
    } catch {
      return null;
    }
  }
  return null;
}

export function buildGoogleReviewUrl(googleReviewUrl: string): string {
  if (googleReviewUrl && googleReviewUrl.trim().length > 5) {
    return googleReviewUrl.trim();
  }
  return "https://www.google.com/search?q=avaliar+clinica+odontologica";
}

export function buildDetractorAlertWhatsAppUrl(
  managerPhone: string,
  feedback: NpsFeedbackRecord,
  clinicName?: string
): string {
  const cleanPhone = managerPhone.replace(/\D/g, "");
  const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
  const msg = `⚠️ *ALERTA IMEDIATO NPS - DETRATOR DETECTADO*\n\n` +
    `*Clínica:* ${clinicName || "SondaPro Odonto"}\n` +
    `*Paciente:* ${feedback.patientName}\n` +
    `*Telefone:* ${feedback.patientPhone || "Não informado"}\n` +
    `*Nota:* ${feedback.score}/10\n` +
    `*Comentário:* "${feedback.comment || "Sem comentário adicional"}"\n\n` +
    `Recomenda-se contato telefônico rápido pelo gestor para acolhimento e reversão da insatisfação antes de postagem pública.`;

  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`;
}


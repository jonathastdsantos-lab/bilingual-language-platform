/**
 * SondaPro Dental - Módulo de Ortodontia & Planejamento de Alinhadores Invisíveis
 * Gerenciamento de setup digital, placas, attachments, IPR (desgastes), PEPS de entrega e lembretes de troca.
 */

export type AlignerBrand =
  | "Invisalign"
  | "Smilink"
  | "SouSmile"
  | "Compass 3D"
  | "Cler Aligner"
  | "In-Office / Laboratório Próprio"
  | "Outra Marca";

export type AlignerStatus =
  | "planning" // Planejamento / Escaneamento / Setup
  | "in_progress" // Em uso ativo de placas
  | "refinement" // Fase de Refinamento / Placas Adicionais
  | "retention" // Fase de Contenção (Vivera / Essix)
  | "completed"; // Tratamento finalizado

export interface IprStep {
  id: string;
  stageNumber: number; // Em qual placa deve ser realizado o desgaste (ex: Placa 4)
  teethRegion: string; // Ex: "Entre 31 e 41", "12-13"
  amountMm: number; // Ex: 0.2mm, 0.3mm
  completed: boolean;
  completedAt?: string | undefined;
}

export interface ClearAlignerTreatment {
  id: string;
  clinicId: string;
  patientId: string;
  patientName?: string | undefined;
  professionalId?: string | undefined;
  professionalName?: string | undefined;
  brand: AlignerBrand;
  totalUpperPlates: number;
  totalLowerPlates: number;
  currentPlateNumber: number;
  deliveredPlatesCount: number; // Quantas placas o paciente já levou para casa
  changeFrequencyDays: number; // Dias de troca (7, 10 ou 14)
  startDate: string;
  nextChangeDate: string;
  dailyWearHoursGoal: number; // Padrão 22 horas/dia
  status: AlignerStatus;
  attachmentsTeeth: number[]; // Dentes com attachments (ex: [13, 14, 23, 24, 44])
  iprSteps: IprStep[];
  notes?: string | undefined;
  updatedAt: string;
}

export interface AlignerSettingsSwitches {
  enableAlignerModule: boolean; // Ativar/Desativar Alinhadores
  enableAutomaticWhatsAppReminders: boolean; // Notificação de troca de placa no WhatsApp
  enableIprSafetyAlerts: boolean; // Alerta prévio de IPR na consulta
  enableComplianceTracker: boolean; // Registro de colaboração do paciente (22h/dia)
}

export interface AlignerSettings {
  clinicId: string;
  defaultBrand: AlignerBrand;
  defaultFrequencyDays: number;
  defaultWearHours: number;
  switches: AlignerSettingsSwitches;
  updatedAt: string;
}

const STORAGE_ALIGNERS_PREFIX = "sondapro.ortho.aligners.";
const STORAGE_ALIGNERS_SETTINGS = "sondapro.ortho.aligners.settings.";

export const DEFAULT_ALIGNER_SETTINGS: AlignerSettings = {
  clinicId: "default",
  defaultBrand: "Invisalign",
  defaultFrequencyDays: 10,
  defaultWearHours: 22,
  switches: {
    enableAlignerModule: true,
    enableAutomaticWhatsAppReminders: true,
    enableIprSafetyAlerts: true,
    enableComplianceTracker: true,
  },
  updatedAt: new Date().toISOString(),
};

/**
 * Consulta as preferências e switches do módulo de alinhadores
 */
export function getAlignerSettings(clinicId: string): AlignerSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_ALIGNER_SETTINGS, clinicId };
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_ALIGNERS_SETTINGS}${clinicId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        clinicId,
        defaultBrand: parsed.defaultBrand || DEFAULT_ALIGNER_SETTINGS.defaultBrand,
        defaultFrequencyDays: Number(parsed.defaultFrequencyDays) || 10,
        defaultWearHours: Number(parsed.defaultWearHours) || 22,
        switches: {
          ...DEFAULT_ALIGNER_SETTINGS.switches,
          ...(parsed.switches || {}),
        },
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // fallback
  }

  return { ...DEFAULT_ALIGNER_SETTINGS, clinicId };
}

/**
 * Salva as configurações de alinhadores da clínica
 */
export function saveAlignerSettings(
  clinicId: string,
  updates: Partial<AlignerSettings>
): AlignerSettings {
  const current = getAlignerSettings(clinicId);
  const updated: AlignerSettings = {
    ...current,
    ...updates,
    switches: {
      ...current.switches,
      ...(updates.switches || {}),
    },
    clinicId,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${STORAGE_ALIGNERS_SETTINGS}${clinicId}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  return updated;
}

/**
 * Carrega a ficha de alinhadores invisíveis do paciente
 */
export function getAlignerTreatment(
  clinicId: string,
  patientId: string
): ClearAlignerTreatment | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(`${STORAGE_ALIGNERS_PREFIX}${clinicId}_${patientId}`);
    if (raw) {
      return JSON.parse(raw) as ClearAlignerTreatment;
    }
  } catch {
    // fallback
  }

  return null;
}

/**
 * Salva ou atualiza a ficha de alinhador do paciente
 */
export function saveAlignerTreatment(
  clinicId: string,
  patientId: string,
  treatment: Partial<ClearAlignerTreatment>
): ClearAlignerTreatment {
  const existing = getAlignerTreatment(clinicId, patientId);

  const maxPlates = Math.max(
    treatment.totalUpperPlates ?? existing?.totalUpperPlates ?? 14,
    treatment.totalLowerPlates ?? existing?.totalLowerPlates ?? 14
  );

  const freqDays = treatment.changeFrequencyDays ?? existing?.changeFrequencyDays ?? 10;
  const startDt = treatment.startDate ?? existing?.startDate ?? new Date().toISOString().split("T")[0]!;

  // Calcula próxima troca de placa se não informada
  let nextDate = treatment.nextChangeDate;
  if (!nextDate) {
    const d = new Date(startDt);
    d.setDate(d.getDate() + freqDays);
    nextDate = d.toISOString().split("T")[0];
  }

  const updated: ClearAlignerTreatment = {
    id: existing?.id || `aligner_${Date.now()}`,
    clinicId,
    patientId,
    patientName: treatment.patientName || existing?.patientName || "Paciente",
    professionalId: treatment.professionalId || existing?.professionalId,
    professionalName: treatment.professionalName || existing?.professionalName,
    brand: treatment.brand || existing?.brand || "Invisalign",
    totalUpperPlates: Number(treatment.totalUpperPlates ?? existing?.totalUpperPlates ?? 18),
    totalLowerPlates: Number(treatment.totalLowerPlates ?? existing?.totalLowerPlates ?? 14),
    currentPlateNumber: Number(treatment.currentPlateNumber ?? existing?.currentPlateNumber ?? 1),
    deliveredPlatesCount: Number(treatment.deliveredPlatesCount ?? existing?.deliveredPlatesCount ?? 4),
    changeFrequencyDays: freqDays,
    startDate: startDt,
    nextChangeDate: nextDate || new Date().toISOString().split("T")[0]!,
    dailyWearHoursGoal: Number(treatment.dailyWearHoursGoal ?? existing?.dailyWearHoursGoal ?? 22),
    status: treatment.status || existing?.status || "in_progress",
    attachmentsTeeth: treatment.attachmentsTeeth ?? existing?.attachmentsTeeth ?? [13, 14, 23, 24, 44, 45],
    iprSteps: treatment.iprSteps ?? existing?.iprSteps ?? [
      { id: "ipr_1", stageNumber: 4, teethRegion: "Entre 31 e 41", amountMm: 0.2, completed: false },
      { id: "ipr_2", stageNumber: 7, teethRegion: "Entre 12 e 13", amountMm: 0.3, completed: false },
    ],
    notes: treatment.notes ?? existing?.notes,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${STORAGE_ALIGNERS_PREFIX}${clinicId}_${patientId}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  return updated;
}

/**
 * Avança o paciente para a próxima placa do alinhador
 */
export function advanceToNextPlate(
  clinicId: string,
  patientId: string
): ClearAlignerTreatment | null {
  const current = getAlignerTreatment(clinicId, patientId);
  if (!current) return null;

  const maxPlates = Math.max(current.totalUpperPlates, current.totalLowerPlates);
  const nextNum = Math.min(maxPlates, current.currentPlateNumber + 1);

  // Calcula nova data de troca
  const currentNext = new Date(current.nextChangeDate);
  currentNext.setDate(currentNext.getDate() + current.changeFrequencyDays);
  const newNextDateStr = currentNext.toISOString().split("T")[0]!;

  const newStatus: AlignerStatus =
    nextNum >= maxPlates && current.status === "in_progress"
      ? "refinement"
      : current.status;

  return saveAlignerTreatment(clinicId, patientId, {
    ...current,
    currentPlateNumber: nextNum,
    nextChangeDate: newNextDateStr,
    status: newStatus,
  });
}

/**
 * Calcula o progresso do tratamento com alinhadores
 */
export function calculateAlignerProgress(treatment: ClearAlignerTreatment): {
  progressPct: number;
  totalPlates: number;
  platesRemaining: number;
  estimatedWeeksRemaining: number;
  isCompletedOrRefining: boolean;
  needsDeliveryWarning: boolean; // Paciente está usando a última placa entregue?
} {
  const totalPlates = Math.max(1, Math.max(treatment.totalUpperPlates, treatment.totalLowerPlates));
  const current = Math.min(totalPlates, Math.max(1, treatment.currentPlateNumber));
  const progressPct = Math.round((current / totalPlates) * 100);
  const platesRemaining = Math.max(0, totalPlates - current);
  const estimatedDaysRemaining = platesRemaining * treatment.changeFrequencyDays;
  const estimatedWeeksRemaining = Math.ceil(estimatedDaysRemaining / 7);

  const needsDeliveryWarning = current >= treatment.deliveredPlatesCount;

  return {
    progressPct,
    totalPlates,
    platesRemaining,
    estimatedWeeksRemaining,
    isCompletedOrRefining: current >= totalPlates || treatment.status === "completed",
    needsDeliveryWarning,
  };
}

/**
 * Constrói mensagem de lembrete personalizada no WhatsApp para o paciente de alinhador
 */
export function buildAlignerWhatsAppReminderMessage(
  patientName: string,
  clinicName: string,
  treatment: ClearAlignerTreatment
): string {
  const currentPlate = treatment.currentPlateNumber;
  const maxPlates = Math.max(treatment.totalUpperPlates, treatment.totalLowerPlates);

  // Verifica se na placa atual há IPR ou checagem agendada
  const pendingIpr = treatment.iprSteps.find(
    (step) => step.stageNumber === currentPlate && !step.completed
  );

  let msg = `Olá, *${patientName}*! Tudo bem? ✨\n\n`;
  msg += `Aqui é da equipe da *${clinicName}* passando para acompanhar o seu tratamento com alinhadores invisíveis *${treatment.brand}*.\n\n`;
  msg += `📌 *Placa Atual:* ${currentPlate} de ${maxPlates}\n`;
  msg += `⏱️ *Lembrete de Uso:* Mantenha o alinhador por no mínimo *${treatment.dailyWearHoursGoal} horas por dia*, retirando apenas para as refeições e escovação.\n`;

  if (pendingIpr) {
    msg += `\n⚠️ *Aviso Importante:* No seu próximo retorno clínico, realizaremos o polimento/ajuste programado (${pendingIpr.teethRegion}). Não se esqueça de trazer suas placas anteriores!`;
  }

  msg += `\nQualquer dúvida ou desconforto, estamos à disposição aqui pelo WhatsApp! 🦷`;

  return msg;
}


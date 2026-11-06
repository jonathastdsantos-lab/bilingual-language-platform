/**
 * SondaPro Dental - Configurações TISS e Gestão de Recursos de Glosa
 */

export interface TissSettingsSwitches {
  enableTissModule: boolean; // Ativa/desativa módulo de faturamento TISS / convênios
  enableCardExpirationAlert: boolean; // Alerta de carteirinha expirada antes de emitir a guia
  autoMarkBilledOnXmlExport: boolean; // Marcar automaticamente como 'billed' ao exportar lote XML
  requireToothOnRestorations: boolean; // Bloqueia emissão de restaurações sem dente/face
}

export interface TissSettings {
  clinicId: string;
  cnesNumber: string; // CNES oficial do estabelecimento
  tissVersion: "v3.05.00" | "v4.01.00";
  providerCodeInInsurance: string; // Código do prestador padrão na operadora
  switches: TissSettingsSwitches;
  updatedAt: string;
}

export interface TissGlosaAppeal {
  id: string;
  clinicId: string;
  guideId: string;
  guideNumber: string;
  insuranceName: string;
  glosedAmount: number;
  glosaCode: string;
  glosaReason: string;
  appealJustification: string;
  status: "pending_analysis" | "accepted" | "rejected";
  appealedAt: string;
  reviewedAt?: string | undefined;
  reviewerNotes?: string | undefined;
}

const STORAGE_TISS_SETTINGS_PREFIX = "sondapro.tiss.settings.";
const STORAGE_TISS_APPEALS_PREFIX = "sondapro.tiss.appeals.";

export const DEFAULT_TISS_SETTINGS: TissSettings = {
  clinicId: "default",
  cnesNumber: "7891234",
  tissVersion: "v4.01.00",
  providerCodeInInsurance: "0012984",
  switches: {
    enableTissModule: true,
    enableCardExpirationAlert: true,
    autoMarkBilledOnXmlExport: true,
    requireToothOnRestorations: true,
  },
  updatedAt: new Date().toISOString(),
};

/**
 * Consulta as configurações do módulo TISS da clínica
 */
export function getTissSettings(clinicId: string): TissSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_TISS_SETTINGS, clinicId };
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_TISS_SETTINGS_PREFIX}${clinicId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        clinicId,
        cnesNumber: parsed.cnesNumber || DEFAULT_TISS_SETTINGS.cnesNumber,
        tissVersion: parsed.tissVersion || DEFAULT_TISS_SETTINGS.tissVersion,
        providerCodeInInsurance: parsed.providerCodeInInsurance || DEFAULT_TISS_SETTINGS.providerCodeInInsurance,
        switches: {
          ...DEFAULT_TISS_SETTINGS.switches,
          ...(parsed.switches || {}),
        },
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // fallback
  }

  return { ...DEFAULT_TISS_SETTINGS, clinicId };
}

/**
 * Salva as preferências de TISS da clínica
 */
export function saveTissSettings(
  clinicId: string,
  updates: Partial<TissSettings>
): TissSettings {
  const current = getTissSettings(clinicId);
  const updated: TissSettings = {
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
      localStorage.setItem(`${STORAGE_TISS_SETTINGS_PREFIX}${clinicId}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  return updated;
}

/**
 * Registra um recurso de glosa para uma Guia TISS contestada
 */
export function recordTissGlosaAppeal(
  clinicId: string,
  appealInput: {
    guideId: string;
    guideNumber: string;
    insuranceName: string;
    glosedAmount: number;
    glosaCode: string;
    glosaReason: string;
    appealJustification: string;
  }
): TissGlosaAppeal {
  const appeals = getTissGlosaAppeals(clinicId);
  const newAppeal: TissGlosaAppeal = {
    id: `appeal_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    clinicId,
    guideId: appealInput.guideId,
    guideNumber: appealInput.guideNumber,
    insuranceName: appealInput.insuranceName,
    glosedAmount: appealInput.glosedAmount,
    glosaCode: appealInput.glosaCode,
    glosaReason: appealInput.glosaReason,
    appealJustification: appealInput.appealJustification,
    status: "pending_analysis",
    appealedAt: new Date().toISOString(),
  };

  const filtered = appeals.filter((a) => a.guideId !== appealInput.guideId);
  const updatedList = [newAppeal, ...filtered];

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${STORAGE_TISS_APPEALS_PREFIX}${clinicId}`, JSON.stringify(updatedList));
    } catch {
      // ignore
    }
  }

  return newAppeal;
}

/**
 * Recupera os recursos de glosas registrados pela clínica
 */
export function getTissGlosaAppeals(clinicId: string): TissGlosaAppeal[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(`${STORAGE_TISS_APPEALS_PREFIX}${clinicId}`);
    if (raw) {
      return JSON.parse(raw) as TissGlosaAppeal[];
    }
  } catch {
    // fallback
  }

  return [];
}


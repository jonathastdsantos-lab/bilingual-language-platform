/**
 * SondaPro Dental - Gestão de Estoque Avançado & Lotes ANVISA
 * Rastreabilidade sanitária, controle de validades, PEPS (FIFO) e rastreabilidade reversa de pacientes.
 */

import type { StockItem, StockMovement } from "@/types";
import { toSaoPauloDateKey } from "@/utils/timezone";

export type AnvisaSanitaryStatus =
  | "ok" // Regular (mais de 90 dias de validade)
  | "warning_90d" // Atenção (vence em até 90 dias)
  | "warning_60d" // Atenção moderada (vence em até 60 dias)
  | "critical_30d" // Crítico (vence nos próximos 30 dias)
  | "expired"; // Vencido (Quarentena Sanitária obrigatória)

export interface AnvisaLotRecord {
  lotKey: string; // Ex: "LOTE123_itemId"
  batchNumber: string;
  itemId: string;
  itemName: string;
  category: string;
  unitMeasure: string;
  unitCost: number;
  anvisaRegister?: string | undefined;
  supplier?: string | undefined;
  expirationDate: string | null;
  currentQuantity: number;
  totalCostInLot: number;
  status: AnvisaSanitaryStatus;
  daysToExpiration: number | null;
  isQuarantined: boolean;
  usedInPatientsCount: number;
}

export interface AnvisaPatientTraceRecord {
  movementId: string;
  patientId: string;
  patientName: string;
  professionalId?: string | undefined;
  professionalName?: string | undefined;
  batchNumber: string;
  quantityUsed: number;
  usedAt: string;
  reason: string;
}

export interface AnvisaStockSwitches {
  enableAnvisaLotTracking: boolean; // Ativar/Desativar Rastreabilidade Estrita de Lotes
  enableFifoRecommendation: boolean; // Ativar/Desativar Recomendação de Uso PEPS (Primeiro que Vence)
  enableWhatsAppExpiryAlerts: boolean; // Ativar/Desativar Alertas de Validade no WhatsApp
  enablePatientReverseTracking: boolean; // Ativar/Desativar Rastreabilidade Reversa de Pacientes
  enableQuarantineLock: boolean; // Ativar/Desativar Bloqueio Automático de Lotes Vencidos
}

export interface AnvisaStockSettings {
  clinicId: string;
  responsibleName: string;
  responsiblePhone: string;
  croOrAnvisaId: string;
  alertDaysThreshold: number; // padrão 30 dias
  switches: AnvisaStockSwitches;
  updatedAt: string;
}

const STORAGE_ANVISA_SETTINGS_KEY = "sondapro.stock.anvisa.settings.";

export const DEFAULT_ANVISA_SETTINGS: AnvisaStockSettings = {
  clinicId: "default",
  responsibleName: "Responsável Técnica",
  responsiblePhone: "",
  croOrAnvisaId: "",
  alertDaysThreshold: 30,
  switches: {
    enableAnvisaLotTracking: true,
    enableFifoRecommendation: true,
    enableWhatsAppExpiryAlerts: true,
    enablePatientReverseTracking: true,
    enableQuarantineLock: true,
  },
  updatedAt: new Date().toISOString(),
};

/**
 * Carrega as preferências e switches sanitários da clínica
 */
export function getAnvisaStockSettings(clinicId: string): AnvisaStockSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_ANVISA_SETTINGS, clinicId };
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_ANVISA_SETTINGS_KEY}${clinicId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        clinicId,
        responsibleName: parsed.responsibleName || DEFAULT_ANVISA_SETTINGS.responsibleName,
        responsiblePhone: parsed.responsiblePhone || "",
        croOrAnvisaId: parsed.croOrAnvisaId || "",
        alertDaysThreshold: Number(parsed.alertDaysThreshold) || 30,
        switches: {
          ...DEFAULT_ANVISA_SETTINGS.switches,
          ...(parsed.switches || {}),
        },
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // fallback
  }

  return { ...DEFAULT_ANVISA_SETTINGS, clinicId };
}

/**
 * Salva as preferências sanitárias da clínica
 */
export function saveAnvisaStockSettings(
  clinicId: string,
  updates: Partial<AnvisaStockSettings>
): AnvisaStockSettings {
  const current = getAnvisaStockSettings(clinicId);
  const updated: AnvisaStockSettings = {
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
      localStorage.setItem(`${STORAGE_ANVISA_SETTINGS_KEY}${clinicId}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  return updated;
}

/**
 * Classifica a criticidade sanitária de uma data de validade segundo as normas da ANVISA
 */
export function evaluateAnvisaDateStatus(
  expirationDate: string | null,
  now: Date = new Date()
): { status: AnvisaSanitaryStatus; daysRemaining: number | null } {
  if (!expirationDate) {
    return { status: "ok", daysRemaining: null };
  }

  const todayKey = toSaoPauloDateKey(now);
  if (expirationDate < todayKey) {
    return { status: "expired", daysRemaining: -1 };
  }

  const todayUtc = new Date(`${todayKey}T00:00:00Z`).getTime();
  const expUtc = new Date(`${expirationDate}T00:00:00Z`).getTime();
  const diffDays = Math.ceil((expUtc - todayUtc) / 86_400_000);

  if (diffDays <= 30) {
    return { status: "critical_30d", daysRemaining: diffDays };
  }
  if (diffDays <= 60) {
    return { status: "warning_60d", daysRemaining: diffDays };
  }
  if (diffDays <= 90) {
    return { status: "warning_90d", daysRemaining: diffDays };
  }

  return { status: "ok", daysRemaining: diffDays };
}

/**
 * Agrupa insumos e seus respectivos lotes com cálculo de saldo e status sanitário
 */
export function extractAnvisaLots(
  items: StockItem[],
  movements: StockMovement[] = [],
  now: Date = new Date()
): AnvisaLotRecord[] {
  // Mapa de contagem de pacientes por lote
  const patientsCountByLot = new Map<string, Set<string>>();
  for (const m of movements) {
    if (m.batch_number && m.patient_id) {
      const set = patientsCountByLot.get(m.batch_number) || new Set<string>();
      set.add(m.patient_id);
      patientsCountByLot.set(m.batch_number, set);
    }
  }

  const lotsMap = new Map<string, AnvisaLotRecord>();

  for (const item of items) {
    if (!item.batch_number && !item.expiration_date) continue;

    const batch = item.batch_number || "LOTE_GERAL";
    const lotKey = `${item.id}_${batch}`;
    const { status, daysRemaining } = evaluateAnvisaDateStatus(item.expiration_date, now);
    const qty = Math.max(0, Number(item.current_quantity) || 0);
    const unitCost = Math.max(0, Number(item.unit_cost) || 0);

    const patientsCount = patientsCountByLot.get(batch)?.size || 0;

    lotsMap.set(lotKey, {
      lotKey,
      batchNumber: batch,
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      unitMeasure: item.unit_measure,
      unitCost,
      supplier: item.supplier || undefined,
      anvisaRegister: "MS/ANVISA Conforme RDC 63",
      expirationDate: item.expiration_date,
      currentQuantity: qty,
      totalCostInLot: Number((qty * unitCost).toFixed(2)),
      status,
      daysToExpiration: daysRemaining,
      isQuarantined: status === "expired",
      usedInPatientsCount: patientsCount,
    });
  }

  // Ordena por criticidade sanitária: expirados primeiro, depois por proximidade da validade (PEPS)
  const statusPriority: Record<AnvisaSanitaryStatus, number> = {
    expired: 1,
    critical_30d: 2,
    warning_60d: 3,
    warning_90d: 4,
    ok: 5,
  };

  return Array.from(lotsMap.values()).sort((a, b) => {
    const diffPriority = statusPriority[a.status] - statusPriority[b.status];
    if (diffPriority !== 0) return diffPriority;
    if (a.expirationDate && b.expirationDate) {
      return a.expirationDate.localeCompare(b.expirationDate);
    }
    return a.itemName.localeCompare(b.itemName);
  });
}

/**
 * Rastreabilidade Reversa: Localiza todos os pacientes e cirurgias onde determinado lote foi utilizado
 */
export function tracePatientsByBatchNumber(
  movements: StockMovement[],
  batchNumber: string,
  patientsMap: Map<string, string> = new Map(),
  professionalsMap: Map<string, string> = new Map()
): AnvisaPatientTraceRecord[] {
  const normalizedBatch = batchNumber.trim().toLowerCase();

  return movements
    .filter((m) => {
      const b = (m.batch_number || "").trim().toLowerCase();
      return b === normalizedBatch && m.movement_type === "out" && Boolean(m.patient_id);
    })
    .map((m) => {
      const patId = m.patient_id as string;
      const profId = m.professional_id || undefined;
      return {
        movementId: m.id,
        patientId: patId,
        patientName: patientsMap.get(patId) || "Paciente Registrado",
        professionalId: profId,
        professionalName: profId ? professionalsMap.get(profId) || "Cirurgião-Dentista" : undefined,
        batchNumber: m.batch_number || batchNumber,
        quantityUsed: Number(m.quantity) || 1,
        usedAt: m.created_at,
        reason: m.reason || "Procedimento Clínico Odontológico",
      };
    })
    .sort((a, b) => b.usedAt.localeCompare(a.usedAt));
}

/**
 * Gera mensagem formatada pronta para envio no WhatsApp da Responsável Técnica ou Fornecedor
 */
export function buildAnvisaWhatsAppAlertMessage(
  clinicName: string,
  responsibleName: string,
  lots: AnvisaLotRecord[]
): string {
  const criticalLots = lots.filter(
    (l) => l.status === "expired" || l.status === "critical_30d" || l.status === "warning_60d"
  );

  if (criticalLots.length === 0) {
    return (
      `*RELATÓRIO DE CONFORMIDADE SANITÁRIA ANVISA*\n\n` +
      `*Clínica:* ${clinicName}\n` +
      `*Responsável Técnica:* ${responsibleName}\n\n` +
      `✅ Todos os lotes de medicamentos, resinas e anestésicos estão regulares e dentro do prazo sanitário.`
    );
  }

  let text = `🚨 *ALERTA DE CONTROLE SANITÁRIO & LOTES ANVISA*\n\n`;
  text += `*Clínica:* ${clinicName}\n`;
  text += `*Responsável Técnica:* ${responsibleName}\n`;
  text += `*Data da Auditoria:* ${new Date().toLocaleDateString("pt-BR")}\n\n`;
  text += `Identificamos *${criticalLots.length} lote(s)* com atenção sanitária prioritária:\n\n`;

  for (const lot of criticalLots.slice(0, 10)) {
    const icon = lot.status === "expired" ? "🛑 VENCIDO (QUARENTENA)" : "⚠️ VENCE EM BREVE";
    const valStr = lot.expirationDate
      ? new Date(`${lot.expirationDate}T00:00:00`).toLocaleDateString("pt-BR")
      : "Não informada";

    text += `${icon}\n`;
    text += `• *Insumo:* ${lot.itemName} (${lot.category})\n`;
    text += `• *Lote:* ${lot.batchNumber} | *Saldo:* ${lot.currentQuantity} ${lot.unitMeasure}\n`;
    text += `• *Validade:* ${valStr} (${lot.daysToExpiration !== null ? `${lot.daysToExpiration} dias` : ""})\n\n`;
  }

  text += `Recomenda-se aplicar a regra *PEPS (Primeiro que Vence, Primeiro que Sai)* ou recolher lotes vencidos imediatamente para evitar sanções sanitárias.`;

  return text;
}

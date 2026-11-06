import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateAnvisaDateStatus,
  extractAnvisaLots,
  tracePatientsByBatchNumber,
  getAnvisaStockSettings,
  saveAnvisaStockSettings,
  buildAnvisaWhatsAppAlertMessage,
  DEFAULT_ANVISA_SETTINGS,
} from "@/modules/stock/anvisa-lots";
import type { StockItem, StockMovement } from "@/types";

function createMockStockItem(overrides: Partial<StockItem>): StockItem {
  return {
    id: "item-default",
    clinic_id: "clinic-default",
    unit_id: null,
    name: "Insumo Mock",
    category: "Geral",
    sku: null,
    unit_measure: "un",
    current_quantity: 10,
    min_quantity: 5,
    unit_cost: 50,
    supplier: null,
    batch_number: null,
    expiration_date: null,
    storage_location: null,
    active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockStockMovement(overrides: Partial<StockMovement>): StockMovement {
  return {
    id: "mov-default",
    clinic_id: "clinic-default",
    item_id: "item-default",
    unit_id: null,
    movement_type: "in",
    quantity: 1,
    previous_quantity: 10,
    resulting_quantity: 11,
    unit_cost: 50,
    batch_number: null,
    expiration_date: null,
    reason: "Entrada Padrão",
    professional_id: null,
    patient_id: null,
    created_by: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Gestão de Estoque Avançado & Lotes ANVISA", () => {
  const testClinicId = "clinic-anvisa-test-555";
  const mockNow = new Date("2026-11-06T12:00:00Z");

  beforeEach(() => {
    localStorage.clear();
  });

  describe("Classificação de Validade Sanitária (evaluateAnvisaDateStatus)", () => {
    it("deve classificar data passada como 'expired'", () => {
      const res = evaluateAnvisaDateStatus("2026-10-15", mockNow);
      expect(res.status).toBe("expired");
      expect(res.daysRemaining).toBe(-1);
    });

    it("deve classificar vencimento em menos de 30 dias como 'critical_30d'", () => {
      const res = evaluateAnvisaDateStatus("2026-11-20", mockNow);
      expect(res.status).toBe("critical_30d");
      expect(res.daysRemaining).toBeLessThanOrEqual(30);
      expect(res.daysRemaining).toBeGreaterThanOrEqual(0);
    });

    it("deve classificar vencimento entre 31 e 60 dias como 'warning_60d'", () => {
      const res = evaluateAnvisaDateStatus("2026-12-15", mockNow);
      expect(res.status).toBe("warning_60d");
    });

    it("deve classificar vencimento entre 61 e 90 dias como 'warning_90d'", () => {
      const res = evaluateAnvisaDateStatus("2027-01-20", mockNow);
      expect(res.status).toBe("warning_90d");
    });

    it("deve classificar validade superior a 90 dias como 'ok'", () => {
      const res = evaluateAnvisaDateStatus("2027-06-30", mockNow);
      expect(res.status).toBe("ok");
    });

    it("deve retornar 'ok' para insumos sem data de validade estipulada", () => {
      const res = evaluateAnvisaDateStatus(null, mockNow);
      expect(res.status).toBe("ok");
      expect(res.daysRemaining).toBeNull();
    });
  });

  describe("Extração e Auditoria de Lotes (extractAnvisaLots)", () => {
    it("deve extrair lotes com saldo, custo e status de quarentena", () => {
      const items: StockItem[] = [
        createMockStockItem({
          id: "item-1",
          clinic_id: testClinicId,
          name: "Anestésico Articaína 4% com Epinefrina",
          category: "Anestésicos e Medicamentos",
          current_quantity: 50,
          min_quantity: 10,
          unit_cost: 180,
          unit_measure: "cx",
          batch_number: "LOT-ART-2026",
          expiration_date: "2026-11-25", // Crítico
          supplier: "DFL Indústria",
        }),
        createMockStockItem({
          id: "item-2",
          clinic_id: testClinicId,
          name: "Resina Composta Filtek Z350 XT A2",
          category: "Resinas e Adesivos",
          current_quantity: 8,
          min_quantity: 3,
          unit_cost: 135,
          unit_measure: "seringa",
          batch_number: "LOT-RES-999",
          expiration_date: "2026-10-01", // Vencido
          supplier: "3M Dental",
        }),
      ];

      const lots = extractAnvisaLots(items, [], mockNow);
      expect(lots.length).toBe(2);

      // O lote vencido deve vir primeiro para quarentena imediata (ordenação PEPS)
      expect(lots[0]?.batchNumber).toBe("LOT-RES-999");
      expect(lots[0]?.status).toBe("expired");
      expect(lots[0]?.isQuarantined).toBe(true);
      expect(lots[0]?.totalCostInLot).toBe(8 * 135);

      // O lote crítico de anestésico em 2º
      expect(lots[1]?.batchNumber).toBe("LOT-ART-2026");
      expect(lots[1]?.status).toBe("critical_30d");
      expect(lots[1]?.isQuarantined).toBe(false);
      expect(lots[1]?.totalCostInLot).toBe(50 * 180);
    });
  });

  describe("Rastreabilidade Reversa ANVISA (tracePatientsByBatchNumber)", () => {
    it("deve mapear todos os pacientes e dentistas que utilizaram o lote", () => {
      const movements: StockMovement[] = [
        createMockStockMovement({
          id: "mov-1",
          clinic_id: testClinicId,
          item_id: "item-1",
          movement_type: "out",
          quantity: 2,
          previous_quantity: 50,
          resulting_quantity: 48,
          unit_cost: 180,
          batch_number: "LOT-ART-2026",
          reason: "Cirurgia de Exodontia Terceiro Molar",
          patient_id: "pat-100",
          professional_id: "prof-10",
          created_at: "2026-11-01T14:30:00Z",
        }),
        createMockStockMovement({
          id: "mov-2",
          clinic_id: testClinicId,
          item_id: "item-1",
          movement_type: "out",
          quantity: 1,
          previous_quantity: 48,
          resulting_quantity: 47,
          unit_cost: 180,
          batch_number: "LOT-ART-2026",
          reason: "Instalação de Implante Dente 36",
          patient_id: "pat-200",
          professional_id: "prof-10",
          created_at: "2026-11-02T10:15:00Z",
        }),
        createMockStockMovement({
          id: "mov-3",
          clinic_id: testClinicId,
          item_id: "item-2",
          movement_type: "out",
          quantity: 1,
          previous_quantity: 10,
          resulting_quantity: 9,
          unit_cost: 135,
          batch_number: "OUTRO-LOTE",
          reason: "Restauração",
          patient_id: "pat-300",
          created_at: "2026-11-03T11:00:00Z",
        }),
      ];

      const patientsMap = new Map([
        ["pat-100", "Carlos Eduardo Rocha"],
        ["pat-200", "Fernanda Martins"],
        ["pat-300", "Outro Paciente"],
      ]);

      const profsMap = new Map([
        ["prof-10", "Dr. Roberto Albuquerque (Bucomaxilo)"],
      ]);

      const traced = tracePatientsByBatchNumber(
        movements,
        "LOT-ART-2026",
        patientsMap,
        profsMap
      );

      expect(traced.length).toBe(2);
      expect(traced[0]?.patientName).toBe("Fernanda Martins");
      expect(traced[0]?.professionalName).toContain("Dr. Roberto Albuquerque");
      expect(traced[0]?.reason).toBe("Instalação de Implante Dente 36");

      expect(traced[1]?.patientName).toBe("Carlos Eduardo Rocha");
      expect(traced[1]?.quantityUsed).toBe(2);
    });
  });

  describe("Configurações Sanitárias e Switches (getAnvisaStockSettings)", () => {
    it("deve carregar os parâmetros padrão da ANVISA", () => {
      const settings = getAnvisaStockSettings(testClinicId);
      expect(settings).toBeDefined();
      expect(settings.switches.enableAnvisaLotTracking).toBe(true);
      expect(settings.switches.enableFifoRecommendation).toBe(true);
      expect(settings.switches.enableWhatsAppExpiryAlerts).toBe(true);
      expect(settings.switches.enableQuarantineLock).toBe(true);
    });

    it("deve salvar personalizações do Responsável Técnico e switches", () => {
      saveAnvisaStockSettings(testClinicId, {
        responsibleName: "Dra. Beatriz Sanches",
        responsiblePhone: "11999991234",
        croOrAnvisaId: "CRO-SP 88776",
        switches: {
          ...DEFAULT_ANVISA_SETTINGS.switches,
          enableQuarantineLock: false,
        },
      });

      const updated = getAnvisaStockSettings(testClinicId);
      expect(updated.responsibleName).toBe("Dra. Beatriz Sanches");
      expect(updated.responsiblePhone).toBe("11999991234");
      expect(updated.croOrAnvisaId).toBe("CRO-SP 88776");
      expect(updated.switches.enableQuarantineLock).toBe(false);
      expect(updated.switches.enableAnvisaLotTracking).toBe(true);
    });
  });

  describe("Mensagem de Alerta para WhatsApp (buildAnvisaWhatsAppAlertMessage)", () => {
    it("deve gerar texto formatado contendo lotes críticos e recomendação PEPS", () => {
      const items: StockItem[] = [
        createMockStockItem({
          id: "item-1",
          clinic_id: testClinicId,
          name: "Lidocaína 2% com Epinefrina",
          category: "Anestésicos e Medicamentos",
          current_quantity: 30,
          min_quantity: 5,
          unit_cost: 120,
          unit_measure: "cx",
          batch_number: "LOTE-LIDO-33",
          expiration_date: "2026-11-20",
        }),
      ];

      const lots = extractAnvisaLots(items, [], mockNow);
      const msg = buildAnvisaWhatsAppAlertMessage("Oral Sin Odontologia", "Dra. Beatriz", lots);

      expect(msg).toContain("ALERTA DE CONTROLE SANITÁRIO & LOTES ANVISA");
      expect(msg).toContain("Oral Sin Odontologia");
      expect(msg).toContain("Dra. Beatriz");
      expect(msg).toContain("Lidocaína 2%");
      expect(msg).toContain("LOTE-LIDO-33");
      expect(msg).toContain("PEPS (Primeiro que Vence, Primeiro que Sai)");
    });
  });
});


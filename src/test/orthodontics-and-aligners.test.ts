import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateOrthodonticProgress,
  ARCHWIRE_CATALOG,
  BRACKET_PRESCRIPTIONS,
  getAlignerSettings,
  saveAlignerSettings,
  getAlignerTreatment,
  saveAlignerTreatment,
  advanceToNextPlate,
  calculateAlignerProgress,
  buildAlignerWhatsAppReminderMessage,
  type ClearAlignerTreatment,
} from "@/modules/orthodontics";
import type { OrthodonticTreatment } from "@/types";

describe("Módulo de Ortodontia & Planejamento de Alinhadores Invisíveis", () => {
  const clinicId = "9605e213-26af-441b-bc60-29c655c95590";
  const patientId = "patient_maria_clara";

  beforeEach(() => {
    localStorage.clear();
  });

  describe("Ortodontia Fixa: Catálogos e Progresso", () => {
    it("deve conter catálogo clínico amplo de arcos ortodônticos e prescrições", () => {
      expect(ARCHWIRE_CATALOG.length).toBeGreaterThan(15);
      expect(ARCHWIRE_CATALOG).toContain("0.014 NiTi Termoativado");
      expect(ARCHWIRE_CATALOG).toContain("19x25 Aço Retangular (Fechamento de Espaço)");

      expect(BRACKET_PRESCRIPTIONS).toContain("Roth .022");
      expect(BRACKET_PRESCRIPTIONS).toContain("MBT .022");
      expect(BRACKET_PRESCRIPTIONS).toContain("Damon System (Autoligado Passivo)");
    });

    it("deve calcular o progresso da ortodontia fixa com base na duração e manutenções", () => {
      const treatment: OrthodonticTreatment = {
        id: "ortho_123",
        clinic_id: clinicId,
        patient_id: patientId,
        professional_id: "prof_1",
        diagnosis: "Classe II 1ª divisão",
        appliance_type: "Metálico Convencional",
        bracket_prescription: "Roth .022",
        treatment_goal: "Alinhamento e nivelamento",
        start_date: "2024-01-01",
        estimated_duration_months: 24,
        monthly_fee: 150,
        status: "active",
        upper_current_arch: "0.014 NiTi",
        lower_current_arch: "0.014 NiTi",
        notes: null,
        created_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
      };

      const progress = calculateOrthodonticProgress(treatment, 12);
      expect(progress.progressPct).toBe(50); // 12 / 24 = 50%
      expect(progress.elapsedMonths).toBeGreaterThanOrEqual(0);
      expect(typeof progress.isOverdue).toBe("boolean");
    });
  });

  describe("Alinhadores Invisíveis: Configurações e Switches", () => {
    it("deve retornar configurações padrão quando não houver registro no localStorage", () => {
      const settings = getAlignerSettings(clinicId);
      expect(settings.clinicId).toBe(clinicId);
      expect(settings.defaultBrand).toBe("Invisalign");
      expect(settings.defaultFrequencyDays).toBe(10);
      expect(settings.defaultWearHours).toBe(22);
      expect(settings.switches.enableAlignerModule).toBe(true);
      expect(settings.switches.enableAutomaticWhatsAppReminders).toBe(true);
      expect(settings.switches.enableIprSafetyAlerts).toBe(true);
      expect(settings.switches.enableComplianceTracker).toBe(true);
    });

    it("deve salvar e persistir customizações de switches e preferências da clínica", () => {
      const updated = saveAlignerSettings(clinicId, {
        defaultBrand: "Smilink",
        defaultFrequencyDays: 7,
        switches: {
          enableAlignerModule: true,
          enableAutomaticWhatsAppReminders: false,
          enableIprSafetyAlerts: true,
          enableComplianceTracker: true,
        },
      });

      expect(updated.defaultBrand).toBe("Smilink");
      expect(updated.defaultFrequencyDays).toBe(7);
      expect(updated.switches.enableAutomaticWhatsAppReminders).toBe(false);

      const reloaded = getAlignerSettings(clinicId);
      expect(reloaded.defaultBrand).toBe("Smilink");
      expect(reloaded.defaultFrequencyDays).toBe(7);
      expect(reloaded.switches.enableAutomaticWhatsAppReminders).toBe(false);
    });
  });

  describe("Alinhadores Invisíveis: Setup Digital & Planejamento", () => {
    it("deve criar e persistir o plano de tratamento com placas, attachments e desgastes IPR", () => {
      const saved = saveAlignerTreatment(clinicId, patientId, {
        patientName: "Maria Clara Albuquerque",
        brand: "Invisalign",
        totalUpperPlates: 20,
        totalLowerPlates: 16,
        currentPlateNumber: 3,
        deliveredPlatesCount: 5,
        changeFrequencyDays: 10,
        startDate: "2026-10-01",
        nextChangeDate: "2026-10-11",
        dailyWearHoursGoal: 22,
        attachmentsTeeth: [13, 14, 23, 24, 33, 43],
        iprSteps: [
          {
            id: "ipr_1",
            stageNumber: 4,
            teethRegion: "Entre 31 e 41",
            amountMm: 0.2,
            completed: false,
          },
          {
            id: "ipr_2",
            stageNumber: 8,
            teethRegion: "Entre 12 e 13",
            amountMm: 0.3,
            completed: false,
          },
        ],
      });

      expect(saved.id).toBeDefined();
      expect(saved.totalUpperPlates).toBe(20);
      expect(saved.totalLowerPlates).toBe(16);
      expect(saved.currentPlateNumber).toBe(3);
      expect(saved.attachmentsTeeth).toEqual([13, 14, 23, 24, 33, 43]);
      expect(saved.iprSteps.length).toBe(2);

      const loaded = getAlignerTreatment(clinicId, patientId);
      expect(loaded).not.toBeNull();
      expect(loaded?.brand).toBe("Invisalign");
      expect(loaded?.patientName).toBe("Maria Clara Albuquerque");
    });

    it("deve calcular o progresso das placas e alertar sobre necessidade de nova entrega", () => {
      const treatment: ClearAlignerTreatment = {
        id: "aligner_test",
        clinicId,
        patientId,
        patientName: "Lucas Mendes",
        brand: "SouSmile",
        totalUpperPlates: 20,
        totalLowerPlates: 15,
        currentPlateNumber: 5,
        deliveredPlatesCount: 5, // Paciente está na 5ª placa e só recebeu até a 5ª!
        changeFrequencyDays: 14,
        startDate: "2026-08-01",
        nextChangeDate: "2026-10-15",
        dailyWearHoursGoal: 22,
        status: "in_progress",
        attachmentsTeeth: [12, 22],
        iprSteps: [],
        updatedAt: new Date().toISOString(),
      };

      const metrics = calculateAlignerProgress(treatment);
      expect(metrics.totalPlates).toBe(20); // max(20, 15)
      expect(metrics.progressPct).toBe(25); // 5/20 = 25%
      expect(metrics.platesRemaining).toBe(15);
      expect(metrics.estimatedWeeksRemaining).toBe(30); // 15 placas * 14 dias = 210 dias / 7 = 30 sem
      expect(metrics.needsDeliveryWarning).toBe(true); // Está no limite das placas entregues
      expect(metrics.isCompletedOrRefining).toBe(false);
    });

    it("deve avançar o paciente para a próxima placa e atualizar a data de troca", () => {
      saveAlignerTreatment(clinicId, patientId, {
        totalUpperPlates: 10,
        totalLowerPlates: 10,
        currentPlateNumber: 4,
        changeFrequencyDays: 10,
        nextChangeDate: "2026-11-10",
        status: "in_progress",
      });

      const advanced = advanceToNextPlate(clinicId, patientId);
      expect(advanced).not.toBeNull();
      expect(advanced?.currentPlateNumber).toBe(5);
      expect(advanced?.nextChangeDate).toBe("2026-11-20");
      expect(advanced?.status).toBe("in_progress");
    });

    it("deve alterar o status para refinement ao atingir a última placa planejada", () => {
      saveAlignerTreatment(clinicId, patientId, {
        totalUpperPlates: 6,
        totalLowerPlates: 6,
        currentPlateNumber: 5,
        changeFrequencyDays: 7,
        nextChangeDate: "2026-11-01",
        status: "in_progress",
      });

      const advanced = advanceToNextPlate(clinicId, patientId);
      expect(advanced?.currentPlateNumber).toBe(6);
      expect(advanced?.status).toBe("refinement");
    });
  });

  describe("Comunicação Automatizada: Lembrete de Alinhador no WhatsApp", () => {
    it("deve gerar mensagem de WhatsApp amigável com meta de uso e aviso de IPR pendente", () => {
      const treatment: ClearAlignerTreatment = {
        id: "aligner_wh",
        clinicId,
        patientId,
        patientName: "Fernanda Costa",
        brand: "Invisalign",
        totalUpperPlates: 18,
        totalLowerPlates: 14,
        currentPlateNumber: 4,
        deliveredPlatesCount: 8,
        changeFrequencyDays: 10,
        startDate: "2026-09-01",
        nextChangeDate: "2026-10-10",
        dailyWearHoursGoal: 22,
        status: "in_progress",
        attachmentsTeeth: [14, 24],
        iprSteps: [
          {
            id: "ipr_1",
            stageNumber: 4,
            teethRegion: "Entre 31 e 41",
            amountMm: 0.2,
            completed: false, // Pendente na placa atual (4)
          },
        ],
        updatedAt: new Date().toISOString(),
      };

      const msg = buildAlignerWhatsAppReminderMessage("Fernanda Costa", "Clínica Dental Prime", treatment);
      expect(msg).toContain("Fernanda Costa");
      expect(msg).toContain("Clínica Dental Prime");
      expect(msg).toContain("Invisalign");
      expect(msg).toContain("Placa Atual:* 4 de 18");
      expect(msg).toContain("22 horas por dia");
      expect(msg).toContain("Aviso Importante");
      expect(msg).toContain("Entre 31 e 41");
    });

    it("não deve incluir alerta de IPR se o procedimento já foi realizado ou não pertence à placa atual", () => {
      const treatment: ClearAlignerTreatment = {
        id: "aligner_wh_2",
        clinicId,
        patientId,
        patientName: "Rodrigo Lima",
        brand: "Smilink",
        totalUpperPlates: 12,
        totalLowerPlates: 12,
        currentPlateNumber: 2,
        deliveredPlatesCount: 4,
        changeFrequencyDays: 10,
        startDate: "2026-10-01",
        nextChangeDate: "2026-10-20",
        dailyWearHoursGoal: 22,
        status: "in_progress",
        attachmentsTeeth: [],
        iprSteps: [
          {
            id: "ipr_1",
            stageNumber: 6, // Previsto apenas para a placa 6
            teethRegion: "Entre 12 e 13",
            amountMm: 0.3,
            completed: false,
          },
        ],
        updatedAt: new Date().toISOString(),
      };

      const msg = buildAlignerWhatsAppReminderMessage("Rodrigo Lima", "Dental Prime", treatment);
      expect(msg).not.toContain("Aviso Importante");
      expect(msg).not.toContain("polimento/ajuste programado");
    });
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  authenticatePatientPortal,
  getSavedPatientPortalProfile,
  logoutPatientPortal,
  fetchPatientPortalAppointments,
  fetchPatientPortalDocuments,
  confirmPatientAppointment,
  fetchPatientPortalAlignerInfo,
  advancePatientAlignerPlate,
  fetchPatientPortalInvoices,
  checkInPatientArrival,
  getPatientPortalSettings,
  savePatientPortalSettings,
  POST_OP_GUIDES,
} from "../modules/patient-portal";

describe("Patient Portal & App Web do Paciente (PWA)", () => {
  const clinicId = "9605e213-26af-441b-bc60-29c655c95590";
  const patientId = "00000000-0000-0000-0000-000000000099";

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("Autenticação e Sessão Segura do Paciente", () => {
    it("should reject authentication if CPF has fewer than 11 digits", async () => {
      const result = await authenticatePatientPortal("123.456", "11988887777");
      expect(result.success).toBe(false);
      expect(result.error).toContain("CPF inválido");
    });

    it("should reject authentication if phone or birth date is empty", async () => {
      const result = await authenticatePatientPortal("123.456.789-00", "   ");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Informe o telefone");
    });

    it("should authenticate with CPF and phone and persist session profile", async () => {
      const result = await authenticatePatientPortal("123.456.789-00", "11987654321");
      expect(result.success).toBe(true);
      expect(result.profile).toBeDefined();
      expect(result.profile?.cpf).toBe("12345678900");

      const saved = getSavedPatientPortalProfile();
      expect(saved).not.toBeNull();
      expect(saved?.cpf).toBe("12345678900");
    });

    it("should clear session on logout", async () => {
      await authenticatePatientPortal("123.456.789-00", "11987654321");
      expect(getSavedPatientPortalProfile()).not.toBeNull();

      logoutPatientPortal();
      expect(getSavedPatientPortalProfile()).toBeNull();
    });
  });

  describe("Agendamentos e Documentos Clínicos Digitais", () => {
    it("should fetch patient appointments list with required fields", async () => {
      const appts = await fetchPatientPortalAppointments(patientId);
      expect(Array.isArray(appts)).toBe(true);
      expect(appts.length).toBeGreaterThan(0);

      const first = appts[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("starts_at");
      expect(first).toHaveProperty("procedure");
      expect(first).toHaveProperty("professional_name");
    });

    it("should fetch clinical documents with validation code and url", async () => {
      const docs = await fetchPatientPortalDocuments(patientId);
      expect(Array.isArray(docs)).toBe(true);
      expect(docs.length).toBeGreaterThan(0);

      const prescription = docs.find((d) => d.record_type === "prescription");
      expect(prescription).toBeDefined();
      expect(prescription?.validation_code).toBeDefined();
      expect(prescription?.title).toContain("Receituário");
    });

    it("should allow confirming appointment presence", async () => {
      const ok = await confirmPatientAppointment("demo-appt-1");
      expect(ok).toBe(true);
    });
  });

  describe("Acompanhamento de Alinhadores Invisíveis no App", () => {
    it("deve carregar dados de placas, meta de uso e dias até próxima troca", async () => {
      const info = await fetchPatientPortalAlignerInfo(clinicId, patientId);
      expect(info.hasTreatment).toBe(true);
      expect(info.totalPlates).toBeGreaterThan(0);
      expect(info.currentPlateNumber).toBeGreaterThanOrEqual(1);
      expect(info.dailyWearHoursGoal).toBe(22);
      expect(typeof info.daysUntilNextChange).toBe("number");
    });

    it("deve permitir que o paciente registre a troca de placa no aplicativo", () => {
      // Salva alinhador simulado no localStorage
      localStorage.setItem(
        `sondapro.ortho.aligners.${clinicId}_${patientId}`,
        JSON.stringify({
          brand: "Invisalign",
          totalUpperPlates: 15,
          totalLowerPlates: 15,
          currentPlateNumber: 3,
          changeFrequencyDays: 10,
          nextChangeDate: "2026-11-15",
        })
      );

      const ok = advancePatientAlignerPlate(clinicId, patientId);
      expect(ok).toBe(true);

      const updated = JSON.parse(
        localStorage.getItem(`sondapro.ortho.aligners.${clinicId}_${patientId}`) || "{}"
      );
      expect(updated.currentPlateNumber).toBe(4);
    });
  });

  describe("Faturas, Pix Copia e Cola e Autoatendimento Financeiro", () => {
    it("deve retornar faturas do paciente com código Pix Copia e Cola", async () => {
      const invs = await fetchPatientPortalInvoices(clinicId, patientId);
      expect(Array.isArray(invs)).toBe(true);
      expect(invs.length).toBeGreaterThan(0);

      const pending = invs.find((i) => i.status === "pending");
      expect(pending).toBeDefined();
      expect(pending?.value).toBeGreaterThan(0);
      expect(pending?.pixCopyPasteCode).toBeDefined();
      expect(pending?.pixCopyPasteCode?.startsWith("00020126")).toBe(true);
    });
  });

  describe("Check-in de Chegada do Paciente & Presença na Clínica", () => {
    it("deve registrar o check-in presencial do paciente e notificar recepção", async () => {
      const res = await checkInPatientArrival(clinicId, patientId, "João Victor da Silva");
      expect(res.success).toBe(true);
      expect(res.message).toContain("Check-in confirmado");

      const saved = localStorage.getItem(`sondapro.checkin.${clinicId}_${patientId}`);
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved || "{}");
      expect(parsed.patientName).toBe("João Victor da Silva");
      expect(parsed.timeStr).toBeDefined();
    });
  });

  describe("Manuais de Cuidados Pós-Operatórios & Configurações da Clínica", () => {
    it("deve conter guias estruturados com recomendações e proibições clínicas", () => {
      expect(POST_OP_GUIDES.length).toBeGreaterThanOrEqual(4);

      const surgery = POST_OP_GUIDES.find((g) => g.category === "Cirurgia");
      expect(surgery).toBeDefined();
      expect(surgery?.recommendations.length).toBeGreaterThan(0);
      expect(surgery?.warnings.some((w) => w.includes("bochechos"))).toBe(true);

      const alignerGuide = POST_OP_GUIDES.find((g) => g.category === "Ortodontia");
      expect(alignerGuide?.recommendations.some((r) => r.includes("20 a 22 horas"))).toBe(true);
    });

    it("deve gerenciar preferências e switches do Portal do Paciente da clínica", () => {
      const settings = getPatientPortalSettings(clinicId);
      expect(settings.switches.enablePatientPortal).toBe(true);
      expect(settings.switches.enableOnlineCheckin).toBe(true);
      expect(settings.switches.enableAlignerTracker).toBe(true);

      const updated = savePatientPortalSettings(clinicId, {
        pwaAppName: "Dental VIP",
        switches: {
          enablePatientPortal: true,
          enableOnlineCheckin: false,
          enableAlignerTracker: true,
          enableFinancialSelfService: true,
          enablePostOpGuides: true,
          enableAppointmentSchedulingRequest: true,
        },
      });

      expect(updated.pwaAppName).toBe("Dental VIP");
      expect(updated.switches.enableOnlineCheckin).toBe(false);

      const reloaded = getPatientPortalSettings(clinicId);
      expect(reloaded.pwaAppName).toBe("Dental VIP");
      expect(reloaded.switches.enableOnlineCheckin).toBe(false);
    });
  });
});

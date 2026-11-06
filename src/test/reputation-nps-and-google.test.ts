import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateNpsScore,
  getNpsCategory,
  getReputationSettings,
  saveReputationSettings,
  fetchClinicNpsFeedbacks,
  submitNpsFeedback,
  updateFeedbackStatus,
  buildGoogleReviewUrl,
  buildDetractorAlertWhatsAppUrl,
  DEFAULT_REPUTATION_SETTINGS,
  type NpsFeedback,
} from "@/modules/reputation";

describe("Reputação & Crescimento: Pesquisa NPS + Google Meu Negócio", () => {
  const testClinicId = "clinic-reputation-test-123";

  beforeEach(() => {
    localStorage.clear();
  });

  describe("Classificação de Categorias NPS (getNpsCategory)", () => {
    it("deve classificar notas 0 a 6 como Detratores", () => {
      for (let score = 0; score <= 6; score++) {
        expect(getNpsCategory(score)).toBe("detractor");
      }
    });

    it("deve classificar notas 7 e 8 como Neutros / Passivos", () => {
      expect(getNpsCategory(7)).toBe("passive");
      expect(getNpsCategory(8)).toBe("passive");
    });

    it("deve classificar notas 9 e 10 como Promotores", () => {
      expect(getNpsCategory(9)).toBe("promoter");
      expect(getNpsCategory(10)).toBe("promoter");
    });
  });

  describe("Cálculo do Score NPS e Zonas de Desempenho (calculateNpsScore)", () => {
    it("deve retornar score 0 e zona de aperfeiçoamento quando não houver avaliações", () => {
      const summary = calculateNpsScore([]);
      expect(summary.total).toBe(0);
      expect(summary.score).toBe(0);
      expect(summary.zone).toBe("Aperfeiçoamento");
      expect(summary.promotersPct).toBe(0);
      expect(summary.detractorsPct).toBe(0);
    });

    it("deve atingir +100 e Zona de Excelência quando todas as avaliações forem promotores", () => {
      const feedbacks: NpsFeedback[] = [
        { id: "1", clinicId: testClinicId, patientName: "João", score: 10, category: "promoter", status: "new", createdAt: new Date().toISOString() },
        { id: "2", clinicId: testClinicId, patientName: "Maria", score: 9, category: "promoter", status: "new", createdAt: new Date().toISOString() },
      ];
      const summary = calculateNpsScore(feedbacks);
      expect(summary.total).toBe(2);
      expect(summary.promotersCount).toBe(2);
      expect(summary.score).toBe(100);
      expect(summary.zone).toBe("Excelência");
      expect(summary.averageScore).toBe(9.5);
    });

    it("deve atingir -100 e Zona Crítica quando todas as avaliações forem detratores", () => {
      const feedbacks: NpsFeedback[] = [
        { id: "1", clinicId: testClinicId, patientName: "Carlos", score: 3, category: "detractor", status: "new", createdAt: new Date().toISOString() },
        { id: "2", clinicId: testClinicId, patientName: "Ana", score: 5, category: "detractor", status: "new", createdAt: new Date().toISOString() },
      ];
      const summary = calculateNpsScore(feedbacks);
      expect(summary.total).toBe(2);
      expect(summary.detractorsCount).toBe(2);
      expect(summary.score).toBe(-100);
      expect(summary.zone).toBe("Crítica");
    });

    it("deve calcular o NPS corretamente com mix de promotores, neutros e detratores", () => {
      // 10 respostas: 6 promotores (60%), 2 neutros (20%), 2 detratores (20%) -> NPS = 60 - 20 = 40 (Zona de Qualidade)
      const feedbacks: NpsFeedback[] = [
        { id: "1", clinicId: testClinicId, patientName: "P1", score: 10, category: "promoter", status: "new", createdAt: new Date().toISOString() },
        { id: "2", clinicId: testClinicId, patientName: "P2", score: 10, category: "promoter", status: "new", createdAt: new Date().toISOString() },
        { id: "3", clinicId: testClinicId, patientName: "P3", score: 9, category: "promoter", status: "new", createdAt: new Date().toISOString() },
        { id: "4", clinicId: testClinicId, patientName: "P4", score: 9, category: "promoter", status: "new", createdAt: new Date().toISOString() },
        { id: "5", clinicId: testClinicId, patientName: "P5", score: 10, category: "promoter", status: "new", createdAt: new Date().toISOString() },
        { id: "6", clinicId: testClinicId, patientName: "P6", score: 9, category: "promoter", status: "new", createdAt: new Date().toISOString() },
        { id: "7", clinicId: testClinicId, patientName: "P7", score: 8, category: "passive", status: "new", createdAt: new Date().toISOString() },
        { id: "8", clinicId: testClinicId, patientName: "P8", score: 7, category: "passive", status: "new", createdAt: new Date().toISOString() },
        { id: "9", clinicId: testClinicId, patientName: "P9", score: 4, category: "detractor", status: "new", createdAt: new Date().toISOString() },
        { id: "10", clinicId: testClinicId, patientName: "P10", score: 2, category: "detractor", status: "new", createdAt: new Date().toISOString() },
      ];
      const summary = calculateNpsScore(feedbacks);
      expect(summary.total).toBe(10);
      expect(summary.promotersCount).toBe(6);
      expect(summary.passivesCount).toBe(2);
      expect(summary.detractorsCount).toBe(2);
      expect(summary.score).toBe(40);
      expect(summary.zone).toBe("Qualidade");
    });
  });

  describe("Configurações com Switches de Ativar e Desativar", () => {
    it("deve carregar configurações padrão quando não houver registro prévio", () => {
      const settings = getReputationSettings(testClinicId);
      expect(settings).toBeDefined();
      expect(settings.clinicId).toBe(testClinicId);
      expect(settings.enabled).toBe(true);
      expect(settings.enableGoogleRedirectForPromoters).toBe(true);
      expect(settings.enableManagerAlertOnDetractor).toBe(true);
      expect(settings.autoSendAfterAppointment).toBe(true);
      expect(settings.minimumScoreForGoogle).toBe(9);
    });

    it("deve permitir desativar ou reativar switches individualmente e persistir", () => {
      saveReputationSettings(testClinicId, {
        enabled: false,
        enableGoogleRedirectForPromoters: false,
        enableManagerAlertOnDetractor: false,
        minimumScoreForGoogle: 10,
        googlePlaceId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
        googleReviewUrl: "https://g.page/r/sondapro/review",
        managerWhatsAppPhone: "11988887777",
      });

      const updated = getReputationSettings(testClinicId);
      expect(updated.enabled).toBe(false);
      expect(updated.enableGoogleRedirectForPromoters).toBe(false);
      expect(updated.enableManagerAlertOnDetractor).toBe(false);
      expect(updated.minimumScoreForGoogle).toBe(10);
      expect(updated.googleReviewUrl).toBe("https://g.page/r/sondapro/review");
      expect(updated.managerWhatsAppPhone).toBe("11988887777");
    });
  });

  describe("Submissão de Feedback e Gestão de Detratores", () => {
    it("deve submeter feedback de promotor e salvar no histórico", async () => {
      const feedback = await submitNpsFeedback(testClinicId, {
        patientName: "Lucas Mendes",
        patientPhone: "11999990001",
        score: 10,
        comment: "Excelente atendimento dos dentistas e recepcionistas!",
        professionalName: "Dra. Paula",
      });

      expect(feedback.id).toBeDefined();
      expect(feedback.category).toBe("promoter");
      expect(feedback.score).toBe(10);
      expect(feedback.status).toBe("new");

      const feedbacks = await fetchClinicNpsFeedbacks(testClinicId);
      expect(feedbacks.length).toBe(1);
      expect(feedbacks[0].patientName).toBe("Lucas Mendes");
    });

    it("deve submeter detrator e permitir atualização de status com acolhimento pelo gestor", async () => {
      const detractor = await submitNpsFeedback(testClinicId, {
        patientName: "Roberto Lima",
        patientPhone: "11999990002",
        score: 4,
        comment: "Demorou muito para ser atendido na recepção.",
      });

      expect(detractor.category).toBe("detractor");

      // Gestor entra em contato e resolve a insatisfação
      const resolved = await updateFeedbackStatus(
        testClinicId,
        detractor.id,
        "resolved",
        "Ligamos para o paciente, pedimos desculpas pela espera e concedemos limpeza profilática de cortesia."
      );

      expect(resolved?.status).toBe("resolved");
      expect(resolved?.resolutionNotes).toContain("cortesia");

      const list = await fetchClinicNpsFeedbacks(testClinicId);
      expect(list[0].status).toBe("resolved");
      expect(list[0].resolvedAt).toBeDefined();
    });
  });

  describe("Links de Redirecionamento e Alerta WhatsApp", () => {
    it("deve gerar URL do Google Meu Negócio corretamente", () => {
      const url = buildGoogleReviewUrl("https://g.page/r/sondapro/review");
      expect(url).toBe("https://g.page/r/sondapro/review");

      const fallback = buildGoogleReviewUrl("");
      expect(fallback).toContain("google.com/search?q=");
    });

    it("deve gerar URL do WhatsApp com alerta de detrator para o gestor", () => {
      const detractor: NpsFeedback = {
        id: "det-1",
        clinicId: testClinicId,
        patientName: "Julia Ramos",
        patientPhone: "11977778888",
        score: 3,
        category: "detractor",
        comment: "Aparelho quebrou no mesmo dia.",
        status: "new",
        createdAt: new Date().toISOString(),
      };

      const waUrl = buildDetractorAlertWhatsAppUrl("11999998888", detractor, "Odonto Excellence");
      expect(waUrl).toContain("https://wa.me/5511999998888");
      expect(waUrl).toContain("ALERTA+IMEDIATO+NPS");
      expect(waUrl).toContain("Julia+Ramos");
      expect(waUrl).toContain("Nota%3A+3%2F10");
    });
  });
});

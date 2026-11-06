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
  type NpsFeedbackRecord,
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

    it("deve classificar notas 7 e 8 como Neutros", () => {
      expect(getNpsCategory(7)).toBe("neutral");
      expect(getNpsCategory(8)).toBe("neutral");
    });

    it("deve classificar notas 9 e 10 como Promotores", () => {
      expect(getNpsCategory(9)).toBe("promoter");
      expect(getNpsCategory(10)).toBe("promoter");
    });
  });

  describe("Cálculo do Score NPS e Zonas de Desempenho (calculateNpsScore)", () => {
    it("deve retornar métricas padrão quando não houver avaliações", () => {
      const summary = calculateNpsScore([]);
      expect(summary.totalCount).toBe(0);
      expect(summary.npsScore).toBe(100);
      expect(summary.zone).toBe("excellence");
    });

    it("deve atingir +100 e Zona de Excelência quando todas as avaliações forem promotores", () => {
      const feedbacks: NpsFeedbackRecord[] = [
        {
          id: "1",
          clinicId: testClinicId,
          patientName: "João",
          score: 10,
          category: "promoter",
          redirectedToGoogle: true,
          status: "resolved",
          managerAlertSent: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: "2",
          clinicId: testClinicId,
          patientName: "Maria",
          score: 9,
          category: "promoter",
          redirectedToGoogle: true,
          status: "resolved",
          managerAlertSent: false,
          createdAt: new Date().toISOString(),
        },
      ];
      const summary = calculateNpsScore(feedbacks);
      expect(summary.totalCount).toBe(2);
      expect(summary.promotersPct).toBe(100);
      expect(summary.detractorsPct).toBe(0);
      expect(summary.npsScore).toBe(100);
      expect(summary.zone).toBe("excellence");
      expect(summary.averageRating).toBe(9.5);
    });

    it("deve atingir -100 e Zona Crítica quando todas as avaliações forem detratores", () => {
      const feedbacks: NpsFeedbackRecord[] = [
        {
          id: "1",
          clinicId: testClinicId,
          patientName: "Carlos",
          score: 3,
          category: "detractor",
          redirectedToGoogle: false,
          status: "new",
          managerAlertSent: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: "2",
          clinicId: testClinicId,
          patientName: "Ana",
          score: 5,
          category: "detractor",
          redirectedToGoogle: false,
          status: "new",
          managerAlertSent: true,
          createdAt: new Date().toISOString(),
        },
      ];
      const summary = calculateNpsScore(feedbacks);
      expect(summary.totalCount).toBe(2);
      expect(summary.detractorsPct).toBe(100);
      expect(summary.promotersPct).toBe(0);
      expect(summary.npsScore).toBe(-100);
      expect(summary.zone).toBe("critical");
    });

    it("deve calcular o NPS corretamente com mix de promotores, neutros e detratores", () => {
      // 10 respostas: 6 promotores (60%), 2 neutros (20%), 2 detratores (20%) -> NPS = 60 - 20 = 40 (Zone improvement)
      const feedbacks: NpsFeedbackRecord[] = [
        { id: "1", clinicId: testClinicId, patientName: "P1", score: 10, category: "promoter", redirectedToGoogle: true, status: "resolved", managerAlertSent: false, createdAt: new Date().toISOString() },
        { id: "2", clinicId: testClinicId, patientName: "P2", score: 10, category: "promoter", redirectedToGoogle: true, status: "resolved", managerAlertSent: false, createdAt: new Date().toISOString() },
        { id: "3", clinicId: testClinicId, patientName: "P3", score: 9, category: "promoter", redirectedToGoogle: true, status: "resolved", managerAlertSent: false, createdAt: new Date().toISOString() },
        { id: "4", clinicId: testClinicId, patientName: "P4", score: 9, category: "promoter", redirectedToGoogle: true, status: "resolved", managerAlertSent: false, createdAt: new Date().toISOString() },
        { id: "5", clinicId: testClinicId, patientName: "P5", score: 10, category: "promoter", redirectedToGoogle: true, status: "resolved", managerAlertSent: false, createdAt: new Date().toISOString() },
        { id: "6", clinicId: testClinicId, patientName: "P6", score: 9, category: "promoter", redirectedToGoogle: true, status: "resolved", managerAlertSent: false, createdAt: new Date().toISOString() },
        { id: "7", clinicId: testClinicId, patientName: "P7", score: 8, category: "neutral", redirectedToGoogle: false, status: "contacted", managerAlertSent: false, createdAt: new Date().toISOString() },
        { id: "8", clinicId: testClinicId, patientName: "P8", score: 7, category: "neutral", redirectedToGoogle: false, status: "contacted", managerAlertSent: false, createdAt: new Date().toISOString() },
        { id: "9", clinicId: testClinicId, patientName: "P9", score: 4, category: "detractor", redirectedToGoogle: false, status: "new", managerAlertSent: true, createdAt: new Date().toISOString() },
        { id: "10", clinicId: testClinicId, patientName: "P10", score: 2, category: "detractor", redirectedToGoogle: false, status: "new", managerAlertSent: true, createdAt: new Date().toISOString() },
      ];
      const summary = calculateNpsScore(feedbacks);
      expect(summary.totalCount).toBe(10);
      expect(summary.promotersPct).toBe(60);
      expect(summary.neutralsPct).toBe(20);
      expect(summary.detractorsPct).toBe(20);
      expect(summary.npsScore).toBe(40);
      expect(summary.zone).toBe("improvement");
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
        googleReviewUrl: "https://g.page/r/sondapro/review",
        managerAlertPhone: "11988887777",
      });

      const updated = getReputationSettings(testClinicId);
      expect(updated.enabled).toBe(false);
      expect(updated.enableGoogleRedirectForPromoters).toBe(false);
      expect(updated.enableManagerAlertOnDetractor).toBe(false);
      expect(updated.minimumScoreForGoogle).toBe(10);
      expect(updated.googleReviewUrl).toBe("https://g.page/r/sondapro/review");
      expect(updated.managerAlertPhone).toBe("11988887777");
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
      expect(feedback.status).toBe("resolved");

      const feedbacks = fetchClinicNpsFeedbacks(testClinicId);
      expect(feedbacks.length).toBeGreaterThan(0);
      expect(feedbacks[0]?.patientName).toBe("Lucas Mendes");
    });

    it("deve submeter detrator e permitir atualização de status com acolhimento pelo gestor", async () => {
      const detractor = await submitNpsFeedback(testClinicId, {
        patientName: "Roberto Lima",
        patientPhone: "11999990002",
        score: 4,
        comment: "Demorou muito para ser atendido na recepção.",
      });

      expect(detractor.category).toBe("detractor");
      expect(detractor.status).toBe("new");

      // Gestor entra em contato e resolve a insatisfação
      const resolved = updateFeedbackStatus(
        testClinicId,
        detractor.id,
        "resolved",
        "Ligamos para o paciente, pedimos desculpas pela espera e concedemos limpeza profilática de cortesia."
      );

      expect(resolved).not.toBeNull();
      expect(resolved?.status).toBe("resolved");
      expect(resolved?.resolutionNotes).toContain("cortesia");

      const list = fetchClinicNpsFeedbacks(testClinicId);
      const found = list.find((f) => f.id === detractor.id);
      expect(found?.status).toBe("resolved");
      expect(found?.resolvedAt).toBeDefined();
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
      const detractor: NpsFeedbackRecord = {
        id: "det-1",
        clinicId: testClinicId,
        patientName: "Julia Ramos",
        patientPhone: "11977778888",
        score: 3,
        category: "detractor",
        comment: "Aparelho quebrou no mesmo dia.",
        redirectedToGoogle: false,
        status: "new",
        managerAlertSent: true,
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

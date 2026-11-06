import { describe, it, expect, beforeEach } from "vitest";
import {
  getClinicPerformanceSettings,
  saveClinicPerformanceSettings,
  calculateExecutivePerformanceKpis,
  calculateDoctorPerformanceRanking,
  calculateTreatmentFunnel,
  generateWeeklyChairOccupancy,
  generatePerformanceAiInsights,
  DEFAULT_PERFORMANCE_GOALS,
  DEFAULT_PERFORMANCE_SWITCHES,
} from "@/modules/performance";

describe("Dashboards Gerenciais de Performance da Clínica", () => {
  const testClinicId = "clinic-performance-test-789";

  beforeEach(() => {
    localStorage.clear();
  });

  describe("Configurações de Metas e Switches (Ativar/Desativar)", () => {
    it("deve carregar metas e switches padrão quando não houver registro prévio", () => {
      const settings = getClinicPerformanceSettings(testClinicId);
      expect(settings).toBeDefined();
      expect(settings.clinicId).toBe(testClinicId);
      expect(settings.goals.monthlyRevenueGoal).toBe(DEFAULT_PERFORMANCE_GOALS.monthlyRevenueGoal);
      expect(settings.goals.conversionRateGoal).toBe(DEFAULT_PERFORMANCE_GOALS.conversionRateGoal);
      expect(settings.switches.enableGoalsTracking).toBe(true);
      expect(settings.switches.enableAiInsights).toBe(true);
      expect(settings.switches.enableNoShowAlerts).toBe(true);
    });

    it("deve salvar e atualizar metas personalizadas e switches", () => {
      saveClinicPerformanceSettings(testClinicId, {
        goals: {
          ...DEFAULT_PERFORMANCE_GOALS,
          monthlyRevenueGoal: 120000,
          conversionRateGoal: 75,
          maxNoShowRateLimit: 8,
        },
        switches: {
          ...DEFAULT_PERFORMANCE_SWITCHES,
          enableNoShowAlerts: false,
        },
      });

      const updated = getClinicPerformanceSettings(testClinicId);
      expect(updated.goals.monthlyRevenueGoal).toBe(120000);
      expect(updated.goals.conversionRateGoal).toBe(75);
      expect(updated.goals.maxNoShowRateLimit).toBe(8);
      expect(updated.switches.enableNoShowAlerts).toBe(false);
      expect(updated.switches.enableGoalsTracking).toBe(true);
    });
  });

  describe("Cálculo de KPIs Executivos (calculateExecutivePerformanceKpis)", () => {
    it("deve calcular faturamento, progresso de meta e margem líquida", () => {
      const financialEntries = [
        { amount: 35000, entry_type: "income" as const, status: "paid" },
        { amount: 15000, entry_type: "income" as const, status: "paid" },
        { amount: 12000, entry_type: "expense" as const, status: "paid" },
      ];

      const goals = {
        ...DEFAULT_PERFORMANCE_GOALS,
        monthlyRevenueGoal: 100000,
      };

      const kpis = calculateExecutivePerformanceKpis({
        financialEntries,
        goals,
        previousPeriodRevenue: 40000,
      });

      expect(kpis.grossRevenue).toBe(50000);
      expect(kpis.netRevenue).toBe(38000);
      expect(kpis.revenueGoalProgressPct).toBe(50); // 50.000 de 100.000 = 50%
      expect(kpis.revenueGrowthPct).toBe(25); // +25% vs 40.000
    });

    it("deve calcular taxas de comparecimento, ausência (no-show) e cancelamentos", () => {
      const appointments = [
        { id: "1", starts_at: "2026-11-01T10:00:00Z", status: "completed", price: 300 },
        { id: "2", starts_at: "2026-11-01T11:00:00Z", status: "completed", price: 400 },
        { id: "3", starts_at: "2026-11-01T14:00:00Z", status: "completed", price: 500 },
        { id: "4", starts_at: "2026-11-01T15:00:00Z", status: "no_show", price: 0 },
        { id: "5", starts_at: "2026-11-01T16:00:00Z", status: "cancelled", price: 0 },
      ];

      const kpis = calculateExecutivePerformanceKpis({ appointments });

      expect(kpis.totalAppointments).toBe(5);
      expect(kpis.completedAppointments).toBe(3);
      expect(kpis.noShowCount).toBe(1);
      expect(kpis.noShowRatePct).toBe(20); // 1 de 5 = 20%
      expect(kpis.attendanceRatePct).toBe(60); // 3 de 5 = 60%
    });

    it("deve calcular recorrência e ticket médio por paciente", () => {
      const appointments = [
        { id: "1", starts_at: "2026-11-01", status: "completed", price: 1000, patient_id: "pat_A" },
        { id: "2", starts_at: "2026-11-02", status: "completed", price: 500, patient_id: "pat_A" },
        { id: "3", starts_at: "2026-11-03", status: "completed", price: 1500, patient_id: "pat_B" },
      ];

      const kpis = calculateExecutivePerformanceKpis({ appointments });

      expect(kpis.grossRevenue).toBe(3000);
      expect(kpis.newPatientsCount).toBe(1); // pat_B tem 1 consulta
      expect(kpis.returningPatientsCount).toBe(1); // pat_A tem 2 consultas
      expect(kpis.averageTicketPerPatient).toBe(1500); // 3000 / 2 pacientes
    });

    it("deve calcular taxa de conversão e ticket de orçamentos odontológicos", () => {
      const treatmentPlans = [
        { id: "p1", status: "approved", totalAmount: 5000 },
        { id: "p2", status: "in_progress", totalAmount: 3000 },
        { id: "p3", status: "draft", totalAmount: 2000 },
        { id: "p4", status: "cancelled", totalAmount: 4000 },
      ];

      const kpis = calculateExecutivePerformanceKpis({ treatmentPlans });

      expect(kpis.totalBudgetsCount).toBe(4);
      expect(kpis.approvedBudgetsCount).toBe(2);
      expect(kpis.budgetConversionRatePct).toBe(50); // 2 de 4 = 50%
      expect(kpis.totalBudgetValueProposed).toBe(14000);
      expect(kpis.totalBudgetValueApproved).toBe(8000);
      expect(kpis.averageApprovedBudgetValue).toBe(4000); // 8000 / 2
    });
  });

  describe("Ranking e Produtividade da Equipe Clínica (calculateDoctorPerformanceRanking)", () => {
    it("deve ranquear dentistas por faturamento gerado e apurar comissões", () => {
      const professionals = [
        { id: "d1", name: "Dra. Juliana Ortho", specialty: "Ortodontia", commission_pct: 40 },
        { id: "d2", name: "Dr. André Implante", specialty: "Implantodontia", commission_pct: 50 },
      ];

      const appointments = [
        { professional_id: "d1", status: "completed", price: 2000 },
        { professional_id: "d1", status: "completed", price: 3000 },
        { professional_id: "d2", status: "completed", price: 12000 },
      ];

      const treatmentPlans = [
        { professional_id: "d1", status: "approved", totalAmount: 5000 },
        { professional_id: "d2", status: "approved", totalAmount: 12000 },
        { professional_id: "d2", status: "draft", totalAmount: 6000 },
      ];

      const ranking = calculateDoctorPerformanceRanking({
        professionals,
        appointments,
        treatmentPlans,
      });

      expect(ranking.length).toBe(2);
      // Dr. André deve ser o 1º colocado (R$ 12.000 vs R$ 5.000)
      expect(ranking[0]?.professionalName).toBe("Dr. André Implante");
      expect(ranking[0]?.totalRevenueGenerated).toBe(12000);
      expect(ranking[0]?.estimatedCommissions).toBe(6000); // 50% de 12.000
      expect(ranking[0]?.conversionRatePct).toBe(50); // 1 de 2 aprovado

      // Dra. Juliana em 2º
      expect(ranking[1]?.professionalName).toBe("Dra. Juliana Ortho");
      expect(ranking[1]?.totalRevenueGenerated).toBe(5000);
      expect(ranking[1]?.estimatedCommissions).toBe(2000); // 40% de 5.000
      expect(ranking[1]?.conversionRatePct).toBe(100); // 1 de 1 aprovado
    });
  });

  describe("Funil de Tratamentos e Ocupação Semanal", () => {
    it("deve agrupar as 5 etapas do funil de conversão", () => {
      const plans = [
        { status: "draft", totalAmount: 1500 },
        { status: "approved", totalAmount: 4500 },
        { status: "completed", totalAmount: 6000 },
        { status: "cancelled", totalAmount: 2000 },
      ];

      const funnel = calculateTreatmentFunnel(plans);
      expect(funnel.length).toBe(5);
      expect(funnel.find((s) => s.stage === "proposed")?.count).toBe(4);
      expect(funnel.find((s) => s.stage === "negotiating")?.count).toBe(1);
      expect(funnel.find((s) => s.stage === "approved")?.count).toBe(1);
      expect(funnel.find((s) => s.stage === "completed")?.count).toBe(1);
      expect(funnel.find((s) => s.stage === "lost")?.count).toBe(1);
    });

    it("deve gerar ocupação de cadeiras para os 6 dias úteis", () => {
      const occupancy = generateWeeklyChairOccupancy(50, 4);
      expect(occupancy.length).toBe(6);
      expect(occupancy[0]?.dayLabel).toBe("Segunda");
      expect(occupancy[5]?.dayLabel).toBe("Sábado");
      expect(occupancy[0]?.totalAvailableHours).toBe(32); // 4 consultórios * 8h
      expect(occupancy[5]?.totalAvailableHours).toBe(20); // 4 consultórios * 5h
    });
  });

  describe("Diagnóstico e Insights da Inteligência Artificial", () => {
    it("deve gerar insights de oportunidade quando a conversão for baixa ou no-show alto", () => {
      const kpis = {
        grossRevenue: 40000,
        netRevenue: 30000,
        revenueGoalProgressPct: 40,
        previousPeriodRevenue: 50000,
        revenueGrowthPct: -20,
        totalAppointments: 100,
        completedAppointments: 75,
        scheduledAppointments: 10,
        noShowCount: 15,
        noShowRatePct: 15, // Acima da meta de 10%
        cancelledCount: 10,
        attendanceRatePct: 75,
        newPatientsCount: 20,
        returningPatientsCount: 30,
        recurrenceRatePct: 60,
        averageTicketPerPatient: 800,
        chairOccupancyRatePct: 55, // Ocioso
        totalChairHoursOperated: 65,
        revenuePerHourChair: 615,
        totalBudgetsCount: 20,
        approvedBudgetsCount: 8,
        pendingBudgetsCount: 8,
        lostBudgetsCount: 4,
        budgetConversionRatePct: 40, // Abaixo da meta de 65%
        totalBudgetValueProposed: 80000,
        totalBudgetValueApproved: 32000,
        averageApprovedBudgetValue: 4000,
      };

      const insights = generatePerformanceAiInsights(kpis, DEFAULT_PERFORMANCE_GOALS);
      expect(insights.length).toBeGreaterThan(0);

      // Deve alertar sobre no-show alto
      const noShowAlert = insights.find((i) => i.id === "noshow_high");
      expect(noShowAlert).toBeDefined();
      expect(noShowAlert?.type).toBe("alert");

      // Deve sugerir oportunidade de recuperação de orçamentos
      const conversionOpp = insights.find((i) => i.id === "conversion_opportunity");
      expect(conversionOpp).toBeDefined();
      expect(conversionOpp?.type).toBe("opportunity");

      // Deve sugerir ociosidade de cadeiras
      const chairIdle = insights.find((i) => i.id === "chair_idle");
      expect(chairIdle).toBeDefined();
      expect(chairIdle?.type).toBe("opportunity");
    });
  });
});


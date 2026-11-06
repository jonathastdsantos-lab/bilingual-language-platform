/**
 * Tipos e Interfaces para os Dashboards Gerenciais de Performance da Clínica Odontológica
 */

export type PerformancePeriod = "today" | "7d" | "30d" | "month" | "quarter" | "year";

export interface ClinicPerformanceGoals {
  monthlyRevenueGoal: number; // Meta de Faturamento Mensal em BRL (ex: 100.000)
  newPatientsGoal: number; // Meta de Novos Pacientes (ex: 50)
  conversionRateGoal: number; // Meta de Conversão de Orçamentos em % (ex: 70)
  maxNoShowRateLimit: number; // Limite máximo tolerável de No-Show em % (ex: 10)
  chairOccupancyGoal: number; // Meta de ocupação de cadeiras em % (ex: 80)
  averageTicketGoal: number; // Meta de ticket médio por paciente em BRL (ex: 1.200)
}

export interface ClinicPerformanceSwitches {
  enableGoalsTracking: boolean; // Ativar/Desativar Acompanhamento de Metas
  enableComparativeMode: boolean; // Ativar/Desativar Comparativo vs Período Anterior
  enableAiInsights: boolean; // Ativar/Desativar Diagnóstico e Recomendações de IA
  enableNoShowAlerts: boolean; // Ativar/Desativar Alertas de Absenteísmo Crítico
  enableDoctorRanking: boolean; // Ativar/Desativar Ranking de Produtividade da Equipe
}

export interface ClinicPerformanceSettings {
  clinicId: string;
  goals: ClinicPerformanceGoals;
  switches: ClinicPerformanceSwitches;
  updatedAt: string;
}

export interface ExecutiveKpiSummary {
  grossRevenue: number;
  netRevenue: number;
  revenueGoalProgressPct: number;
  previousPeriodRevenue: number;
  revenueGrowthPct: number;

  totalAppointments: number;
  completedAppointments: number;
  scheduledAppointments: number;
  noShowCount: number;
  noShowRatePct: number;
  cancelledCount: number;
  attendanceRatePct: number;

  newPatientsCount: number;
  returningPatientsCount: number;
  recurrenceRatePct: number;

  averageTicketPerPatient: number;
  chairOccupancyRatePct: number;
  totalChairHoursOperated: number;
  revenuePerHourChair: number;

  totalBudgetsCount: number;
  approvedBudgetsCount: number;
  pendingBudgetsCount: number;
  lostBudgetsCount: number;
  budgetConversionRatePct: number;
  totalBudgetValueProposed: number;
  totalBudgetValueApproved: number;
  averageApprovedBudgetValue: number;
}

export interface DoctorPerformanceMetric {
  professionalId: string;
  professionalName: string;
  specialty?: string | undefined;
  completedAppointments: number;
  totalRevenueGenerated: number;
  estimatedCommissions: number;
  ticketMedio: number;
  budgetsProposed: number;
  budgetsApproved: number;
  conversionRatePct: number;
}

export interface ChairOccupancyDayMetric {
  dayLabel: string;
  occupiedHours: number;
  totalAvailableHours: number;
  occupancyPct: number;
}

export interface TreatmentFunnelStage {
  stage: "proposed" | "negotiating" | "approved" | "completed" | "lost";
  label: string;
  count: number;
  totalAmount: number;
  color: string;
}

export interface PatientRetentionCohort {
  cohortName: string;
  newPatients: number;
  returnedIn30Days: number;
  returnedIn90Days: number;
  returnedIn180Days: number;
  retentionRate180DaysPct: number;
}

export interface PerformanceAiInsight {
  id: string;
  type: "strength" | "opportunity" | "alert";
  title: string;
  description: string;
  metricLabel: string;
  actionableRecommendation: string;
}
